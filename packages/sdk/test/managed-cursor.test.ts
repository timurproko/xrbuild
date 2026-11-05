import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { appLaunchUrl, appResumeUrl, createXrbApp } from '../src/index.ts';
import { FakeSocket, viewMessage } from './fixtures.ts';

for (const cursorStyle of ['system', 'ring', 'ring-dot'] as const) for (const projection of ['perspective', 'orthographic'] as const) {
  for (const disabledBy of ['none', 'option', 'launch'] as const) {
    test(`managed ${projection} ${cursorStyle} cursor, mouse disabled by ${disabledBy}`, () => {
      const g = globalThis as typeof globalThis & Record<string, unknown>;
      const saved = new Map(['innerWidth', 'innerHeight', 'location'].map(key => [key, g[key]]));
      Object.assign(g, { innerWidth: 1600, innerHeight: 900, location: { search: disabledBy === 'launch' ? '?xrb-mouse=0' : '' } });
      const handlers = new Map<string, (event: PointerEvent) => void>();
      const renderer = {
        domElement: {
          style: { cursor: 'crosshair' }, addEventListener: (name: string, handler: (event: PointerEvent) => void) => handlers.set(name, handler),
          removeEventListener: (name: string) => handlers.delete(name),
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
        },
        xr: { isPresenting: false, enabled: false, getSession: () => null },
        setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setAnimationLoop() {}, render() {},
      } as unknown as THREE.WebGLRenderer;
      let app: ReturnType<typeof createXrbApp> | undefined;
      try {
        app = createXrbApp(renderer, { projection, xrb: { mouse: disabledBy !== 'option', pointer: false, cursor: cursorStyle }, autoStart: false });
        assert.equal(app.xrb.cursorObject.parent, app.scene, 'no per-app cursor setup');
        assert.equal(app.xrb.mouseEnabled, disabledBy === 'none');
        assert.equal(app.xrb.cursorStyle, cursorStyle);
        assert.equal(renderer.domElement.style.cursor, disabledBy === 'none' && cursorStyle === 'system' ? 'auto' : 'none');
        app.xrb.render(app.scene, app.camera);
        handlers.get('pointermove')?.({ clientX: 800, clientY: 450 } as PointerEvent);
        app.xrb.render(app.scene, app.camera);
        assert.equal(app.xrb.cursorObject.visible, disabledBy === 'none' && cursorStyle !== 'system');
        if (disabledBy === 'none') {
          assert.ok(app.xrb.cursorObject.position.length() < 1e-8, 'ring follows mouse onto the glass');
          handlers.get('pointerleave')?.({} as PointerEvent);
          app.xrb.render(app.scene, app.camera);
          assert.equal(app.xrb.cursorObject.visible, false);
        } else {
          app.xrb.bindMouse();
          assert.equal(handlers.has('pointermove'), false, 'explicit legacy binding cannot bypass disabled Mouse');
        }
        const cursor = app.xrb.cursorObject;
        app.dispose(); app = undefined;
        assert.equal(cursor.parent, null);
        assert.equal(renderer.domElement.style.cursor, 'crosshair', 'disposal restores the original element cursor');
      } finally {
        app?.dispose();
        for (const [key, value] of saved) { if (value === undefined) delete g[key]; else g[key] = value; }
      }
    });
  }
}

for (const style of ['system', 'ring', 'ring-dot'] as const) for (const disabled of ['none', 'host', 'option']) test(`native ${style} cursor survives view switches; disabled by ${disabled}`, () => {
  const g = globalThis as typeof globalThis & Record<string, any>;
  const saved = new Map(['__XRB_HOST__', 'WebSocket', 'location'].map(key => [key, g[key]]));
  const styles: string[] = [];
  FakeSocket.all.length = 0;
  Object.assign(g, { location: { search: `?xrb-cursor=${style}` }, WebSocket: FakeSocket, __XRB_HOST__: {
    version: 2, stereo: false, switchable: true, mouseEnabled: disabled !== 'host',
    display: { widthM: 0.6, heightM: 0.34, tiltRad: 0, pixelsW: 800, pixelsH: 450 },
    eye: { width: 800, height: 450 }, channel: { url: 'ws://127.0.0.1:1/?token=t' }, hostNow: () => 1000,
    setCursorStyle: (value: string) => styles.push(value),
  } });
  const renderer = {
    domElement: { style: { cursor: 'crosshair' }, addEventListener() {}, removeEventListener() {} },
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {},
  } as unknown as THREE.WebGLRenderer;
  let app: ReturnType<typeof createXrbApp> | undefined;
  try {
    app = createXrbApp(renderer, { xrb: { mouse: disabled !== 'option', pointer: false, cursor: 'ring-dot' }, autoStart: false });
    assert.equal(app.xrb.cursorStyle, style, 'launch preference wins over app default');
    assert.equal(app.xrb.mouseEnabled, disabled === 'none');
    assert.deepEqual(styles, [disabled === 'none' ? style : 'ring-dot']);
    for (const stereo of [true, false, true]) {
      FakeSocket.all[0].receive(viewMessage(stereo, true, 800, 450));
      assert.equal(app.xrb.stereo, stereo);
      assert.equal(renderer.domElement.style.cursor, disabled === 'none' && style === 'system' ? 'auto' : 'none');
      assert.equal(styles.length, 1, 'view switches do not replace native cursor policy');
    }
    app.dispose(); app = undefined;
    assert.equal(styles.at(-1), 'system');
    assert.equal(renderer.domElement.style.cursor, 'crosshair');
  } finally {
    app?.dispose();
    for (const [key, value] of saved) { if (value === undefined) delete g[key]; else g[key] = value; }
  }
});

test('Mouse input selection follows launcher destinations and returns', () => {
  for (const mouse of ['0', '1']) {
    const launcher = `http://127.0.0.1:5181/preview/launcher/?xrb-mouse=${mouse}`;
    const destination = appLaunchUrl('http://127.0.0.1:5181/preview/test/', { returnUrl: launcher });
    assert.equal(new URL(destination).searchParams.get('xrb-mouse'), mouse);
    assert.equal(new URL(appResumeUrl(launcher, 'perspective')).searchParams.get('xrb-mouse'), mouse);
  }
});
