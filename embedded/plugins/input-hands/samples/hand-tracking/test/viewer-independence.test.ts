import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

test('current built viewer opens with ws unavailable; optional support is loaded only after authenticated requests', async t => {
  const parent = process.env.XRB_TEST_ROOT || path.join(process.env.XRB_CORE!, '.artifacts/hand-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'independent-view-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const core = path.join(root, 'core'), workspace = path.join(root, 'user');
  await fs.mkdir(core); await fs.mkdir(workspace);
  const loader = path.join(root, 'no-ws.mjs');
  await fs.writeFile(loader, `export async function resolve(specifier,context,next){if(specifier==='ws')throw new Error('Fixture: ws is deliberately unavailable');return next(specifier,context);}`);
  const script = path.join(root, 'viewer.mjs');
  await fs.writeFile(script, `import http from 'node:http';import fs from 'node:fs/promises';
    const {createWorkspaceTool}=await import(${JSON.stringify(new URL('../tool.mjs', import.meta.url).href)});
    let sourceRefused=false;try{await createWorkspaceTool({plugin:{origin:'bundled'},runtimeRoot:null});}catch(error){sourceRefused=error.message.includes('checked public output');}
    const server=http.createServer();let tool;server.on('request',(req,res)=>tool.handle(req,res,()=>res.writeHead(404).end()));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
    tool=await createWorkspaceTool({core:${JSON.stringify(core)},workspace:${JSON.stringify(workspace)},server,panelOrigin:origin,route:'/hands/'});
    try{
      const view=await fetch(origin+'/hands/'),html=await view.text();
      const rejected=await fetch(origin+'/__handtracking/bridge',{method:'POST',headers:{Origin:'https://remote.test','x-handtracking-local':'1'}});
      const optional=await fetch(origin+'/__handtracking/bridge',{method:'POST',headers:{Origin:origin,'x-handtracking-local':'1'}});
      console.log(JSON.stringify({sourceRefused,status:view.status,viewer:html.includes('handtracking-panel-managed'),wall:html.includes('tool-start-card'),rejected:rejected.status,optional:optional.status,message:await optional.text(),user:await fs.readdir(${JSON.stringify(workspace)}),core:await fs.readdir(${JSON.stringify(core)})}));
    }finally{await tool.close();server.closeAllConnections();await new Promise(r=>server.close(r));}`);
  const result = await promisify(execFile)(process.execPath, ['--experimental-loader', pathToFileURL(loader).href, script]);
  const value = JSON.parse(result.stdout.trim());
  assert.equal(value.sourceRefused, true, 'managed product consumers cannot use unactivated source output');
  assert.equal(value.status, 200); assert.equal(value.viewer, true); assert.equal(value.wall, false);
  assert.equal(value.rejected, 403); assert.equal(value.optional, 503); assert.match(value.message, /optional.*runtime is unavailable/i);
  assert.deepEqual(value.user, []); assert.deepEqual(value.core, []);
});
