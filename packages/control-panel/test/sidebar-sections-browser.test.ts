import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('sidebar combines origins, hides empty groups and retains section action indices', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const workspace = await fs.mkdtemp(path.join(REPO, '.artifacts/sidebar-sections-'));
  const core = path.join(workspace, 'core');
  const project = async (root: string, rel: string) => {
    const dir = path.join(root, 'projects', rel);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name: path.basename(rel), kind: 'app', entry: 'dist' }));
  };
  await project(workspace, 'Demos/user');
  await project(workspace, 'tools/tool');
  await project(workspace, 'Unsorted/loose');
  await project(path.join(core, 'embedded'), 'demos/sample');
  await project(path.join(core, 'embedded'), 'unsorted/test');
  await fs.mkdir(path.join(workspace, 'projects/empty'));
  await fs.writeFile(path.join(workspace, 'xrb-panel.json'), JSON.stringify({ sections: [
    { name: 'Demos', items: ['bundled:sample', 'user'] }, { name: 'empty', items: [] }, { name: 'tools', items: ['tool'] },
  ] }));
  const port = await freePort(), panel = createServer({ repo: core, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); });
  const library = async () => (await (await fetch(`${panel.url}api/projects`)).json()) as any;
  await withBrowser(async ({ evaluate, navigate }) => {
    const until = async (expr: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(expr)) return; await sleep(50); } assert.fail(expr); };
    const groups = () => evaluate(`[...document.querySelectorAll('#projects .sec')].map(s=>({name:s.querySelector('.sec-name').textContent,index:Number(s.dataset.sec),items:[...s.querySelectorAll('.proj')].map(p=>p.dataset.id)}))`);
    await navigate(panel.url, `document.querySelectorAll('#projects .proj').length===5`);
    assert.deepEqual(await groups(), [
      { name: 'Demos', index: 0, items: ['bundled:sample', 'user'] },
      { name: 'tools', index: 2, items: ['tool'] },
      { name: 'Unsorted', index: -1, items: ['bundled:test', 'loose'] },
    ]);
    assert.equal(await evaluate(`document.querySelector('#projects').textContent.includes('Drag projects here.')`), false);
    // Move across the hidden slot; the original indices must be retained for rename and drag too.
    await evaluate(`document.querySelector('.sec[data-sec="2"] .sec-head').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));document.querySelector('#sec-menu [data-act="up"]').click()`);
    await until(`document.querySelector('#projects .sec-name')?.textContent==='tools'`);
    for (let i = 0; i < 100 && (await library()).layout.sections[0]?.name !== 'tools'; i++) await sleep(50);
    assert.deepEqual((await library()).layout.sections.map((s: any) => s.name), ['tools', 'empty', 'demos'], await evaluate(`document.querySelector('#ask-details').textContent`));
    await evaluate(`document.querySelector('.sec[data-sec="2"] .sec-head').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));const input=document.querySelector('.sec-input');input.value='samples';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
    await until(`document.querySelector('.sec[data-sec="2"] .sec-name')?.textContent==='samples'`);
    for (let i = 0; i < 100 && (await library()).layout.sections[2]?.name !== 'samples'; i++) await sleep(50);
    await evaluate(`const p=document.querySelector('.proj[data-id="loose"]'), target=document.querySelector('.sec[data-sec="2"]'), data=new DataTransfer();p.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));p.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}))`);
    await until(`document.querySelector('.sec[data-sec="2"] .proj[data-id="loose"]')!==null`);
    for (let i = 0; i < 100 && !(await library()).layout.sections[2]?.items.includes('loose'); i++) await sleep(50);
    assert.deepEqual((await library()).layout.sections[2].items, ['bundled:sample', 'user', 'loose']);
    // The naming dialog stays usable, but completed empty sections do not become drop placeholders.
    await evaluate(`document.querySelector('.sec-head').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));document.querySelector('#sec-menu [data-act="new"]').click()`);
    await until(`document.querySelector('#ask').open`);
    await evaluate(`document.querySelector('#ask-input').value='vacant';document.querySelector('#ask-ok').click()`);
    await until(`!document.querySelector('#ask').open`);
    for (let i = 0; i < 100 && !(await library()).layout.sections.some((s: any) => s.name === 'vacant'); i++) await sleep(50);
    await navigate(panel.url, `document.querySelectorAll('#projects .proj').length===5`);
    assert.deepEqual((await groups()).map((s: any) => s.name), ['tools', 'samples', 'Unsorted']);
    for (const id of ['bundled:test', 'tool', 'bundled:sample', 'user', 'loose']) {
      assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/projects/${encodeURIComponent(id)}/archive',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return r.status})()`), 200);
    }
    await navigate(panel.url, `document.querySelector('[data-view="archive"] .xrb-tab-count')?.textContent==='5'`);
    await evaluate(`document.querySelector('[data-view="projects"]').click()`);
    assert.deepEqual(await groups(), [], 'no empty headings when every project is archived');
    assert.equal(await evaluate(`!!document.querySelector('#new-project')`), true);
    assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/projects/bundled%3Aarchive%2Ftest/unarchive',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return r.status})()`), 200);
    await navigate(panel.url, `document.querySelectorAll('#projects .proj').length===1`);
    assert.deepEqual((await groups()).map((s: any) => [s.name, s.items]), [['Unsorted', ['bundled:test']]]);
    const saved = JSON.parse(await fs.readFile(path.join(workspace, 'xrb-panel.json'), 'utf8'));
    assert.ok(saved.sections.some((s: any) => s.name === 'empty'), 'unrelated actions retain intentionally empty organization');
    assert.ok(saved.sections.some((s: any) => s.name === 'vacant'));
  });
});
