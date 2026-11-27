import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test} from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {componentApp}=await import(pathToFileURL(path.join(process.env.XRB_CORE,'packages/react/test/component-app.fixture.mjs')));
test('Launcher imports public UI Kit app components, never its bootstrap or private controls',async()=>{
 const source=await readFile(path.join(root,'src/scene.tsx'),'utf8');
 const names=source.match(/import\s*\{([^}]+)\}\s*from '@xr-build\/ui-kit-app'/)[1].split(',').map(s=>s.trim()).sort();assert.deepEqual(names,['Board','Button','Dialog','Label']);
 assert.doesNotMatch(source,/new (Button|Dialog|Label)|ui-kit\/src|ui-kit-app\/|main\.tsx/);
 let fetches=0;const imported=await componentApp(root,{entry:'index.ts',fetch:()=>{fetches++;throw Error('import must not fetch');}});
 assert.equal(typeof imported.exports.LauncherScene,'function');assert.equal(typeof imported.exports.LauncherCard,'function');assert.equal(imported.app,undefined);assert.equal(imported.pending.size,0);assert.equal(fetches,0);assert.deepEqual(imported.calls,[]);
});
