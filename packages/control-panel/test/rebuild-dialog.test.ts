import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {REBUILD_AUTOCLOSE_KEY,UPDATE_STEPS,rebuildPresentation} from '../ui/rebuild-dialog.js';

test('rebuild presentation has stable running, success and failure states',()=>{
  assert.equal(REBUILD_AUTOCLOSE_KEY,'panel.rebuildAutoclose');
  assert.deepEqual(rebuildPresentation(null),{
    state:'running',title:'Rebuilding',message:'Building xrb-host…',output:'Waiting for build output…',running:true,succeeded:false,viewJobDisabled:true,
  });
  const lines=Array.from({length:25},(_,index)=>index===22?'plugin stereo-panel':`line ${index}`);
  const running=rebuildPresentation({id:4,state:'running',lines});
  assert.equal(running.message,'Building stereo-panel…');
  assert.equal(running.output,lines.slice(-20).join('\n'));
  assert.equal(running.viewJobDisabled,false);
  const done=rebuildPresentation({id:4,state:'done',lines:['ready']});
  assert.equal(done.state,'done');assert.equal(done.title,'Rebuilt');assert.equal(done.succeeded,true);
  const failed=rebuildPresentation({id:4,state:'failed',error:'compile failed',lines:['error']});
  assert.equal(failed.state,'failed');assert.equal(failed.title,'Rebuild failed');assert.equal(failed.message,'compile failed');assert.equal(failed.succeeded,false);
  const startFailure=rebuildPresentation(null,'request failed');
  assert.equal(startFailure.state,'failed');assert.equal(startFailure.output,'request failed');assert.equal(startFailure.viewJobDisabled,true);
});

test('update presentation follows its steps and reports Git refusals and the result',()=>{
  assert.deepEqual(UPDATE_STEPS.map(step=>step.title),['Check','Fetch','LFS','Pull','Dependencies','Rebuild']);
  const start=rebuildPresentation({kind:'update',state:'running',lines:[]});
  assert.equal(start.title,'Updating');assert.equal(start.step,'check');assert.equal(start.message,'Step 1 of 6, Check: Checking the core and the workspace…');assert.equal(start.viewJobDisabled,true);
  const lfs=rebuildPresentation({id:7,kind:'update',state:'running',lines:['step check','step fetch','step lfs','Downloading LFS objects: 40% (2/5)']});
  assert.equal(lfs.step,'lfs');assert.equal(lfs.message,'Step 3 of 6, LFS: Downloading required LFS files…');assert.match(lfs.output,/40% \(2\/5\)/);
  const plugin=rebuildPresentation({id:7,kind:'update',state:'running',lines:['step rebuild','plugin tracker']});
  assert.equal(plugin.message,'Step 6 of 6, Rebuild: Rebuilding tracker…');
  const refused=rebuildPresentation({id:7,kind:'update',state:'failed',error:'Pull: Local changes would be overwritten by the update: a.txt. Commit or stash them first, then run Update again. Nothing changed.',lines:['step check','step fetch','step lfs','step pull','error: Your local changes would be overwritten']});
  assert.equal(refused.title,'Update needs attention');assert.equal(refused.step,'pull');assert.match(refused.message,/a\.txt\. Commit or stash them first/);assert.match(refused.output,/would be overwritten/);assert.equal(refused.succeeded,false);
  const summary='Core: 1111111 → 2222222. Workspace: 3333333 → 4444444. Restart required; Update did not restart the panel.';
  const done=rebuildPresentation({id:7,kind:'update',state:'done',lines:['step rebuild'],result:{state:'updated',summary}});
  assert.equal(done.title,'Updated');assert.equal(done.message,summary);assert.equal(done.succeeded,true);
  const needsRestart=rebuildPresentation({id:7,kind:'update',state:'done',result:{restartRequired:true,summary},lines:[]});
  assert.equal(needsRestart.title,'Restart required');assert.equal(needsRestart.succeeded,false,'autoclose must not hide the Restart control');
  const current=rebuildPresentation({id:7,kind:'update',state:'done',lines:['step fetch'],result:{state:'up-to-date',summary:'Workspace already up to date (1111111). Nothing was rebuilt.'}});
  assert.equal(current.title,'Already up to date','success refers to both repositories after fresh fetches');
  const notStarted=rebuildPresentation({kind:'update',state:'running',lines:[]},'The workspace is not a Git clone.');
  assert.equal(notStarted.title,'Update needs attention');assert.equal(notStarted.message,'The workspace is not a Git clone.');assert.equal(notStarted.output,'The workspace is not a Git clone.');
});

