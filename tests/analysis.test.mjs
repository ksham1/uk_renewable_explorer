import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { crosscut, filterProjects, stages } from '../src/analysis.ts';

const projects = JSON.parse(readFileSync(new URL('../public/data/projects.json', import.meta.url)));
const all = {projectId:null,technology:'All',status:'All',region:'All',developers:[],size:'All'};
const sum = rows => rows.reduce((total,p) => total+(p.capacity_mw??0),0);

test('every technology/stage segment reconciles with the corresponding directory selection', () => {
 const rows = crosscut(projects);
 assert.equal(rows.reduce((total,r)=>total+r.count,0), projects.length);
 for (const row of rows) {
  for (const stage of stages) {
   const directory = filterProjects(projects,{...all,technology:row.technology,status:stage});
   const cell = row.cells[stage];
   assert.equal(directory.length,cell.count);
   assert.ok(Math.abs(sum(directory)-cell.mw)<0.000001);
   assert.equal(directory.filter(p=>p.capacity_mw===null).length,cell.missing);
  }
 }
});

test('solar under construction selects both dimensions, including unlocated records', () => {
 const filters = {...all,technology:'Solar Photovoltaics',status:'Under construction'};
 const directory = filterProjects(projects,filters);
 assert.ok(directory.length>0);
 assert.ok(directory.every(p=>p.technology==='Solar Photovoltaics'&&p.status==='Under construction'));
 assert.equal(directory.length,projects.filter(p=>p.technology===filters.technology&&p.status===filters.status).length);
 // Chart selection does not remove the other segments used for comparison.
 assert.equal(filterProjects(projects,filters,false).length,projects.length);
});

test('search, region and capacity filters also constrain the chart context', () => {
 const filters = {...all,technology:'Battery',status:'Consented',region:'Scotland',size:'≥ 100 MW'};
 const context = filterProjects(projects,filters,false);
 assert.ok(context.length>0);
 assert.ok(context.every(p=>p.region==='Scotland'&&p.capacity_mw>=100));
 assert.ok(new Set(context.map(p=>p.technology)).size>1);
 const directory = filterProjects(projects,filters);
 assert.ok(directory.every(p=>p.technology==='Battery'&&p.status==='Consented'&&p.region==='Scotland'&&p.capacity_mw>=100));
});

test('multiple developer selections form a union, combined with the other filters', () => {
 const developers=[...new Set(projects.filter(p=>p.developer).map(p=>p.developer))].slice(0,2);
 const result=filterProjects(projects,{...all,developers});
 assert.ok(result.length>0);
 assert.equal(result.length,projects.filter(p=>developers.includes(p.developer)).length);
 const stage=filterProjects(projects,{...all,developers,status:'Operational'});
 assert.equal(stage.length,result.filter(p=>p.status==='Operational').length);
});

test('project selection uses a unique ID, without matching other similarly named projects', () => {
 const project=projects.find(p=>p.name);
 const result=filterProjects(projects,{...all,projectId:project.id});
 assert.deepEqual(result,[project]);
 assert.equal(filterProjects(projects,all).length,projects.length);
});

test('missing-capacity projects remain selectable and counted, without invented capacity', () => {
 const rows = filterProjects(projects,{...all,size:'Not reported'});
 assert.ok(rows.length>0);
 const chart = crosscut(rows);
 assert.equal(chart.reduce((n,row)=>n+row.count,0),rows.length);
 assert.equal(chart.reduce((n,row)=>n+row.total,0),0);
 assert.equal(chart.reduce((n,row)=>n+row.missing,0),rows.length);
});
