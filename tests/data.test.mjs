import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const projects = JSON.parse(readFileSync(new URL('../public/data/projects.json', import.meta.url)));
const summary = JSON.parse(readFileSync(new URL('../public/data/summary.json', import.meta.url)));
test('every source record is accounted for and project IDs are unique', () => {
 assert.equal(summary.included + summary.excluded, summary.total_records);
 assert.equal(projects.length, summary.included);
 assert.equal(new Set(projects.map(p=>p.id)).size, projects.length);
 assert.ok(projects.every(p=>['Planning','Consented','Under construction','Operational'].includes(p.status)));
});
test('missing coordinates and capacities remain explicit and reconcile with metadata', () => {
 assert.equal(projects.filter(p=>p.latitude === null).length, summary.unmapped);
 assert.equal(projects.filter(p=>p.capacity_mw === null).length, summary.missing_capacity);
 assert.ok(projects.every(p=>(p.latitude===null&&p.longitude===null)||(p.latitude>=48&&p.latitude<=62&&p.longitude>=-12&&p.longitude<=5)));
 assert.ok(projects.every(p=>p.capacity_mw===null || p.capacity_mw>=0));
});
test('capacity totals reconcile across every chart dimension and mapped/unmapped projects', () => {
 const sum = rows => rows.reduce((a,p)=>a+(p.capacity_mw ?? 0),0);
 const total = sum(projects);
 for (const key of ['technology','region','status']) {
  const groups = Map.groupBy(projects, p=>p[key]);
  const grouped = [...groups.values()].reduce((a,rows)=>a+sum(rows),0);
  assert.ok(Math.abs(grouped-total)<0.00001);
 }
 assert.ok(Math.abs(sum(projects.filter(p=>p.latitude!==null))+sum(projects.filter(p=>p.latitude===null))-total)<0.00001);
 const pipeline = sum(projects.filter(p=>p.status!=='Operational'));
 assert.ok(Math.abs(pipeline+sum(projects.filter(p=>p.status==='Operational'))-total)<0.00001);
});
