import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useEffect, useState } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, SearchSelect, createRoot;
before(async()=>{
 dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 ({createRoot}=await import('react-dom/client'));
 server=await createServer({configFile:false,logLevel:'silent',cacheDir:'node_modules/.vite-search-test',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
 SearchSelect=(await server.ssrLoadModule('/src/SearchSelect.tsx')).default;
});
after(async()=>{await server?.close();dom?.window.close();});

const options=Array.from({length:100},(_,i)=>({value:String(i),label:`Developer ${i}`,searchText:`developer ${i}`}));
async function mount(multiple){
 const container=document.createElement('div');document.body.append(container);
 const root=createRoot(container), counts={commits:[],parentRenders:0,mapUpdates:0};
 function Dashboard(){
  counts.parentRenders++;
  const [values,setValues]=useState([]);
  useEffect(()=>{counts.mapUpdates++;},[values]);
  return React.createElement(SearchSelect,{label:multiple?'Developer':'Project search',options,values,multiple,onChange:next=>{counts.commits.push(next);setValues(next);}});
 }
 await act(async()=>root.render(React.createElement(Dashboard)));
 return {container,root,counts};
}
async function type(container,text){
 const input=container.querySelector('input');
 await act(async()=>{
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,text);
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 });
}
async function click(element){await act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}
async function dispose(root,container){await act(async()=>root.unmount());container.remove();}

test('project typing never applies a filter or rerenders the dashboard; selection applies once',async()=>{
 const {container,root,counts}=await mount(false);
 try{
  for(const text of ['D','De','Developer','Developer 1'])await type(container,text);
  assert.equal(counts.commits.length,0);
  assert.equal(counts.parentRenders,1);
  assert.equal(counts.mapUpdates,1);
  assert.ok(container.querySelectorAll('[role=option]').length<=30);
  await click(container.querySelector('[role=option]'));
  assert.equal(counts.commits.length,1);
  assert.equal(counts.mapUpdates,2);
  await type(container,'Developer 99');
  assert.equal(counts.commits.length,1);
  assert.equal(counts.mapUpdates,2);
  assert.equal(counts.parentRenders,2);
 }finally{await dispose(root,container);}
});

test('developer multi-selection applies only on explicit choices and supports removal',async()=>{
 const {container,root,counts}=await mount(true);
 try{
  await type(container,'Developer');
  assert.equal(container.querySelectorAll('[role=option]').length,30);
  assert.equal(counts.commits.length,0);
  await click(container.querySelectorAll('[role=option]')[0]);
  await click(container.querySelectorAll('[role=option]')[1]);
  assert.deepEqual(counts.commits.at(-1),['0','1']);
  assert.equal(counts.mapUpdates,3);
  await type(container,'Developer 7');
  assert.equal(counts.commits.length,2);
  assert.equal(counts.mapUpdates,3);
  await click(container.querySelector('.search-selected>button'));
  assert.deepEqual(counts.commits.at(-1),['1']);
  assert.equal(counts.mapUpdates,4);
 }finally{await dispose(root,container);}
});
