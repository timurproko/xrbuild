// Real React/Fiber and SDK with a renderer spy; only browser/platform boundaries are substituted.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as THREE from 'three';
import * as Fiber from '@react-three/fiber';
import * as bridge from '../src/index.ts';
import * as sdk from '../../sdk/src/index.ts';
import * as kit from '../../ui-kit/src/index.ts';
import * as controls from '../../ui-kit/src/react/index.ts';
import '../../ui-kit/test/dom-shim.ts';
import { fixture, settle } from './fixture.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const core = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/,'$1')), '../../..');

export async function componentApp(root, options = {}) {
  Object.assign(globalThis, { innerWidth: 800, innerHeight: 450 });
  const state = fixture(); state.app.dispose(); state.calls.length = 0;
  const window = new EventTarget(), classes = new Set();
  state.container.classList = { add: value => classes.add(value), contains: value => classes.has(value) };
  let app, handle, now = 0;
  const pending = new Map(); let nextTimer = 0;
  const timers = {
    setTimeout(fn, delay) { const id=++nextTimer;pending.set(id,{fn,delay,repeat:false});return id; },
    clearTimeout(id) { pending.delete(id); },
    setInterval(fn, delay) { const id=++nextTimer;pending.set(id,{fn,delay,repeat:true});return id; },
    clearInterval(id) { pending.delete(id); },
  };
  const location = new URL(options.href ?? 'http://127.0.0.1:5398/apps/launcher/');
  location.assign = value => state.calls.push(`navigate:${value}`);
  const context = createContext({ window, document:{body:state.container}, console, URL, URLSearchParams, AbortController,
    performance:{now:()=>now}, fetch:options.fetch ?? (async()=>Response.json({version:1,publications:[]})), Response, location, ...timers });
  const dependencies = { react:{...React,default:React}, 'react/jsx-runtime':jsx, three:THREE,
    '@react-three/fiber':Fiber, '@xr-build/sdk':sdk, '@xr-build/ui-kit':kit, '@xr-build/ui-kit/react':controls,
    '@xr-build/react':{...bridge,mountXrbApp(container,children,config){
      app=sdk.createXrbApp(state.renderer,{...config,autoStart:false});
      handle=bridge.mountXrbApp(container,children,{...config,app});return handle;
    }},
    lucide: await import(pathToFileURL(createRequire(path.join(core,'packages/ui-kit/package.json')).resolve('lucide')).href),
    ...(options.dependencies??{}),
  };
  const cache=new Map();
  async function load(name, parent=path.join(root,'src/main.tsx')) {
    if(name==='@xr-build/ui-kit-app')name=path.join(core,'embedded/projects/core/ui-kit/src/index.ts');
    const key=dependencies[name]?name:path.resolve(path.dirname(parent),name);
    if(cache.has(key))return cache.get(key);
    if(dependencies[name]) {
      const values=dependencies[name];const module=new SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});cache.set(key,module);return module;
    }
    if(name.endsWith('.css')){const module=new SyntheticModule([],()=>{},{context});cache.set(key,module);return module;}
    if(!name.startsWith('.')&&!path.isAbsolute(name)) {
      const values=await import(name);dependencies[name]=values;return load(name,parent);
    }
    const source=await readFile(key,'utf8');
    if(key.endsWith('.json')){const module=new SyntheticModule(['default'],function(){this.setExport('default',JSON.parse(source));},{context});cache.set(key,module);return module;}
    const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},fileName:key}).outputText;
    const module=new SourceTextModule(code,{context,identifier:key,initializeImportMeta(meta){meta.env={VITE_XRB_LOCAL_PUBLICATIONS:{},...options.env};}});
    cache.set(key,module);await module.link((specifier)=>load(specifier,key));return module;
  }
  const module=await load(`./${options.entry??'main.tsx'}`);await module.evaluate();await settle();
  return {...state,window,classes,location,exports:module.namespace,get app(){return app;},get handle(){return handle;},pending,
    clock(value){now=value;},async fire(delay){for(const [id,timer]of [...pending])if(timer.delay===delay){if(!timer.repeat)pending.delete(id);timer.fn();}await settle();},
    async dispose(){await handle?.dispose();app?.dispose();},
  };
}