test('the behind hint and the update menu item read a status that never fetches',async()=>{
  const ui=path.resolve(import.meta.dirname,'../ui');
  const [app,index]=await Promise.all(['app.js','index.html'].map(file=>fs.readFile(path.join(ui,file),'utf8')));
  assert.match(index,/id="update-chip" class="chip rebuild" data-maintenance="update" hidden/);
  assert.match(app,/workspace behind \$\{remote\} by \$\{workspace\.behind\}/);
  assert.match(app,/Remote last checked \$\{ago\(workspace\.checkedMs\)\}/);
  assert.match(app,/item\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(app,/item\.title = updateTooltip\(status\)/);
  assert.match(app,/api\('GET', '\/api\/update'\)/);
  assert.doesNotMatch(app,/api\('POST', '\/api\/update'\)/,'only the explicit menu action starts an update');
  const [dialog,setup]=await Promise.all(['rebuild-dialog.js','desktop-setup.js'].map(file=>fs.readFile(path.join(ui,file),'utf8')));
  assert.match(dialog,/'\/api\/update', \{kind: 'update', state: 'running', lines: \[\]\}, options, 'Update', 'Update'\)/);
  assert.match(setup,/action === 'Update' \? 'Install missing prerequisites, then update core and workspace and rebuild\.'/);
  assert.match(setup,/data-desktop-build>\$\{action === 'Update' \? 'Update' : 'Rebuild'\}<\/button>/);
  // One action for both repositories: no text the person sees still says "Update workspace".
  for (const file of await fs.readdir(ui)) {
    if (!/\.(js|html|css)$/.test(file)) continue;
    assert.doesNotMatch(await fs.readFile(path.join(ui,file),'utf8'),/Update workspace|Updating workspace/,`${file} still says Update workspace`);
  }
});

test('setup action descriptions use sentence capitalization without changing job metadata',()=>{
  for(const raw of ['install desktop build tools','install desktop build tools…']){
    const job={kind:'desktop-setup',title:raw,state:'running',id:1};
    assert.equal(rebuildPresentation(job).message,'Install desktop build tools…');
    assert.equal(job.title,raw);
  }
  assert.equal(rebuildPresentation({kind:'desktop-setup',title:'install core native libraries',state:'running'}).message,'Install core native libraries…');
  assert.equal(rebuildPresentation({kind:'desktop-setup',state:'running'}).message,'Installing desktop prerequisites…');
});

test('all host rebuild entry points consume one full dialog component',async()=>{
  const ui=path.resolve(import.meta.dirname,'../ui');
  const [component,navigation,app,index,system,product]=await Promise.all(['rebuild-dialog.js','navigation.js','app.js','index.html','design-system.css','style.css'].map(file=>fs.readFile(path.join(ui,file),'utf8')));
  assert.match(component,/data-xrb-rebuild-autoclose> Autoclose on finish/);
  assert.match(component,/data-xrb-rebuild-view>View job/);
  assert.match(component,/data-xrb-rebuild-close>Close/);
  assert.match(component,/iconSvg\('check-circle'\)/);assert.match(component,/iconSvg\('error-circle'\)/);
  assert.match(component,/presentation\.succeeded && autoclose\.checked && dialog\.open/);
  assert.match(component,/destination\.searchParams\.set\('job', String\(job\.id\)\)/);
  assert.match(navigation,/import \{rebuildHostInPlace,updateInPlace\} from '\.\/rebuild-dialog\.js'/);
  assert.match(app,/import \{rebuildHostInPlace,updateInPlace,updateTooltip,followStartedJobInPlace\} from '\.\/rebuild-dialog\.js'/);
  assert.match(component,/data-xrb-rebuild-retry hidden>Retry/);
  assert.match(component,/data-xrb-rebuild-restart hidden>Restart/);
  assert.doesNotMatch(component,/The job could not start\./);
  assert.doesNotMatch(navigation,/data-xrb-rebuild-output|function rebuildDialog|function renderRebuild/);
  assert.doesNotMatch(app,/data-xrb-rebuild-output|id="host-rebuilding"/);
  assert.doesNotMatch(index,/id="host-rebuilding"|data-xrb-rebuild-dialog/);
  assert.match(system,/\.xrb-progress-status-icon/);assert.match(system,/\.xrb-progress-dialog \.ask-buttons\.is-building button/);
  assert.doesNotMatch(product,/panel-rebuilding|rebuild-status-icon|rebuild-check|rebuild-error/);
});
