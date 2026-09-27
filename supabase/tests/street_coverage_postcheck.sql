-- Read-only checks after applying 20260927090000_street_coverage.sql.
select
  not has_table_privilege('anon','public.street_coverage_segments','SELECT') as anonymous_read_denied,
  not has_table_privilege('authenticated','public.street_coverage_segments','INSERT') as direct_insert_denied,
  not has_table_privilege('authenticated','public.street_coverage_segments','UPDATE') as direct_update_denied,
  not has_table_privilege('authenticated','public.street_coverage_segments','DELETE') as direct_delete_denied,
  not has_function_privilege('anon','public.admin_save_street_coverage(jsonb)','EXECUTE') as anonymous_save_denied,
  not has_function_privilege('anon','public.admin_delete_street_coverage(uuid,integer)','EXECUTE') as anonymous_delete_denied,
  (select relrowsecurity from pg_class where oid='public.street_coverage_segments'::regclass) as rls_enabled;
select count(*) as coverage_segments,
  count(*) filter(where not st_equals(geometry,public.parkly_street_geometry(path))) as geometry_mismatches
from public.street_coverage_segments;
-- Also test in a separate authenticated non-admin session: SELECT returns zero
-- rows; both mutation RPCs must fail. Admin CRUD should succeed on a test record.
