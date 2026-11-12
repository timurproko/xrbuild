import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadIconModel } from '../src/icon-loader.js';

test('model imports are deduplicated but every card owns its object, failures retry with fresh bounded URLs', async () => {
  let calls = 0, objects = 0;
  const urls = [];
  const importer = async url => { urls.push(url); if (++calls < 2) throw Error('temporary'); return { default: () => ({ id: ++objects }) }; };
  const [a, b] = await Promise.all([1, 2].map(() => loadIconModel('http://localhost/preview/app/@r-icon/icon.js', 2, (o, d) => ({ o, d }), importer, async () => {})));
  assert.equal(calls, 2); assert.notEqual(a.o, b.o); assert.equal(a.d, 2);
  assert.equal(new URL(urls[1]).searchParams.get('xrb-icon-retry'), '1');
  let failures = 0;
  assert.equal(await loadIconModel('http://localhost/missing/icon.js', 1, o => o, async () => { failures++; throw Error(); }, async () => {}), null);
  assert.equal(failures, 3);
});

test('real card constructor retains synchronous geometry before attachment and disposes late icons', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const card = source.slice(source.indexOf('class AppCard extends'), source.indexOf('function clearCards()'));
  class Object3D {
    constructor() { this.children = []; this.userData = {}; this.position = { set() {}, copy() {} }; this.rotation = {}; this.scale = { multiplyScalar() {}, setScalar() {} }; }
    add(...objects) { this.children.push(...objects); objects.forEach(o => o.parent = this); }
    traverse(fn) { fn(this); this.children.forEach(o => o.traverse?.(fn)); }
    removeFromParent() { this.parent = null; }
  }
  let disposed = 0, complete;
  class Dialog extends Object3D { constructor() { super(); this.closeButton = { setEnabled() {} }; } open() {} }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  const ctx = { THREE: { Group: Object3D, Vector3: Object3D, Mesh, SphereGeometry: Object3D, MeshStandardMaterial: Object3D, RingGeometry: Object3D, MeshBasicMaterial: Object3D, ShapeGeometry: Object3D, CircleGeometry: Object3D },
    Dialog, Label: Object3D, Button: class extends Object3D { attach() {} detach() {} }, COLORS: {}, CARD_WIDTH: 1, CARD_HEIGHT: 1, CARD_REST_LIFT: 1, CARD_FACE_Z: 1, ICON_DIAMETER: 1, DEFAULT_ICON_COLORS: { blue: 'blue' },
    roundedBox() {}, roundedArc() {}, material() {}, fitIcon: o => o, wrapLines: t => t, compact: o => o, activateOnRelease() {}, xrb: { interaction: {} },
    textureLoader: { load() {} }, loadIconModel: () => new Promise(resolve => complete = resolve), loadAppIcon() { assert.fail('must use explicit model URL'); }, disposeObject() { disposed++; }, };
  vm.runInNewContext(card + '\nthis.Card=AppCard;', ctx);
  const direct = new ctx.Card({ title: 'Fresh', defaultIcon3d: true, defaultSphere: true }, 0);
  assert.equal(direct.parent, undefined); assert.ok(direct.icon3d, 'no destination app or scene attachment required');
  const pending = new ctx.Card({ title: 'Authored', route: 'http://localhost/app/', projectId: 'app', iconModelUrl: 'http://localhost/preview/app/@r-icon/icon.js' }, 1);
  pending.destroy(); complete(new Object3D()); await Promise.resolve();
  assert.equal(pending.icon3d, null); assert.equal(disposed, 2);
});
