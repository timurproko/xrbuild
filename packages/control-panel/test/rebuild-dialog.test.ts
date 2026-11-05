import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {REBUILD_AUTOCLOSE_KEY,rebuildPresentation} from '../ui/rebuild-dialog.js';

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
  assert.equal(startFailure.state,'failed');assert.equal(startFailure.output,'The job could not start.');assert.equal(startFailure.viewJobDisabled,true);
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
  assert.match(navigation,/import \{rebuildHostInPlace\} from '\.\/rebuild-dialog\.js'/);
  assert.match(app,/import \{rebuildHostInPlace\} from '\.\/rebuild-dialog\.js'/);
  assert.doesNotMatch(navigation,/data-xrb-rebuild-output|function rebuildDialog|function renderRebuild/);
  assert.doesNotMatch(app,/data-xrb-rebuild-output|id="host-rebuilding"/);
  assert.doesNotMatch(index,/id="host-rebuilding"|data-xrb-rebuild-dialog/);
  assert.match(system,/\.xrb-progress-status-icon/);assert.match(system,/\.xrb-progress-dialog \.ask-buttons\.is-building button/);
  assert.doesNotMatch(product,/panel-rebuilding|rebuild-status-icon|rebuild-check|rebuild-error/);
});
