-- Run in Supabase SQL Editor. Only the Python importer uses a database credential.
create table if not exists public.projects (
  id text primary key, name text, developer text, developer_original text,
  technology text, capacity_mw double precision check (capacity_mw >= 0),
  status text not null check (status in ('Planning','Consented','Under construction','Operational')),
  source_status text not null, region text, country text, county text, address text, postcode text,
  latitude double precision, longitude double precision,
  planning_authority text, planning_reference text,
  application_submitted date, permission_granted date, appeal_granted date, secretary_granted date,
  construction_started date, operational_date date, record_updated date,
  quality_issues jsonb not null default '[]', source_url text not null,
  dataset text not null, publication_date date not null,
  check ((latitude is null and longitude is null) or
         (latitude is not null and longitude is not null and latitude between 48 and 62 and longitude between -12 and 5))
);
alter table public.projects enable row level security;
revoke all on table public.projects from public, anon, authenticated;
grant select on table public.projects to anon, authenticated;
drop policy if exists "Public read only" on public.projects;
create policy "Public read only" on public.projects for select to anon, authenticated using (true);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_technology_idx on public.projects(technology);
