import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { withBrowser } from './browser-fixture.ts';

test('Launcher default geometry renders on first construction without app navigation', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const source = await fs.readFile(new URL('../../../embedded/projects/core/launcher/src/main.js', import.meta.url), 'utf8');
  const card = source.slice(source.indexOf('class AppCard extends'), source.indexOf('function clearCards()'));
  const three = await fs.readFile(path.join(path.dirname(createRequire(new URL('../../sdk/package.json', import.meta.url)).resolve('three')), 'three.module.js'), 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/three.js') { res.setHeader('content-type', 'text/javascript'); res.end(three); return; }
    res.setHeader('content-type', 'text/html');
    res.end(`<script type="module">
      import * as THREE from '/three.js';
      class Dialog extends THREE.Group { constructor(){super();this.closeButton={setEnabled(){}};}open(){} update(){} }
      class Label extends THREE.Group {}
      class Button extends THREE.Group {attach(){}detach(){}update(){} }
      const COLORS={},CARD_WIDTH=1,CARD_HEIGHT=1,CARD_REST_LIFT=0,CARD_FACE_Z=0,ICON_DIAMETER=0.1,DEFAULT_ICON_COLORS={blue:'blue',amber:'orange'};
      const roundedBox=()=>new THREE.BoxGeometry(0.1,0.1,0.01), roundedArc=()=>new THREE.CircleGeometry(0.01),material=()=>new THREE.MeshBasicMaterial(),wrapLines=t=>t,compact=o=>o,activateOnRelease=()=>{},xrb={interaction:{}},fitIcon=o=>o,textureLoader={load(){}},disposeObject=o=>o.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
      ${card}
      const app={title:'Never launched',defaultIcon3d:true,defaultSphere:true,iconColor:'amber'};
      const item=new AppCard(app,0);window.beforeAttach=!!item.icon3d;
      const scene=new THREE.Scene();scene.add(item,new THREE.HemisphereLight(0xffffff,0x444444,3));
      item.icon3d.scale.setScalar(1);
      const camera=new THREE.PerspectiveCamera(60,1,0.01,100);camera.position.z=3;
      const renderer=new THREE.WebGLRenderer();renderer.setSize(128,128);document.body.append(renderer.domElement);renderer.render(scene,camera);
      window.result={icon:!!item.icon3d,mesh:item.icon3d.isMesh,color:item.icon3d.material.color.getHexString(),calls:renderer.info.render.calls};
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(`http://127.0.0.1:${(server.address() as { port: number }).port}/`, '!!window.result');
    assert.equal(await evaluate('beforeAttach'), true);
    const result = await evaluate('result');
    assert.equal(result.icon, true); assert.equal(result.mesh, true); assert.equal(result.color, 'ffa500'); assert.ok(result.calls > 0);
  });
});
