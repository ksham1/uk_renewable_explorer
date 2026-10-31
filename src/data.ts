import { createClient } from '@supabase/supabase-js';
import type { Project, Summary } from './types';
export async function loadProjects(): Promise<{ projects: Project[]; summary: Summary; mode: string; warning: string }> {
 const summaryResponse = await fetch('/data/summary.json');
 if (!summaryResponse.ok) throw new Error('Dataset summary is unavailable. Run the Python importer.');
 const summary: Summary = await summaryResponse.json();
 const url = import.meta.env.VITE_SUPABASE_URL;
 const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 let warning = '';
 if (url && key) {
  try {
   const db = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
   const projects: Project[] = [];
   // Supabase defaults to 1,000 rows per response. Never use a truncated result for totals.
   let snapshotCount: number | null = null;
   for (;;) {
    const start = projects.length;
    const {data, error, count} = await db.from('projects').select('*', { count: 'exact' }).order('id').range(start, start + 999).abortSignal(AbortSignal.timeout(12000));
    if (error) throw new Error(error.message);
    if (snapshotCount !== null && count !== snapshotCount) throw new Error('Database changed while loading; please reload');
    snapshotCount = count;
    if (!data?.length && !projects.length) throw new Error('The projects table is empty');
    projects.push(...data as Project[]);
    if (projects.length === count) break;
    if (!data?.length || count === null || projects.length > count) throw new Error('Incomplete database response');
   }
   const dates = new Set(projects.map(p => p.publication_date));
   if (dates.size !== 1 || !dates.has(summary.publication_date) || projects.length !== summary.included) throw new Error('Database snapshot differs from the imported extract; re-import the dataset');
   return {projects, summary, mode: 'Supabase', warning};
  } catch (error) {
   warning = `Supabase unavailable: ${error instanceof Error ? error.message : 'connection failed'}. Showing the complete local REPD extract.`;
  }
 }
 const response = await fetch('/data/projects.json');
 if (!response.ok) throw new Error('Local dataset unavailable. Run the Python importer.');
 const projects: Project[] = await response.json();
 if (projects.length !== summary.included) throw new Error('Local snapshot is incomplete. Run the importer again.');
 return {projects, summary, mode: 'Local REPD', warning};
}
export const colours = ['#2dd4bf','#72a5ff','#a4cf69','#e9b760','#bb9bf4','#e486ab','#83bac7'];
export function colour(technology: string | null) {
 if (technology === 'Solar Photovoltaics') return '#e9b760';
 if (technology === 'Wind Onshore') return '#2dd4bf';
 if (technology === 'Wind Offshore') return '#72a5ff';
 if (technology?.includes('Storage') || technology === 'Battery') return '#bb9bf4';
 if (technology?.includes('Hydro')) return '#83bac7';
 return '#a4cf69';
}
export const capacity = (p: Project) => p.capacity_mw ?? 0;
export const formatNumber = (n: number) => n.toLocaleString('en-GB');
export const shortTech = (s: string | null) => ({'Solar Photovoltaics':'Solar PV','Wind Onshore':'Onshore wind','Wind Offshore':'Offshore wind','Pumped Storage Hydroelectricity':'Pumped storage'}[s || ''] || s || 'Not reported');
