import assert from 'node:assert/strict';
import test from 'node:test';
import { HandInput } from '../src/hands.ts';
import { HandFrameIngress, handSourcePolicy, prepareHandFrame } from '../src/hand-source.ts';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import { handsMessage } from './fixtures.ts';
import { appLaunchUrl, appLaunchContext } from '../src/launch-context.ts';

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
