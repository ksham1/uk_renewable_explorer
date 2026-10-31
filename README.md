# RE:VIEW — UK Renewable Project Explorer

Local React + TypeScript + Vite dashboard with Tailwind CSS, MapLibre, Recharts and Supabase PostgreSQL support. Uses the real DESNZ July 2026 (Q2) REPD extract, published **3 August 2026**. No demonstration or invented project data.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Local URL printed by Vite (5173 by default; it chooses another port if occupied). The complete cleaned extract is already in `public/data`, so Python and Supabase are optional for local browsing. The supplied public Supabase connection is in ignored `.env.local`; the app first tries Supabase, then visibly labels the complete local snapshot if the database is unavailable. It never combines partial remote results with local data.

```powershell
npm.cmd run build
npm.cmd run check
npm.cmd test
```

The map uses OpenStreetMap raster tiles and requires internet access and WebGL. Its style and cluster labels are local; it needs no CARTO account, key, sprite or remote font service. MapLibre 6's separate GeoJSON/clustering worker is explicitly packaged through Vite (`?worker&url`) and registered before map creation; a basemap can load without this worker, but project points cannot. Mouse drag pans, the mouse wheel zooms, and the +/− controls also zoom. Touch panning and pinch zoom are supported. An unavailable basemap does not remove project records or change statistics.

## Import / refresh the official extract

The downloaded source is `data/raw/REPD_Publication_Q2_2026.csv`.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/import_repd.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

The script prints the actual inspected columns/statuses to `data/processed/audit.json` along with all excluded rows, duplicate IDs and retained issues. It writes `public/data/projects.json` and `summary.json`, and prints the inclusion/exclusion summary. `--download` fetches the official July 2026 CSV. To import a later extract, provide its path, `--dataset` and `--publication-date`; verify its publication date on the official page first. The pinned `--download` URL must be updated for a later release.

Current reconciliation: **14,657 source records = 11,097 included + 3,560 excluded**. Included records contain **37 without valid coordinates**, **1,123 without reported capacity**, and **1,171 flagged records**. There are no duplicate IDs in this extract. The CSV SHA-256 is recorded for reproducibility. All exclusions are inactive statuses (including superseded `Revised` applications, which would otherwise double count a later application).

Cleaning trims and normalises whitespace, matches status capitalisation, parses day/month/year dates, retains original developer names, and normalises explicit Scottish Power / ScottishPower and Scottish & Southern Energy aliases. It does not infer parent companies or merge project IDs. Capacities are MW of electricity; missing/invalid capacities remain null. Grid conversion uses EPSG:27700 to WGS84 across this extract, including Northern Ireland (checked against the supplied Newry site coordinates), with a broad UK/offshore sanity envelope. It cannot establish exact site boundaries or correct source errors.

## Connect Supabase

Supabase setup is complete: `public.projects` contains **11,097 projects**, and every field has been verified against the cleaned local extract through the public API. Known pipeline capacity is **270.698 GW**, including storage. RLS is enabled; both browser roles (`anon` and `authenticated`) have read-only access. The private connection stays in ignored `.env.database.local`.

### Recommended: automatic setup

1. Open your Supabase project, click **Connect**, select **Session pooler**, and copy the PostgreSQL URI on port **5432**. Session pooling supports IPv4 and the database operations used by this importer. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
2. In the ignored `.env.database.local` file, set `DATABASE_URL=` to that URI, replacing `[YOUR-PASSWORD]` with your actual database password. URI-encode password symbols (for example, `@` becomes `%40`). Keep this credential out of chat and source control. This file is used only by the setup script.
3. Run:

```powershell
.\.venv\Scripts\python.exe scripts/setup_supabase.py
```

The command checks the database matches the configured public project, reconciles local data with the original CSV, creates the schema, imports the full extract, and checks RLS and read-only grants for both browser roles. Schema changes and import are committed together; failures roll back. It refuses to replace records from another source. It then reads every row through the public API and compares every field with the cleaned local extract, including capacities and dates. Credentials are not logged.

4. Reload the dashboard. The source badge should say **Supabase**. Vite only needs restarting if the public URL/key changed.

You can repeat the public verification without writing anything:

```powershell
.\.venv\Scripts\python.exe scripts/setup_supabase.py --check-only
```

If authentication fails, check the database password (not your Supabase account password) and the Session pooler username shown in Connect. If you do not know the database password, reset it yourself in the Supabase dashboard and update the private file. No service-role key is needed.

### Manual alternative

1. In your Supabase project, open **SQL Editor**, paste and run `supabase/schema.sql`. This creates one `public.projects` table, enables RLS, revokes browser write privileges, and grants public SELECT only.
2. Run `supabase/check_access.sql` to verify browser roles have SELECT but no INSERT/UPDATE/DELETE rights, and RLS is enabled.
3. In **Connect**, copy the Session pooler PostgreSQL URI on port 5432. Set it in your terminal as `DATABASE_URL`. Keep it out of frontend variables, source control and chat.
4. Import:

