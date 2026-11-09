import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { managedBridgePlugin } from './bridge/managed.mjs';
import { panelStatusPlugin } from './panel-status.mjs';
import { recordingStorePlugin } from './recording-store.mjs';
import {visionAssetsPlugin} from './prepare-assets.mjs';
import {statePaths,userPath} from './state-paths.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
export function handTrackingConfig({core=process.env.XRB_CORE,workspace=process.env.XRB_HOME,panelUrl=process.env.XRB_PANEL_URL||'http://127.0.0.1:5281',httpServer=null,bridgePrepare=undefined,panelManaged=false}={}){
  if(!core)throw new Error('XRB_CORE is not set: run from the XR Build panel or set it to the core repo');
  const options={core,workspace},user=statePaths(options),relative=path.relative(user.workspace,root),owned=relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);
  return {
    root,base:'./',publicDir:false,cacheDir:userPath(options,'cacheRoot','vite',true),
    build:{outDir:owned?path.join(root,'dist'):userPath(options,'cacheRoot','diagnostic/dist',true),emptyOutDir:false},
    plugins:[managedBridgePlugin({httpServer,context:{core,workspace},...(bridgePrepare?{prepare:bridgePrepare}:{})}),panelManaged?{name:'handtracking-panel-managed',transformIndexHtml(){return[{tag:'meta',attrs:{name:'handtracking-panel-managed',content:'1'},injectTo:'head'}];}}:null,panelStatusPlugin(panelUrl),recordingStorePlugin({core,workspace}),visionAssetsPlugin({core,workspace}),{name:'hand-tracking-panel-navigation',transformIndexHtml(){return[{tag:'meta',attrs:{name:'xrbuild-panel-url',content:panelUrl},injectTo:'head'}];}}],
    worker:{format:'es'},
    // The worker's dependency must be optimized before Start, not trigger a camera-session page reload.
    optimizeDeps:{include:['@mediapipe/tasks-vision']},
    resolve:{
      alias:{'@xr-build/sdk':path.join(core,'packages/sdk/src/index.ts'),
        '@xr-build/design-system.css':path.join(core,'packages/control-panel/ui/design-system.css'),
        '@xr-build/design-system':path.join(core,'packages/control-panel/ui/design-system.js'),
        '@xr-build/panel-navigation':path.join(core,'packages/control-panel/ui/navigation.js')},
      dedupe:['three'],
    },
    server:{
      host:'127.0.0.1',port:5190,strictPort:true,
      // Generated compiler/typecheck outputs are not page sources. Avoid locked Windows probes
      // and verification-triggered reloads that would interrupt an active capture/unsaved clip.
      watch:{ignored:['**/build/**']},
      fs:{allow:[root,path.join(core,'packages/sdk/src'),path.join(core,'packages/control-panel/ui')]},
    },
  };
}
export default defineConfig(()=>handTrackingConfig());
