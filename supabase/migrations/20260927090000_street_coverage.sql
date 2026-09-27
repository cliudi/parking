-- Independent, admin-only survey layer. Never changes parking publication.
begin;
create table public.street_coverage_segments (
  id uuid primary key default gen_random_uuid(),
  path jsonb not null,
  geometry public.geometry(LineString,4326) not null,
  status text not null check(status in ('parking_added','no_parking','partial','recheck')),
  side text not null default 'unspecified' check(side in ('unspecified','both','left','right')),
  district text not null default '' check(length(district)<=120),
  comment text not null default '' check(length(comment)<=2000),
  checked_on date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index street_coverage_geometry_idx on public.street_coverage_segments using gist(geometry);
alter table public.street_coverage_segments enable row level security;
revoke all on public.street_coverage_segments from anon,authenticated;
grant select on public.street_coverage_segments to authenticated;
create policy coverage_admin_read on public.street_coverage_segments for select to authenticated using(public.parkly_is_admin());

create function public.admin_save_street_coverage(p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_geometry public.geometry; v_date date;
begin
  if not public.parkly_is_admin() then raise exception 'Admin access required'; end if;
  v_geometry:=public.parkly_street_geometry(p_data->'path');
  if v_geometry is null then raise exception 'Нарисуйте участок'; end if;
  v_date:=nullif(p_data->>'checked_on','')::date;
  if v_date>current_date then raise exception 'Дата проверки не может быть в будущем'; end if;
  if p_data->>'status' in ('parking_added','no_parking') and v_date is null then raise exception 'Укажите дату фактической проверки'; end if;
  v_id:=nullif(p_data->>'id','')::uuid;
  if v_id is null then
    insert into public.street_coverage_segments(path,geometry,status,side,district,comment,checked_on)
    values(p_data->'path',v_geometry,p_data->>'status',coalesce(p_data->>'side','unspecified'),coalesce(p_data->>'district',''),coalesce(p_data->>'comment',''),v_date) returning id into v_id;
  else
    update public.street_coverage_segments set path=p_data->'path',geometry=v_geometry,
      status=p_data->>'status',side=coalesce(p_data->>'side','unspecified'),district=coalesce(p_data->>'district',''),comment=coalesce(p_data->>'comment',''),checked_on=v_date,updated_at=now(),version=version+1
    where id=v_id and version=(p_data->>'version')::integer;
    if not found then raise exception 'Участок уже изменён или удалён. Обновите список.'; end if;
  end if;
  return v_id;
end $$;
create function public.admin_delete_street_coverage(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.parkly_is_admin() then raise exception 'Admin access required'; end if;
  delete from public.street_coverage_segments where id=p_id and version=p_version;
  if not found then raise exception 'Участок уже изменён или удалён. Обновите список.'; end if;
end $$;
revoke all on function public.admin_save_street_coverage(jsonb) from public,anon;
revoke all on function public.admin_delete_street_coverage(uuid,integer) from public,anon;
grant execute on function public.admin_save_street_coverage(jsonb) to authenticated;
grant execute on function public.admin_delete_street_coverage(uuid,integer) to authenticated;
commit;
