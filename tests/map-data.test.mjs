import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapData, sameMapData } from '../src/mapData.ts';

const projects=JSON.parse(readFileSync(new URL('../public/data/projects.json',import.meta.url)));
test('map features are cached across selections and equivalent data needs no source update',()=>{
 const first=mapData(projects);
 const second=mapData([...projects]);
 assert.equal(first.features.length,11060);
 assert.ok(sameMapData(first,second));
 const subset=mapData(projects.slice(0,100));
 assert.ok(!sameMapData(first,subset));
 const original=new Map(first.features.map(feature=>[feature.properties.id,feature]));
 for(const feature of subset.features) assert.equal(feature,original.get(feature.properties.id));
});
