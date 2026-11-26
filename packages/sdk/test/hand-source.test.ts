import assert from 'node:assert/strict';
import test from 'node:test';
import { HandInput } from '../src/hands.ts';
import { HandFrameIngress, handSourcePolicy, prepareHandFrame } from '../src/hand-source.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
import { appLaunchUrl, appLaunchContext, appResumeUrl, isNativeLauncherDocument } from '../src/launch-context.ts';

const frame = (time: number): HandsMessage => decodeMessage(handsMessage([{ id: 1, grabbing: true, pinch: true }], time)) as HandsMessage;
test('one identity ingress preserves capability/gesture fields and current native gesture traces', () => {
  const direct = new HandInput({ nativePinch: true }), shared = new HandInput({ nativePinch: true });
  const ingress = new HandFrameIngress(shared, 'native');
  const directEvents: string[] = [], sharedEvents: string[] = [];
  direct.on(e => directEvents.push(e.type)); shared.on(e => sharedEvents.push(e.type));
  for (const t of [0, 16, 32, 48, 64]) {
    const message = frame(t);
    assert.equal(prepareHandFrame(message), message, 'optional fields and capability mask are not reinterpreted');
    direct.push(message, t); assert.equal(ingress.push('native', message, t), true);
    assert.deepEqual(shared.sample(t + 8), direct.sample(t + 8));
  }
  assert.deepEqual(sharedEvents, directEvents);
  assert.ok(shared.sample(72)[0].grabbing);
});

test('source policy prevents WebXR injection, resets immediately and excludes retired sessions', () => {
  const input = new HandInput(), native = new HandFrameIngress(input, 'native');
  assert.equal(native.push('webxr', frame(0), 0), false);
  native.push('native', frame(0), 0);
  const retired = native.generation; native.reset(10);
  assert.equal(input.count, 0);
  assert.equal(native.push('native', frame(20), 20, retired), false);
  native.close(); assert.equal(native.push('native', frame(30), 30), false);
  const off = new HandFrameIngress(input, 'off'); assert.equal(off.push('webxr', frame(40), 40), false);
  const webxr = new HandFrameIngress(input, 'webxr'); assert.equal(webxr.push('webxr', frame(50), 50), true);
});

test('native, synthetic-style skeleton-only and WebXR data expose the same app API with derived gestures', () => {
  const apiKeys: string[][] = [];
  for (const source of ['native', 'webxr'] as const) {
    for (const capabilities of [0, 7]) {
      const input = new HandInput({ smoothing: false, prediction: false, nativePinch: true });
      const ingress = new HandFrameIngress(input, source);
      for (const time of [0, 16, 32]) {
        const message = frame(time);
        message.capabilities = { pinch: !!capabilities, grab: !!capabilities, palm: !!capabilities };
        message.hands[0].keypoints[4] = [...message.hands[0].keypoints[8]];
        ingress.push(source, message, time);
      }
      const hand = input.sample(32)[0];
      apiKeys.push(Object.keys(hand).sort());
      assert.equal(hand.pinching, true, 'skeleton-only providers get keypoint-derived pinch through the same API');
      assert.equal(typeof hand.grabbing, 'boolean'); assert.ok(hand.pinchPoint); assert.equal(hand.keypoints.length, 21);
    }
  }
  for (const keys of apiKeys) assert.deepEqual(keys, apiKeys[0]);
});

test('native execution metadata survives nested launch/resume and its marker stays local to the owning panel', () => {
  const panel = 'http://127.0.0.1:5180';
  const root = `https://app.local/index.html?xrb-panel=${encodeURIComponent(panel + '/')}&xrb-hand=native&xrb-hand-profile-run=native-profile-123456789`;
  const first = appLaunchUrl(panel + '/preview/first/', { returnUrl: root });
  assert.equal(isNativeLauncherDocument(first, panel), true);
  const second = appLaunchUrl(panel + '/preview/second/', { returnUrl: first });
  assert.equal(isNativeLauncherDocument(second, panel), true);
  assert.equal(new URL(second).searchParams.get('xrb-hand-profile-run'), 'native-profile-123456789');
  assert.equal(new URL(appResumeUrl(first, 'perspective')).searchParams.get('xrb-hand-profile-run'), 'native-profile-123456789');
  assert.equal(isNativeLauncherDocument(appResumeUrl(first, 'perspective'), panel), true);
  assert.equal(isNativeLauncherDocument(first, 'http://127.0.0.1:1'), false);
  assert.equal(isNativeLauncherDocument(panel + '/preview/first/?xrb-hand=native', panel), false);
  const foreign = appLaunchUrl('https://published.example/preview/app/', { returnUrl: root });
  assert.equal(new URL(foreign).searchParams.has('xrb-native-root'), false);
  const dev = appLaunchUrl(panel + '/preview/app/', { returnUrl: `http://localhost:5173/?xrb-panel=${encodeURIComponent(panel + '/')}&xrb-hand=native` });
  assert.equal(isNativeLauncherDocument(dev, panel), false);
  assert.equal(isNativeLauncherDocument(dev, panel, true), true);
  const browser = appLaunchUrl(panel + '/preview/app/', { returnUrl: `${panel}/preview/launcher/?xrb-panel=${encodeURIComponent(panel + '/')}&xrb-hand=off&xrb-preview-token=browser-token-12345` });
  assert.equal(isNativeLauncherDocument(browser, panel, true), false);
});

test('managed and packaged source policy is bounded and survives trusted launcher navigation', () => {
  assert.equal(handSourcePolicy(false), 'webxr'); assert.equal(handSourcePolicy(true), 'native');
  assert.equal(handSourcePolicy(false, '?xrb-hand=off'), 'off');
  assert.equal(handSourcePolicy(false, '?xrb-hand=webxr', 'off'), 'off', 'package snapshot wins over a launcher query');
  assert.equal(handSourcePolicy(false, '?xrb-hand=arbitrary'), 'webxr');
  const href = appLaunchUrl('http://127.0.0.1:5180/preview/app/', { returnUrl: 'http://127.0.0.1:5180/preview/launcher/?xrb-hand=webxr' });
  assert.equal(new URL(href).searchParams.get('xrb-hand'), 'webxr');
  assert.ok(appLaunchContext(href));
  const off = appLaunchUrl('http://127.0.0.1:5180/preview/app/?xrb-hand=off', { returnUrl: 'http://127.0.0.1:5180/preview/launcher/?xrb-hand=webxr' });
  assert.equal(new URL(off).searchParams.get('xrb-hand'), 'off');
  assert.equal(appLaunchContext('https://app.example/?xrb-launch=1&xrb-return=https://foreign.example/&xrb-hand=webxr'), null);
});
