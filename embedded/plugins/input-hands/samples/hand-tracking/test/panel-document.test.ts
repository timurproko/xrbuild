import test from 'node:test';
import assert from 'node:assert/strict';
import {managedPanelDocument} from '../panel-document.mjs';

test('managed document replaces stale/duplicate build-time return addresses and preserves other content',()=>{
  const source=`<!doctype html><html><head><meta name="xrbuild-panel-url" content="http://127.0.0.1:5281"><meta content='http://localhost:5199' name='xrbuild-panel-url'><META NAME="handtracking-panel-managed" CONTENT="0"><meta name='handtracking-managed-bridge' content='0'><meta name="viewport" content="width=device-width"><script src="./assets/app.js"></script></head><body>Tool</body></html>`;
  const html=managedPanelDocument(source,'http://127.0.0.1:5184');
  for(const name of ['xrbuild-panel-url','handtracking-panel-managed','handtracking-managed-bridge'])assert.equal((html.match(new RegExp(`name="${name}"`,'g'))??[]).length,1);
  assert.match(html,/<meta name="xrbuild-panel-url" content="http:\/\/127\.0\.0\.1:5184">/);
  assert.doesNotMatch(html,/5281|5199|content=['"]0/i);
  assert.ok(html.includes('<meta name="viewport" content="width=device-width"><script src="./assets/app.js"></script>'));
  assert.equal(managedPanelDocument(html,'http://127.0.0.1:5184'),html,'replacement is idempotent');
  assert.match(managedPanelDocument('<head></head>','http://localhost:5185/'),/content="http:\/\/localhost:5185"/);
});
test('managed document rejects non-panel origins and missing document head',()=>{
  for(const origin of ['https://example.test','http://127.0.0.1','http://user:pass@127.0.0.1:5184','http://127.0.0.1:5184/path','http://127.0.0.1:5184/?a=1'])assert.throws(()=>managedPanelDocument('<head></head>',origin));
  assert.throws(()=>managedPanelDocument('<body>broken</body>','http://127.0.0.1:5184'),/no head/);
});
