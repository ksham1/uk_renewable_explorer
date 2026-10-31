import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Project } from './types';
import { colour } from './data.ts';

// Project records are immutable after loading. Reuse their small map features
// across filter selections instead of converting all coordinates each time.
const features = new WeakMap<Project, Feature<Point>>();
export function mapData(projects: Project[]): FeatureCollection<Point> {
 const result: Feature<Point>[] = [];
 for(const project of projects) {
  if(project.latitude===null||project.longitude===null) continue;
  let feature = features.get(project);
  if(!feature) {
   feature = {type:'Feature',geometry:{type:'Point',coordinates:[project.longitude,project.latitude]},
    properties:{id:project.id,colour:colour(project.technology)}};
   features.set(project,feature);
  }
  result.push(feature);
 }
 return {type:'FeatureCollection',features:result};
}
export function sameMapData(a: FeatureCollection<Point> | null, b: FeatureCollection<Point>) {
 return a===b || !!a && a.features.length===b.features.length && a.features.every((feature,i)=>feature===b.features[i]);
}
