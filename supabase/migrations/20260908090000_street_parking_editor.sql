-- Extend the existing parkings.street_path / road_line model; no duplicate table.
-- Apply before deploying the new web assets. The entire migration is atomic.
begin;
alter table public.parkings add column if not exists street_details jsonb not null default '{}'::jsonb;

create or replace function public.parkly_street_geometry(p_path jsonb)
returns public.geometry language plpgsql immutable set search_path=public as $$
declare v jsonb; pts public.geometry[] := '{}'; previous public.geometry; g public.geometry;
begin
  if p_path is null then return null; end if;
  if jsonb_typeof(p_path) is distinct from 'array' then raise exception 'Линия должна быть массивом'; end if;
  if jsonb_array_length(p_path) not between 2 and 200 then raise exception 'Линия: от 2 до 200 вершин'; end if;
  for v in select value from jsonb_array_elements(p_path) loop
    if jsonb_typeof(v) is distinct from 'array' then raise exception 'Некорректная вершина'; end if;
    if jsonb_array_length(v)<>2 or jsonb_typeof(v->0) is distinct from 'number' or jsonb_typeof(v->1) is distinct from 'number' then raise exception 'Координаты должны быть числами'; end if;
    if (v->>0)::numeric not between -90 and 90 or (v->>1)::numeric not between -180 and 180 then raise exception 'Координаты вне допустимого диапазона'; end if;
    g:=st_setsrid(st_makepoint((v->>1)::float8,(v->>0)::float8),4326);
    if previous is not null and (st_distance(previous::geography,g::geography)<=0.1 or abs(st_x(previous)-st_x(g))>=180) then raise exception 'Соседние вершины должны отличаться'; end if;
    pts:=array_append(pts,g); previous:=g;
  end loop;
  g:=st_makeline(pts);
  if st_length(g::geography)>50000 then raise exception 'Разделите участок: максимальная длина 50 км'; end if;
  return g;
end $$;

create or replace function public.parkly_sync_street_geometry()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.category='STREET_ALLOWED' then
    new.road_line:=public.parkly_street_geometry(new.street_path)::geography;
    if new.road_line is not null then new.location:=st_startpoint(new.road_line::geometry)::geography; end if;
  elsif tg_op='UPDATE' then
    if old.category='STREET_ALLOWED' then new.street_path:=null; new.road_line:=null; new.street_details:='{}'; end if;
  end if;
  return new;
end $$;
drop trigger if exists parkly_sync_street_geometry on public.parkings;
create trigger parkly_sync_street_geometry before insert or update of street_path,category on public.parkings
for each row execute function public.parkly_sync_street_geometry();

-- Deferred so main fields + line + rules can be saved together in one RPC.
-- Reads the final row, not an intermediate NEW snapshot. Also guards legacy RPCs.
create or replace function public.parkly_guard_street_publication()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.parkings;
begin
  select * into p from public.parkings where id=new.id;
  if p.category='STREET_ALLOWED' and p.status='APPROVED' then
    if p.street_path is null or p.price_type::text not in ('free','paid') or coalesce(p.street_details->>'parking_side','') not in ('left','right','both') then
      raise exception 'Уличный участок: перед публикацией нарисуйте линию, укажите сторону и известную стоимость';
    end if;
    perform public.parkly_street_geometry(p.street_path);
  end if;
  return null;
end $$;
drop trigger if exists parkly_guard_street_publication on public.parkings;
create constraint trigger parkly_guard_street_publication after insert or update on public.parkings
deferrable initially deferred for each row execute function public.parkly_guard_street_publication();

