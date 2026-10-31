-- Run after schema.sql, in SQL Editor. Expected results: true, false, false, false.
select role,
  has_table_privilege(role, 'public.projects', 'SELECT') as can_read,
  has_table_privilege(role, 'public.projects', 'INSERT') as can_insert,
  has_table_privilege(role, 'public.projects', 'UPDATE') as can_update,
  has_table_privilege(role, 'public.projects', 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) roles(role);
select relrowsecurity as rls_enabled from pg_class where oid = 'public.projects'::regclass;
