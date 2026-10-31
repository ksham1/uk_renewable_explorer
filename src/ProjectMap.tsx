import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as MapType } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { Expand, Minus, Plus, RotateCcw } from 'lucide-react';
import { mapData, sameMapData } from './mapData';
import type { Project } from './types';
import { mapStyle } from './mapStyle';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre 6 ships a separate module worker. Let Vite bundle it (including its
// shared imports), rather than resolving a missing file beside the main bundle.
maplibregl.setWorkerUrl(workerUrl);

function ProjectMap({projects, onSelect, selected}: {projects:Project[]; onSelect:(p:Project)=>void; selected:Project|null}) {
 const container = useRef<HTMLDivElement>(null), map = useRef<MapType|null>(null);
 const select = useRef(onSelect);
 select.current = onSelect;
 const data = useMemo(()=>mapData(projects),[projects]);
 const latestData = useRef(data), appliedData = useRef<FeatureCollection<Point>|null>(null);
 latestData.current = data;
 const projectsById = useMemo(()=>new Map(projects.map(project=>[project.id,project])),[projects]);
 const lookup = useRef(projectsById); lookup.current = projectsById;
 const [error, setError] = useState('');
 const [tileWarning, setTileWarning] = useState('');
 const [ready, setReady] = useState(false);
 const [retry, setRetry] = useState(0);
 const reset = () => map.current?.fitBounds([[-9.2,49.6],[2.9,59.5]], {padding:35,duration:400});
 useEffect(() => {
  if (!container.current) return;
  let instance: MapType;
  setReady(false); setError(''); setTileWarning('');
  try {
   instance = new maplibregl.Map({container:container.current,style:mapStyle,
    center:[-3.3,55.2],zoom:4.7,maxZoom:17,minZoom:3,
    scrollZoom:true,dragPan:true,doubleClickZoom:true,touchZoomRotate:true,
    dragRotate:false,pitchWithRotate:false,touchPitch:false,cooperativeGestures:false,
    pixelRatio:Math.min(window.devicePixelRatio||1,1.5),fadeDuration:0,
    attributionControl:{compact:false}});
   map.current = instance;
  } catch {setError('Map could not start. WebGL is required. Project records are available on the Overview tab.'); return;}
  instance.on('error', e => {
   const sourceId = 'sourceId' in e ? e.sourceId : null;
   if(sourceId==='basemap') setTileWarning('Some OpenStreetMap background tiles could not load. Project locations can still be selected.');
   else if(sourceId==='projects') setError('Project locations could not be drawn. Retry the map or use the Overview directory.');
   else setError(`Map rendering error: ${e.error?.message || 'unknown error'}`);
  });
  instance.on('sourcedata', e => {
   if(e.sourceId==='basemap' && e.tile?.state==='loaded') setTileWarning('');
  });
  // Load the project layers as soon as the style is ready, independent of tile delivery.
  instance.on('style.load', () => {
   instance.addSource('projects',{type:'geojson',data:latestData.current,cluster:true,clusterMaxZoom:10,clusterRadius:40});
   appliedData.current = latestData.current;
   instance.addLayer({id:'clusters',type:'circle',source:'projects',filter:['has','point_count'],paint:{'circle-color':'#1a5558','circle-radius':['step',['get','point_count'],13,20,17,100,22],'circle-stroke-width':1.3,'circle-stroke-color':'#45b9ac','circle-opacity':0.92}});
   instance.addLayer({id:'cluster-label',type:'symbol',source:'projects',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Arial'],'text-size':11,'text-allow-overlap':true},paint:{'text-color':'#e2f6f2'}});
   instance.addLayer({id:'points',type:'circle',source:'projects',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],4,3.5,10,6],'circle-color':['get','colour'],'circle-stroke-width':1,'circle-stroke-color':'#0b1723','circle-opacity':0.9}});
   instance.on('click','clusters',async e => {
    const f = e.features?.[0]; if (!f || f.geometry.type !== 'Point') return;
    const zoom = await (instance.getSource('projects') as GeoJSONSource).getClusterExpansionZoom(Number(f.properties?.cluster_id));
    instance.easeTo({center:f.geometry.coordinates as [number,number],zoom,duration:300});
   });
   instance.on('click','points', e => {const p = lookup.current.get(e.features?.[0]?.properties?.id); if(p) select.current(p);});
   for(const layer of ['clusters','points']) {
    instance.on('mouseenter',layer,()=>{instance.getCanvas().style.cursor='pointer';});
    instance.on('mouseleave',layer,()=>{instance.getCanvas().style.cursor='';});
   }
   instance.fitBounds([[-9.2,49.6],[2.9,59.5]],{padding:35,duration:0});
   setReady(true);
  });
  const observer = new ResizeObserver(()=>instance.resize()); observer.observe(container.current);
  return () => {observer.disconnect(); instance.remove(); map.current = null; appliedData.current=null;};
 }, [retry]);
 useEffect(()=>{
  if(!ready||sameMapData(appliedData.current,data))return;
  const source=map.current?.getSource('projects') as GeoJSONSource|undefined;
  if(source){source.setData(data);appliedData.current=data;}
 },[data,ready]);
 useEffect(()=>{
  if (!ready || selected?.latitude == null || selected.longitude == null) return;
  map.current?.flyTo({center:[selected.longitude,selected.latitude],zoom:10,duration:400});
 },[selected,ready]);
 return <div className="map-wrap"><div ref={container} className="map-canvas" aria-label="Interactive UK project map"/>
  <div className="map-tag"><span className="live-dot"/> UNITED KINGDOM <span className="map-tag-light">/ Project locations</span></div>
  <div className="map-controls"><button title="Zoom in" aria-label="Zoom in" onClick={()=>map.current?.zoomIn({duration:200})}><Plus size={17}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>map.current?.zoomOut({duration:200})}><Minus size={17}/></button><button title="Reset UK view" aria-label="Reset UK view" onClick={reset}><RotateCcw size={15}/></button><button title="Fullscreen map" aria-label="Fullscreen map" onClick={()=>{const el=container.current?.parentElement;if(document.fullscreenElement) void document.exitFullscreen();else void el?.requestFullscreen();}}><Expand size={15}/></button></div>
  {(error || tileWarning) && <div className="map-error" role="status">{error || tileWarning}<button onClick={()=>setRetry(retry+1)}>Retry map</button></div>}
  <div className="map-note">Drag to pan · Scroll to zoom · Click a cluster to zoom in · Select a point for details</div>
 </div>;
}
export default memo(ProjectMap);
