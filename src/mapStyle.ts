import type { StyleSpecification } from 'maplibre-gl';

// Inline style: no external style document, API key, sprites or font service.
// MapLibre 6 renders the cluster labels using local system fonts.
export const mapStyle: StyleSpecification = {
 version: 8,
 sources: {
  basemap: {
   type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
   tileSize: 256, maxzoom: 19,
   attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  },
 },
 layers: [
  {id:'background',type:'background',paint:{'background-color':'#152331'}},
  {id:'basemap',type:'raster',source:'basemap',paint:{'raster-saturation':-0.65,'raster-brightness-max':0.78,'raster-fade-duration':0}},
 ],
};
