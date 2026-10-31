import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('project map loads a Vite-managed module worker instead of a missing asset', async () => {
 const server = await createServer({
  configFile:false, logLevel:'silent', cacheDir:'node_modules/.vite-map-worker-test',
  server:{middlewareMode:true,hmr:false}, optimizeDeps:{noDiscovery:true,include:[]},
 });
 try {
  const component = await server.transformRequest('/src/ProjectMap.tsx');
  assert.match(component.code,/maplibre-gl-worker\.mjs\?worker&url/);
  assert.match(component.code,/setWorkerUrl\(workerUrl\)/);
  const wrapper = await server.transformRequest('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url');
  const match = wrapper.code.match(/export default ("[^";]+")/);
  assert.ok(match,'Vite must export the worker URL');
  const url = JSON.parse(match[1]);
  assert.match(url,/worker_file&type=module/);
  const worker = await server.transformRequest(url);
  assert.ok(worker?.code.length>1000,'Worker must be served as JavaScript, not a missing asset');
  assert.match(worker.code,/self/,'Worker entry must contain its worker-side bootstrap');
 } finally {
  await server.close();
 }
});