```powershell
$env:DATABASE_URL = 'YOUR_PRIVATE_SUPABASE_POSTGRES_CONNECTION_URI'
.\.venv\Scripts\python.exe scripts/import_repd.py --upload
Remove-Item Env:DATABASE_URL
```

The importer atomically replaces the snapshot in one transaction; a failed write rolls back. It refuses uploads with duplicate/missing IDs, unrecognised statuses or no included records. Do not point it at a table containing unrelated data. No service-role key is needed. Connection passwords with reserved characters must be URI encoded.

5. The public project URL and publishable key are already configured in ignored `.env.local`. For a different project, copy `.env.example` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, then restart Vite. Never put a database password, service-role key or secret key in a `VITE_` variable. Browser credentials allow only the access enforced by database grants and RLS.
6. Reload the dashboard; its source badge changes to **Supabase** once a complete matching snapshot is returned. All rows are fetched with pagination, avoiding Supabase's default 1,000-row response limit. A mismatched, empty, inaccessible or incomplete remote snapshot triggers a complete local fallback, explained under **Data & methodology**.

If PostgreSQL access is blocked by your network, use Supabase SQL Editor and Table Editor to import data/processed/projects.csv, or allow outbound access to your pooler host. The public key alone cannot perform this setup.

## Definitions and interactions

- Pipeline GW = Planning + Consented + Under construction. Operational is excluded from pipeline and included in the project count, map, directory and capacity charts. Every view respects the same filters.
- Planning = applications submitted + appeals lodged. Consented = permission granted + appeal granted + Secretary of State granted + no application required. Source statuses and all reported planning dates remain in details.
- All active REPD technologies are included, including storage, hydrogen and energy from waste. This is an REPD project explorer; capacity is not a claim that all included generation is zero carbon. Co-located storage and generation are separate source records.
- Unlocated projects are excluded only from map points. They remain in all totals, charts, exports and the table. Known capacities are summed without imputing values for missing data. Chart groups without a reported region/technology use an explicit `Not reported` label.
- **Overview & directory:** horizontal bars show each technology's known capacity split into four development stages, using a common GW scale. Stage headings show capacity and project-count totals. All 25 technologies are retained in the scrollable chart, including zero-capacity rows; none are grouped into an unspecified Other category. Select a segment to filter the directory by both technology and stage. Select it again or use Clear selection to remove the selection. Technology labels and stage headings provide independent filters for very small or zero-capacity segments and keyboard access is supported.
- The chart responds to search, region, developer and capacity filters. Technology/stage selections highlight the chart and filter the directory, map, statistics and export while preserving the other chart segments for comparison. Each chart-to-directory pair is checked against the full official dataset.
- **Project map:** a separate tab contains the map and search/filters, with regional capacity below it. Click clusters to zoom and points for details. Both tabs retain the same filters. Regional capacity includes projects without coordinates; select a regional bar to filter by region.
- **Project search:** type to see up to 30 suggestions, then click a project (or use arrow keys and Enter) to apply an exact project-ID filter. Typing and clearing draft text do not change the applied filter or map. Remove the selected-project chip to clear that filter.
- **Developer search:** type to find suggestions and select multiple developers. Each explicit selection/removal applies the union of the selected developers, combined with the other filters. Typing never applies the filter. Selected developers remain visible as removable chips; Done only closes the suggestion list.
- Search draft state is isolated inside the search controls. Developer/project indexes are prepared once per data load; the dashboard receives only applied selections. Chart context is cached separately from technology/stage selections, statistics are calculated in one pass, and sorting/regional calculations run only on the relevant tab. CSV export includes every filtered project, independent of table pagination.
- The map reuses cached GeoJSON features, avoids its duplicate initial source update and skips equivalent source updates. Project lookup uses an ID index. The clustering cutoff stays at zoom 10, with a larger 40-pixel cluster radius, rendering resolution capped at 1.5× and shorter zoom/reset animations. These are client performance changes and do not remove projects or change the totals.

## Verification

TypeScript and production build; Python checks for duplicate IDs, status normalisation, invalid dates, missing capacity, GB and NI coordinates, connection project matching and API pagination; Node checks against the full official dataset for row accounting and aggregate reconciliation. Live Supabase verification confirmed all 11,097 records and every imported field through the public API, plus RLS and read-only privileges for both browser roles. Browser visual QA was blocked by the computer-use app permission timeout in this session.

Source: [DESNZ REPD quarterly extract](https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract). Crown copyright; [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). REPD generally covers schemes above 150 kW, with incomplete historical coverage below 1 MW. It is a planning snapshot, not a live operational feed.