create or replace function public.admin_save_street_parking(p_data jsonb,p_access jsonb,p_path jsonb,p_details jsonb,p_legal_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; details jsonb; k text;
begin
  if not public.parkly_is_admin() then raise exception 'Admin access required'; end if;
  if p_data->>'category' is distinct from 'STREET_ALLOWED' then raise exception 'Ожидается уличный участок'; end if;
  if p_path is null then raise exception 'Нарисуйте участок'; end if;
  perform public.parkly_street_geometry(p_path);
  if jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Укажите правила участка'; end if;
  if coalesce(p_details->>'parking_side','') not in ('','left','right','both') then raise exception 'Некорректная сторона'; end if;
  if coalesce(p_details->>'parking_orientation','unspecified') not in ('parallel','perpendicular','angled','partly_sidewalk','fully_sidewalk','according_to_sign','other','unspecified') then raise exception 'Некорректный способ постановки'; end if;
  details:='{}';
  foreach k in array array['parking_side','parking_orientation','street_days','street_restrictions','street_notes'] loop
    if length(coalesce(p_details->>k,''))>1000 then raise exception 'Слишком длинное описание'; end if;
    details:=details||jsonb_build_object(k,coalesce(p_details->>k,''));
  end loop;
  v_id:=public.admin_save_parking(p_data||jsonb_build_object('lat',p_path->0->0,'lng',p_path->0->1,'kind','street'));
  perform public.admin_save_parking_access(v_id,p_access);
  perform public.admin_set_parking_street_path(v_id,p_path,p_legal_note);
  update public.parkings set street_details=details where id=v_id;
  return v_id;
end $$;
revoke all on function public.admin_save_street_parking(jsonb,jsonb,jsonb,jsonb,text) from public,anon;
grant execute on function public.admin_save_street_parking(jsonb,jsonb,jsonb,jsonb,text) to authenticated;

alter table public.parking_photos drop constraint if exists parking_photos_type_check;
alter table public.parking_photos add constraint parking_photos_type_check check(photo_type in
 ('general','entrance','exit','barrier','tariff','rules','ev','other','parking_sign','orientation','start','end','overview','restrictions'));

-- Retains all storage ownership/path checks from the existing photo RPC.
create or replace function public.admin_save_street_photo(p_parking_id uuid,p_photo_id uuid,p_storage_bucket text,p_storage_path text,p_public_url text,p_photo_type text,p_caption text,p_sort_order integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.parkly_is_admin() then raise exception 'Admin access required'; end if;
  if p_photo_type is null or p_photo_type not in ('parking_sign','orientation','start','end','overview','restrictions') then raise exception 'Unsupported street photo type'; end if;
  if not exists(select 1 from public.parkings where id=p_parking_id and category='STREET_ALLOWED') then raise exception 'Фото должно принадлежать уличному участку'; end if;
  v_id:=public.admin_save_parking_photo(p_parking_id,p_photo_id,p_storage_bucket,p_storage_path,p_public_url,'other',p_caption,p_sort_order);
  update public.parking_photos set photo_type=p_photo_type where id=v_id;
  return v_id;
end $$;
revoke all on function public.admin_save_street_photo(uuid,uuid,text,text,text,text,text,integer) from public,anon;
grant execute on function public.admin_save_street_photo(uuid,uuid,text,text,text,text,text,integer) to authenticated;

create or replace function public.street_parking_segments_v2()
returns table(parking_id uuid,path jsonb,legal_note text,details jsonb,length_m double precision,photos jsonb)
language sql stable security definer set search_path=public as $$
  select p.id,p.street_path,p.legal_note,p.street_details,
    case when p.road_line is not null then st_length(p.road_line) else null end,
    coalesce((select jsonb_agg(jsonb_build_object('url',f.public_url,'type',f.photo_type,'caption',f.caption) order by f.sort_order,f.id)
      from public.parking_photos f where f.parking_id=p.id and f.storage_bucket='parking-photos' and f.public_url is not null),'[]'::jsonb)
  from public.parkings p where p.status='APPROVED' and p.category='STREET_ALLOWED'
    and p.price_type::text in ('free','paid') and p.street_details->>'parking_side' in ('left','right','both')
    and case when jsonb_typeof(p.street_path)='array' then jsonb_array_length(p.street_path)>=2 else false end;
$$;
revoke all on function public.street_parking_segments_v2() from public;
grant execute on function public.street_parking_segments_v2() to anon,authenticated;
-- Keep the original contract for older clients, with the same publication gate.
create or replace function public.street_parking_segments()
returns table(parking_id uuid,path jsonb,legal_note text)
language sql stable security definer set search_path=public as $$
  select s.parking_id,s.path,s.legal_note from public.street_parking_segments_v2() s;
$$;
revoke all on function public.parkly_street_geometry(jsonb) from public;
grant execute on function public.parkly_street_geometry(jsonb) to authenticated;
revoke all on function public.parkly_guard_street_publication() from public;
revoke all on function public.parkly_sync_street_geometry() from public;
create or replace function public.admin_street_segments(p_ids uuid[])
returns table(parking_id uuid,path jsonb,details jsonb,legal_note text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.parkly_is_admin() then raise exception 'Admin access required'; end if;
  if coalesce(cardinality(p_ids),0)>1000 then raise exception 'Too many IDs'; end if;
  return query select p.id,p.street_path,p.street_details,p.legal_note from public.parkings p
    where p.id=any(p_ids) and p.category='STREET_ALLOWED';
end $$;
revoke all on function public.admin_street_segments(uuid[]) from public,anon;
grant execute on function public.admin_street_segments(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
