import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { appLaunchContext, appLaunchUrl, appResumeProjectionFromLocation, appResumeUrl } from '../src/launch-context.ts';
import { returnTargetFromLaunch } from '../src/return-overlay.ts';

test('one bounded launch context carries return and projection across distribution origins', () => {
  const sameOrigin = appLaunchUrl('http://127.0.0.1:5182/preview/ui-kit/?xrb-xr=enter', {
    returnUrl: 'http://127.0.0.1:5182/preview/launcher/', projection: 'orthographic',
  });
  assert.equal(new URL(sameOrigin).searchParams.get('xrb-xr'), 'enter');
  assert.deepEqual(appLaunchContext(sameOrigin), {
    returnUrl: 'http://127.0.0.1:5182/preview/launcher/', projection: 'orthographic',
  });
  assert.equal(returnTargetFromLaunch(sameOrigin), 'http://127.0.0.1:5182/preview/launcher/');

  const nativeToPublished = appLaunchUrl('https://xrbuild.dev/apps/ui-kit/?xrb-xr=enter', {
    returnUrl: 'https://app.local/', projection: 'perspective',
  });
  assert.deepEqual(appLaunchContext(nativeToPublished), {
    returnUrl: 'https://app.local/', projection: 'perspective',
  });
});

test('loopback launcher navigation preserves one preview run scope across apps and return', () => {
  const launcher = 'http://127.0.0.1:5182/preview/launcher/?xrb-preview-route=%2Fpreview%2Flauncher%2F&xrb-preview-token=preview-token-1234&xrb-preview-panel=http%3A%2F%2F127.0.0.1%3A5191';
  const first = new URL(appLaunchUrl('http://127.0.0.1:5182/preview/ui-kit/', { returnUrl: launcher, projection: 'orthographic' }));
  assert.equal(first.searchParams.get('xrb-preview-route'), '/preview/launcher/');
  assert.equal(first.searchParams.get('xrb-preview-token'), 'preview-token-1234');
  assert.equal(first.searchParams.get('xrb-preview-panel'), 'http://127.0.0.1:5191');

  const resumed = appResumeUrl(appLaunchContext(first.href)!.returnUrl, 'perspective');
  assert.equal(new URL(resumed).searchParams.get('xrb-preview-route'), '/preview/launcher/');
  const second = new URL(appLaunchUrl('http://localhost:5182/preview/another/', { returnUrl: resumed, projection: 'perspective' }));
  assert.equal(second.searchParams.get('xrb-preview-route'), '/preview/launcher/');
  assert.equal(second.searchParams.get('xrb-preview-token'), 'preview-token-1234');
  assert.equal(second.searchParams.get('xrb-preview-panel'), 'http://127.0.0.1:5191');

  const published = new URL(appLaunchUrl('https://apps.example/demo/', { returnUrl: launcher, projection: 'orthographic' }));
  assert.equal(published.searchParams.has('xrb-preview-route'), false, 'preview control does not cross into a public route');
  assert.equal(published.searchParams.has('xrb-preview-token'), false);
  assert.equal(published.searchParams.has('xrb-preview-panel'), false);
});

test('return navigation carries the destination current projection without nesting launch context', () => {
  const local = appResumeUrl('http://127.0.0.1:5182/preview/launcher/?xrb-panel=local&xrb-launch=1&xrb-return=https%3A%2F%2Fstale.example%2F', 'orthographic');
  assert.equal(appResumeProjectionFromLocation(new URL(local).search, { href: local }), 'orthographic');
  assert.equal(new URL(local).searchParams.get('xrb-panel'), 'local');
  assert.equal(new URL(local).searchParams.has('xrb-return'), false);
  assert.equal(appLaunchContext(local), null);

  const published = appResumeUrl('https://apps.example/launcher/', 'perspective');
  assert.equal(appResumeProjectionFromLocation(new URL(published).search, { href: published }), 'perspective');
  assert.throws(() => appResumeUrl('javascript:alert(1)', 'perspective'), /HTTP/);
});

test('the return control reuses the destination runtime instead of creating another one', async () => {
  const [control, runtime] = await Promise.all([
    readFile(new URL('../src/return-control.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(control, /createXrb|WebGLRenderer|HostChannel/);
  assert.doesNotMatch(control, /createElement\(['"]button/, 'the canvas keeps pointer events so the standard cursor remains visible');
  assert.match(control, /CAP_RADIUS = 0\.0125[\s\S]*roundedDisc\(CAP_RADIUS[\s\S]*#d6dbe3[\s\S]*state\.mouseOver/, 'the close control is a half-size UI-kit round button with hover feedback');
  assert.match(control, /playFeedback\('press'\)[\s\S]*playFeedback\('release'\)/, 'the close control has standard press and release sounds');
  assert.match(control, /appResumeUrl[\s\S]*coverForNavigation\(\)/, 'navigation waits for the dark fade');
  assert.match(runtime, /loadReturnOverlay\(this\.interaction\)/);
  assert.match(runtime, /resumedPageCover[\s\S]*revealResumeCover\(\)/, 'the resumed launcher fades in after its first frame');
  assert.match(runtime, /this\.returnControl\?\.attach\(scene, this\.view\.panel, this\.visibleDisplay\(\), isOrthographicCamera\(camera\)/);
  assert.match(control, /appResumeUrl\(this\.returnUrl, this\.projection\)/);
});

test('direct, malformed and unbounded links have no return control', () => {
  assert.equal(returnTargetFromLaunch('https://apps.example/apps/globe/'), null);
  assert.equal(returnTargetFromLaunch('https://apps.example/apps/globe/?xrb-return=https%3A%2F%2Flauncher.example%2F'), null, 'the versioned launch marker is required');
  assert.equal(returnTargetFromLaunch('https://apps.example/apps/globe/?xrb-launch=1&xrb-return=javascript%3Aalert(1)'), null);
  assert.equal(returnTargetFromLaunch('not a url'), null);
  assert.throws(() => appLaunchUrl('https://apps.example/apps/globe/', { returnUrl: 'javascript:alert(1)' }), /HTTP/);
});
