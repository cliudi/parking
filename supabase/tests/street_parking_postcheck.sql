-- Read-only checks after the three street migrations. No parking writes.
begin;
do $$
declare bad jsonb;
begin
  if abs(st_length(public.parkly_street_geometry('[[0,0],[0,0.001]]')::geography)-111.32)>1 then
    raise exception 'Unexpected length';
  end if;
  foreach bad in array array['[]'::jsonb,'[[41,69]]'::jsonb,'[[null,69],[41,69.01]]'::jsonb,'[[91,69],[41,69]]'::jsonb,'[[41,69],[41,69]]'::jsonb] loop
    begin
      perform public.parkly_street_geometry(bad);
    exception when others then continue;
    end;
    raise exception 'Invalid path accepted: %',bad;
  end loop;
end $$;
select
  not has_function_privilege('anon','public.admin_save_street_parking(jsonb,jsonb,jsonb,jsonb,text)','execute') as anon_cannot_save,
  not has_function_privilege('anon','public.admin_street_segments(uuid[])','execute') as anon_cannot_read_drafts,
  has_function_privilege('anon','public.street_parking_segments_v2()','execute') as public_read_enabled;
select count(*)=0 as no_unapproved_or_unknown_segments
from public.street_parking_segments_v2() s join public.parkings p on p.id=s.parking_id
where p.status<>'APPROVED' or (not public.parkly_is_legacy_street(p.id) and
  (p.price_type::text not in ('free','paid') or coalesce(s.details->>'parking_side','') not in ('left','right','both')));
select count(*) as preserved_legacy_points from public.street_parking_segments_v2()
where details->>'legacy_point'='true';
select count(*) as existing_segments_requiring_admin_review
from public.parkings where category='STREET_ALLOWED' and status='APPROVED'
  and (street_path is null or price_type::text not in ('free','paid') or coalesce(street_details->>'parking_side','') not in ('left','right','both'));
rollback;
