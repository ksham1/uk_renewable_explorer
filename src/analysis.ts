import type { Project } from './types';

export const stages = ['Planning', 'Consented', 'Under construction', 'Operational'] as const;
export const stageColours: Record<string, string> = {
 Planning: '#76a9ef', Consented: '#a8ce78', 'Under construction': '#edbd6c', Operational: '#42cbb6',
};
export type Filters = { projectId: string | null; technology: string; status: string; region: string; developers: string[]; size: string };

// Both tabs share filters; the overview chart keeps technology/stage context visible.
export function filterProjects(projects: Project[], filters: Filters, includeChartSelection = true) {
 const {projectId, technology, status, region, developers, size} = filters;
 const developerSet = new Set(developers);
 return projects.filter(p =>
  (!projectId || p.id === projectId) &&
  (!includeChartSelection || technology === 'All' || (p.technology || 'Not reported') === technology) &&
  (!includeChartSelection || status === 'All' || p.status === status) &&
  (region === 'All' || (p.region || 'Not reported') === region) &&
  (!developerSet.size || developerSet.has(p.developer || 'Not reported')) &&
  (size === 'All' || (size === 'Not reported' ? p.capacity_mw === null : p.capacity_mw !== null &&
   (size === '< 10 MW' ? p.capacity_mw < 10 : size === '10–50 MW' ? p.capacity_mw >= 10 && p.capacity_mw < 50 :
    size === '50–100 MW' ? p.capacity_mw >= 50 && p.capacity_mw < 100 : p.capacity_mw >= 100)))
 );
}

export function crosscut(projects: Project[]) {
 const groups = new Map<string, {technology: string; total: number; count: number; missing: number;
  cells: Record<string, {mw: number; count: number; missing: number}>}>();
 for (const project of projects) {
  const technology = project.technology || 'Not reported';
  let row = groups.get(technology);
  if (!row) {
   row = {technology, total: 0, count: 0, missing: 0,
    cells: Object.fromEntries(stages.map(s => [s, {mw: 0, count: 0, missing: 0}]))};
   groups.set(technology, row);
  }
  const cell = row.cells[project.status];
  if (!cell) throw new Error(`Unexpected development stage: ${project.status}`);
  cell.count++; row.count++;
  if (project.capacity_mw === null) { cell.missing++; row.missing++; }
  else { cell.mw += project.capacity_mw; row.total += project.capacity_mw; }
 }
 return [...groups.values()].sort((a,b) => b.total - a.total || a.technology.localeCompare(b.technology));
}
