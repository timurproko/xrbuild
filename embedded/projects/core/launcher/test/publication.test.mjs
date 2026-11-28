import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file,encoding='utf8')=>readFile(path.join(root,file),encoding);
test('production preserves website/headset assets and neutral publication defaults',async()=>{
 const [index,manifestText,sourceManifest,icon,sourceIcon,projectText,scene,main,config]=await Promise.all([
  read('dist/index.html'),read('dist/manifest.webmanifest'),read('public/manifest.webmanifest'),readFile(path.join(root,'dist/icon.png')),readFile(path.join(root,'icon.png')),read('xrb-project.json'),read('src/scene.tsx'),read('src/main.tsx'),read('vite.config.js')]);
 const manifest=JSON.parse(manifestText),project=JSON.parse(projectText);
 assert.match(index,/<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest">/);assert.equal(manifestText,sourceManifest);assert.equal(manifest.name,project.name);assert.equal(manifest.start_url,'./?xrb-xr=enter');assert.equal(manifest.scope,'./');assert.equal(manifest.icons[0].src,'icon.png');assert.deepEqual(icon,sourceIcon);
 assert.ok(project.target===undefined||project.target==='webxr');assert.equal(project.publication,undefined);assert.equal(project.plugins,undefined);
 assert.match(main,/mountXrbApp/);assert.doesNotMatch(scene,/runtimeName|handCapabilities|nativePinch|nativeGrab|scene\.add\(xrb\.handsObject/);
 for(const field of ['VITE_XRB_PUBLICATION_ID','PUBLICATION_ID','VITE_XRB_PUBLICATION_SLUG','PUBLICATION_SLUG'])assert.ok(config.includes(field));assert.doesNotMatch(config,/return-overlay/);
});
