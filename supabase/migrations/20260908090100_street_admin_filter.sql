begin;
-- Parkly: server-side parking list pagination and filtering for the admin UI.
-- Prepare locally first. Apply only after review in the target Supabase project.

create or replace function public.admin_list_parkings_page(
  p_search text default null,
  p_status text default null,
  p_category text default null,
  p_source text default null,
  p_photo_filter text default null,
  p_quality text default null,
  p_updated_from timestamptz default null,
  p_updated_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_items jsonb;
  v_stats jsonb;
begin
  if not public.parkly_is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status is not null and p_status not in ('DRAFT','PENDING','APPROVED','REJECTED','NEEDS_INFO','ARCHIVED') then
    raise exception 'Invalid status filter';
  end if;
  if p_photo_filter is not null and p_photo_filter not in ('with','without') then
    raise exception 'Invalid photo filter';
  end if;

  with filtered as (
    select p.*
    from public.parkings p
    where (coalesce(btrim(p_search),'')='' or p.name ilike '%'||p_search||'%' or coalesce(p.address,'') ilike '%'||p_search||'%' or coalesce(p.district,'') ilike '%'||p_search||'%')
      and (p_status is null or p.status::text=p_status)
      and (p_category is null or (p_category='__POINT' and p.category::text<>'STREET_ALLOWED') or p.category::text=p_category)
      and (p_source is null or p.source::text=p_source)
      and (p_updated_from is null or p.updated_at>=p_updated_from)
      and (p_updated_to is null or p.updated_at<=p_updated_to)
      and (p_photo_filter is null or (p_photo_filter='with' and coalesce(array_length(p.photos,1),0)>0) or (p_photo_filter='without' and coalesce(array_length(p.photos,1),0)=0))
      and (
        p_quality is null
        or (p_quality='missing_address' and coalesce(btrim(p.address),'')='')
        or (p_quality='missing_verified' and p.verified_at is null)
        or (p_quality='weak_name' and lower(btrim(coalesce(p.name,''))) in ('','парковка','новая парковка','без названия'))
        or (p_quality='attention' and (coalesce(btrim(p.address),'')='' or p.verified_at is null or lower(btrim(coalesce(p.name,''))) in ('','парковка','новая парковка','без названия')))
        or (p_quality='duplicate' and exists (
          select 1 from public.parkings other
          where other.id<>p.id and other.status in ('DRAFT','PENDING','APPROVED')
            and st_dwithin(other.location,p.location,50)
        ))
      )
  ) select count(*) into v_total from filtered;

  with filtered as (
    select p.*
    from public.parkings p
    where (coalesce(btrim(p_search),'')='' or p.name ilike '%'||p_search||'%' or coalesce(p.address,'') ilike '%'||p_search||'%' or coalesce(p.district,'') ilike '%'||p_search||'%')
      and (p_status is null or p.status::text=p_status)
      and (p_category is null or (p_category='__POINT' and p.category::text<>'STREET_ALLOWED') or p.category::text=p_category)
      and (p_source is null or p.source::text=p_source)
      and (p_updated_from is null or p.updated_at>=p_updated_from)
      and (p_updated_to is null or p.updated_at<=p_updated_to)
      and (p_photo_filter is null or (p_photo_filter='with' and coalesce(array_length(p.photos,1),0)>0) or (p_photo_filter='without' and coalesce(array_length(p.photos,1),0)=0))
      and (
        p_quality is null
        or (p_quality='missing_address' and coalesce(btrim(p.address),'')='')
        or (p_quality='missing_verified' and p.verified_at is null)
        or (p_quality='weak_name' and lower(btrim(coalesce(p.name,''))) in ('','парковка','новая парковка','без названия'))
        or (p_quality='attention' and (coalesce(btrim(p.address),'')='' or p.verified_at is null or lower(btrim(coalesce(p.name,''))) in ('','парковка','новая парковка','без названия')))
        or (p_quality='duplicate' and exists (select 1 from public.parkings other where other.id<>p.id and other.status in ('DRAFT','PENDING','APPROVED') and st_dwithin(other.location,p.location,50)))
      )
    order by p.updated_at desc,p.id
    limit greatest(1,least(coalesce(p_limit,50),100))
    offset greatest(coalesce(p_offset,0),0)
  )
  select coalesce(jsonb_agg((to_jsonb(filtered)-'location'-'road_line')||jsonb_build_object('lat',st_y(filtered.location::geometry),'lng',st_x(filtered.location::geometry)) order by filtered.updated_at desc,filtered.id),'[]'::jsonb)
  into v_items from filtered;

  select jsonb_build_object(
    'all',count(*),
    'approved',count(*) filter(where status='APPROVED'),
    'pending',count(*) filter(where status in ('PENDING','NEEDS_INFO')),
    'ev',count(*) filter(where has_ev or category='EV_STATION')
  ) into v_stats from public.parkings;

  return jsonb_build_object('items',v_items,'total',v_total,'stats',v_stats);
end;
$$;

revoke all on function public.admin_list_parkings_page(text,text,text,text,text,text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.admin_list_parkings_page(text,text,text,text,text,text,timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.admin_list_parkings_page(text,text,text,text,text,text,timestamptz,timestamptz,integer,integer) to service_role;


notify pgrst,'reload schema';
commit;
