import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { mapStyle } from '../src/mapStyle.ts';

test('map style is valid without an API key, remote style, sprites or font service', () => {
 assert.deepEqual(validateStyleMin(mapStyle),[]);
 assert.equal(mapStyle.sources.basemap.type,'raster');
 assert.deepEqual(mapStyle.sources.basemap.tiles,['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
 assert.match(mapStyle.sources.basemap.attribution,/OpenStreetMap/);
 assert.equal(mapStyle.glyphs,undefined);
 assert.equal(mapStyle.sprite,undefined);
});
