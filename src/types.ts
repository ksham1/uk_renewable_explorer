export type Project = {
 id: string; name: string | null; developer: string | null; developer_original: string | null;
 technology: string | null; capacity_mw: number | null; status: string; source_status: string;
 region: string | null; country: string | null; county: string | null; address: string | null; postcode: string | null;
 latitude: number | null; longitude: number | null; planning_authority: string | null; planning_reference: string | null;
 application_submitted: string | null; permission_granted: string | null; appeal_granted: string | null; secretary_granted: string | null;
 construction_started: string | null; operational_date: string | null; record_updated: string | null;
 quality_issues: string[]; source_url: string; publication_date: string; dataset: string;
};
export type Summary = {source_url: string; publication_date: string; dataset: string; total_records: number; included: number; excluded: number; unmapped: number; missing_capacity: number; flagged_records: number; exclusion_reasons: Record<string,number>};
