import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { checkoutFetchedCommit, resumeProtectedCheckout, CHECKOUT_JOURNAL } from '../src/update-checkout.ts';
import { fixture, git, ENV } from './helpers/update-fixture.ts';

const points = ['prepare', 'partial-manifest', 'manifest-synced', 'publish-before', 'publish-after', 'lease-before', 'lease-after',
  'source-before', 'source-after', 'ref-before', 'ref-after', 'index-before', 'index-after', 'retire-before', 'retire-after', 'cleanup',
  'legacy-initial-next', 'legacy-initial-partial', 'legacy-ready-next', 'legacy-ready-partial'];

test('every protected-checkout publication resumes or rolls back without Git metadata surgery', { concurrency: 2 }, async t => {
  const cases = ['file-edit', 'file-to-directory', 'directory-to-file'].flatMap(layout => points.map(point => ({ layout, point })));
  await Promise.all(cases.map(({ layout, point }) => t.test(`${layout}: ${point}`, async t => {
    const f = await fixture(t), dir = f.workspace.checkout;
    if (layout === 'directory-to-file') {
      await fs.unlink(path.join(f.workspace.publisher, 'shared.txt'));
      await fs.mkdir(path.join(f.workspace.publisher, 'shared.txt'));
      await fs.writeFile(path.join(f.workspace.publisher, 'shared.txt/child.txt'), 'base child\n');
    }
    await f.workspace.publish('xrb-plugins.json', 'base\n');
    git(dir, 'fetch', '-q', 'origin'); git(dir, 'merge', '-q', '--ff-only', 'origin/main');
    const before = f.workspace.head(); await fs.writeFile(path.join(dir, 'xrb-plugins.json'), 'personal\n');
    await fs.writeFile(path.join(f.workspace.publisher, 'xrb-plugins.json'), 'incoming defaults\n');
    if (layout === 'file-to-directory') {
      await fs.unlink(path.join(f.workspace.publisher, 'shared.txt'));
      await fs.mkdir(path.join(f.workspace.publisher, 'shared.txt'));
      await fs.writeFile(path.join(f.workspace.publisher, 'shared.txt/child.txt'), 'incoming child\n');
    } else if (layout === 'directory-to-file') {
      await fs.rm(path.join(f.workspace.publisher, 'shared.txt'), { recursive: true });
      await fs.writeFile(path.join(f.workspace.publisher, 'shared.txt'), 'incoming parent\n');
    } else await fs.writeFile(path.join(f.workspace.publisher, 'shared.txt'), 'incoming source\n');
    const target = await f.workspace.publish('other.txt', 'incoming sibling\n');
    git(dir, 'fetch', '-q', 'origin');
    const script = `import fs from 'node:fs/promises';
      import {checkoutFetchedCommit} from ${JSON.stringify(new URL('../src/update-checkout.ts', import.meta.url).href)};
      import {runGit} from ${JSON.stringify(new URL('../src/update.ts', import.meta.url).href)};
      const point=${JSON.stringify(point)},dir=${JSON.stringify(dir)},root=${JSON.stringify(path.join(dir, '.git', CHECKOUT_JOURNAL))};
      const exit=()=>process.exit(88),rename=fs.rename.bind(fs),link=fs.link.bind(fs),open=fs.open.bind(fs),mkdir=fs.mkdtemp.bind(fs),rm=fs.rm.bind(fs);
      const legacy=async(initial,partial)=>{const file=root+'/journal.json',value={...JSON.parse(await fs.readFile(file,'utf8')),version:1,phase:'checkout'};
        await fs.writeFile(file,JSON.stringify(value));
        if(!initial){const lock=dir+'/.git/index.lock',s=await fs.lstat(lock,{bigint:true});
          for(const name of await fs.readdir(root))if(name.startsWith('lease-'))await fs.unlink(root+'/'+name);
          await fs.writeFile(lock,'legacy-owner-token');
          await fs.writeFile(root+'/owner.json',JSON.stringify({pid:process.pid,token:'legacy-owner-token',inode:String(s.ino),device:String(s.dev)}));}
        const next=JSON.stringify({...value,phase:initial?'checkout':'ready'});
        await fs.writeFile(root+'/journal.next',partial?next.slice(0,20):next);
        const h=await open(root+'/journal.next','r+');await h.sync();await h.close();if(initial)await fs.unlink(file);exit();};
      fs.mkdtemp=async(...args)=>{const value=await mkdir(...args);if(point==='prepare'&&String(args[0]).includes('.prepare-'))exit();return value;};
      fs.open=async(...args)=>{const h=await open(...args);if(String(args[0]).endsWith('journal.json')&&String(args[0]).includes('.prepare-')){
        if(point==='partial-manifest'){h.writeFile=async text=>{await h.write(String(text).slice(0,20));exit();};}
        if(point==='manifest-synced'){const sync=h.sync.bind(h);h.sync=async()=>{await sync();exit();};}
      }return h;};
      fs.rename=async(from,to)=>{const a=String(from),b=String(to),publish=a.includes('.prepare-')&&b===root,index=a.endsWith('index.lock')&&b.endsWith('index'),retire=a===root&&b.includes('.done-');
        if(publish&&point==='publish-before'||index&&point==='index-before'||retire&&point==='retire-before')exit();
        const value=await rename(from,to);
        if(publish&&point==='publish-after'||index&&point==='index-after'||retire&&point==='retire-after')exit();
        if(publish&&point==='legacy-initial-next')await legacy(true,false);
        if(publish&&point==='legacy-initial-partial')await legacy(true,true);
        return value;};
      fs.link=async(from,to)=>{if(point==='lease-before'&&String(to).endsWith('index.lock'))exit();const value=await link(from,to);if(point==='lease-after'&&String(to).endsWith('index.lock'))exit();return value;};
      fs.rm=async(file,...args)=>{if(point==='cleanup'&&String(file).includes('.done-')){await fs.unlink(String(file)+'/journal.json');exit();}return rm(file,...args);};
      const git=async(args,cwd,opts)=>{const source=args[0]==='read-tree'&&args.includes('-u')&&!args.includes('-n'),ref=args[0]==='update-ref';
        if(source&&point==='source-before'){await fs.writeFile(opts.env.GIT_INDEX_FILE+'.lock','interrupted temporary Git index');exit();}
        if(ref&&point==='ref-before')exit();
        if(ref&&point==='legacy-ready-next')await legacy(false,false);
        if(ref&&point==='legacy-ready-partial')await legacy(false,true);
        const value=await runGit(args,cwd,opts);
        if(source&&point==='source-after'||ref&&point==='ref-after')exit();return value;};
      await checkoutFetchedCommit(dir,{git,workspace:true,before:${JSON.stringify(before)},target:${JSON.stringify(target)},branch:'main',line(){},ensureUnchanged:async()=>{}});`;
    await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { env: ENV, timeout: 60000 }), error => (error as { code: number }).code === 88);
    // No deleting journal.next, locks or index files in the test: the next run must handle every on-disk state itself.
    for (let retry = 0; retry < 2; retry++) {
      await resumeProtectedCheckout(dir, f.runner, f.ctx.line);
      if (f.workspace.head() !== target) await checkoutFetchedCommit(dir, { git: f.runner, workspace: true, before: f.workspace.head(), target, branch: 'main', line: f.ctx.line, ensureUnchanged: async () => {} });
    }
    assert.equal(f.workspace.head(), target);
    const source = layout === 'file-to-directory' ? 'shared.txt/child.txt' : 'shared.txt';
    assert.equal(await fs.readFile(path.join(dir, source), 'utf8'), layout === 'file-to-directory' ? 'incoming child\n' : layout === 'directory-to-file' ? 'incoming parent\n' : 'incoming source\n');
    assert.equal(await fs.readFile(path.join(dir, 'other.txt'), 'utf8'), 'incoming sibling\n');
    assert.equal(await fs.readFile(path.join(dir, 'xrb-plugins.json'), 'utf8'), 'personal\n');
    assert.equal(await fs.stat(path.join(dir, '.git/index.lock')).then(() => true, () => false), false);
    assert.equal((await fs.stat(path.join(dir, '.git/index'))).nlink, 1);
    assert.ok(!(await fs.readdir(path.join(dir, '.git'))).some(name => name.startsWith(CHECKOUT_JOURNAL)));
  })));
});
