-- User-approved compatibility: preserve only the already-published street points.
begin;
do $$ begin
  if to_regclass('public.parkly_legacy_street_visibility') is null then
    create table public.parkly_legacy_street_visibility(parking_id uuid primary key, active boolean not null default true);
    insert into public.parkly_legacy_street_visibility(parking_id)
      select id from public.parkings where category='STREET_ALLOWED' and status='APPROVED';
  end if;
end $$;
alter table public.parkly_legacy_street_visibility enable row level security;
revoke all on public.parkly_legacy_street_visibility from public,anon,authenticated;
create or replace function public.parkly_is_legacy_street(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.parkly_legacy_street_visibility l join public.parkings p on p.id=l.parking_id
    where l.parking_id=p_id and l.active and p.status='APPROVED' and p.category='STREET_ALLOWED');
$$;
revoke all on function public.parkly_is_legacy_street(uuid) from public;
grant execute on function public.parkly_is_legacy_street(uuid) to anon,authenticated;
create or replace function public.parkly_retire_legacy_street() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status<>'APPROVED' or new.category<>'STREET_ALLOWED' then
    update public.parkly_legacy_street_visibility set active=false where parking_id=new.id and active;
  end if;
  return new;
end $$;
revoke all on function public.parkly_retire_legacy_street() from public;
drop trigger if exists parkly_retire_legacy_street on public.parkings;
create trigger parkly_retire_legacy_street after update of status,category on public.parkings
  for each row execute function public.parkly_retire_legacy_street();
create or replace function public.parkly_guard_street_publication() returns trigger
language plpgsql security definer set search_path=public as $$
declare p public.parkings;
begin
  select * into p from public.parkings where id=new.id;
  if p.category='STREET_ALLOWED' and p.status='APPROVED' and not public.parkly_is_legacy_street(p.id) then
    if p.street_path is null or coalesce(p.price_type::text,'') not in ('free','paid') or coalesce(p.street_details->>'parking_side','') not in ('left','right','both') then
      raise exception 'Уличный участок: перед публикацией нарисуйте линию, укажите сторону и известную стоимость';
    end if;
    perform public.parkly_street_geometry(p.street_path);
  end if;
  return null;
end $$;
create or replace function public.street_parking_segments_v2()
returns table(parking_id uuid,path jsonb,legal_note text,details jsonb,length_m double precision,photos jsonb)
language sql stable security definer set search_path=public as $$
  select p.id,case when ready.ok then p.street_path else null end,p.legal_note,
    p.street_details||jsonb_build_object('legacy_point',not ready.ok),
    case when ready.ok and p.road_line is not null then st_length(p.road_line) else null end,
    coalesce((select jsonb_agg(jsonb_build_object('url',f.public_url,'type',f.photo_type,'caption',f.caption) order by f.sort_order,f.id)
      from public.parking_photos f where f.parking_id=p.id and f.storage_bucket='parking-photos' and f.public_url is not null),'[]'::jsonb)
  from public.parkings p cross join lateral(select coalesce(
    p.price_type::text in ('free','paid') and p.street_details->>'parking_side' in ('left','right','both')
    and p.road_line is not null and case when jsonb_typeof(p.street_path)='array' then jsonb_array_length(p.street_path)>=2 else false end,false) as ok) ready
  where p.status='APPROVED' and p.category='STREET_ALLOWED' and (ready.ok or public.parkly_is_legacy_street(p.id));
$$;
-- Older line-only clients must never receive null paths.
create or replace function public.street_parking_segments()
returns table(parking_id uuid,path jsonb,legal_note text)
language sql stable security definer set search_path=public as $$
  select s.parking_id,s.path,s.legal_note from public.street_parking_segments_v2() s where s.path is not null;
$$;
-- Patch the checked, existing nearby function without duplicating its signature/grants.
do $$ declare definition text; begin
  select pg_get_functiondef('public.parkings_nearby(double precision,double precision,integer,boolean,boolean,integer,integer)'::regprocedure) into definition;
  definition:=replace(definition,'then p.road_line else p.location end','then coalesce(p.road_line,p.location) else p.location end');
  definition:=replace(definition,'(p.category<>''STREET_ALLOWED'' or (p.road_line is not null','(p.category<>''STREET_ALLOWED'' or public.parkly_is_legacy_street(p.id) or (p.road_line is not null');
  execute definition;
end $$;
notify pgrst,'reload schema';
commit;
