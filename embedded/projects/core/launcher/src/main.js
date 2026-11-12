import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Glasses } from 'lucide';
import { appLaunchUrl, createXrbApp, fitIcon, loadAppIcon, rendererOptions, updateIcon } from '@xr-build/sdk';
import { Button, COLORS, Dialog, Label, material, roundedBox, roundedDisc } from '@xr-build/ui-kit';
import { catalogBaseHref, excludeCurrentPublication, isLoopbackDevelopment, isPanelPreview, isPublishedHosting, loadRuntimeCatalog, workspaceCatalogBase } from './catalog.js';
import createIcon from './icon.js';
import { loadIconModel } from './icon-loader.js';
import './style.css';

const PANEL = { width: 0.597, height: 0.336 };
const FRAME = { width: PANEL.width - 0.018, height: PANEL.height - 0.018, radius: 0.014 };
const PAGE_SIZE = 3;
const CARD_WIDTH = 0.17;
const CARD_HEIGHT = 0.178;
const CARD_REST_LIFT = 0.008;
const CARD_ACTIVE_LIFT = 0.07;
const CARD_FACE_Z = CARD_REST_LIFT + 0.008;
const renderer = new THREE.WebGLRenderer(rendererOptions());
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
scene.add(new THREE.HemisphereLight('#dfe8ff', '#11141a', 1.8));
const key = new THREE.DirectionalLight('#dbe7ff', 2.5);
key.position.set(-0.35, 0.5, 0.8);
scene.add(key);
const app = createXrbApp(renderer, {
  scene,
  camera: { position: [0, 0, 0.67], near: 0.01, far: 5, perspectiveFov: 34, orthographicHeight: PANEL.height },
  xrb: {
    mapping: { mode: 'world', center: new THREE.Vector3(0, 0, 0), scale: 1 },
    pointer: false,
    icon: { create: createIcon },
    xr: { button: false, panel: { widthM: PANEL.width, heightM: PANEL.height, distanceM: 0.5, dropM: 0.12 } },
  },
  autoStart: false,
});
const { xrb, camera } = app;
scene.add(xrb.handsObject, xrb.cursorObject);

const interfaceRoot = new THREE.Group();
const revealStartedAt = performance.now();
interfaceRoot.scale.setScalar(0.94);
interfaceRoot.position.y = -0.012;
scene.add(interfaceRoot);
const board = new THREE.Group();
const boardSurface = new THREE.Mesh(
  roundedBox(FRAME.width, FRAME.height, 0.006, FRAME.radius),
  material('#1c222b', { roughness: 0.72, metalness: 0.03 }),
);
boardSurface.position.z = -0.025;
board.add(boardSurface);
interfaceRoot.add(board);

const BLOCK_GLYPHS = {
  X: ['10001', '01010', '00100', '01010', '10001'],
  R: ['11110', '10001', '11110', '10100', '10010'],
  B: ['11110', '10001', '11110', '10001', '11110'],
  U: ['10001', '10001', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '11110'],
};
function extrudedBrand(text) {
  const group = new THREE.Group();
  const cell = 0.00148;
  const glyphMaterial = material(COLORS.accent, { roughness: 0.38, metalness: 0.12 });
  let x = 0;
  for (const character of text) {
    if (character === ' ') { x += cell * 3; continue; }
    const rows = BLOCK_GLYPHS[character];
    for (let row = 0; row < rows.length; row++) for (let column = 0; column < rows[row].length; column++) {
      if (rows[row][column] !== '1') continue;
      const block = new THREE.Mesh(roundedBox(cell * 1.06, cell * 1.06, 0.0028, cell * 0.12, cell * 0.1), glyphMaterial);
      block.position.set(x + column * cell, (4 - row) * cell, 0);
      group.add(block);
    }
    x += cell * 6;
  }
  return group;
}
const brand = extrudedBrand('XR BUILD');
brand.scale.setScalar(1.5);
brand.updateMatrixWorld(true);
const brandBounds = new THREE.Box3().setFromObject(brand);
brand.position.set(-(brandBounds.min.x + brandBounds.max.x) / 2, 0.128, 0.005);
const pageDots = new THREE.Group();
pageDots.position.set(0, -0.118, CARD_REST_LIFT);
interfaceRoot.add(brand, pageDots);

function compact(control) {
  control.title.visible = false;
  control.status.visible = false;
  return control;
}

// UI Kit buttons fire their action at the physical press threshold. Defer launcher actions until
// release so the cap can visibly travel, the press/release sounds can play, and navigation does not
// replace the page before the interaction is seen.
function activateOnRelease(control, action) {
  let pressed = false;
  control.on('click', () => { pressed = true; });
  control.on('release', () => {
    if (!pressed) return;
    pressed = false;
    setTimeout(action, 60);
  });
}

const previous = compact(new Button({ title: 'Previous page', shape: 'round', text: '', icon: ChevronLeft }));
const next = compact(new Button({ title: 'Next page', shape: 'round', text: '', icon: ChevronRight }));
const enter = compact(new Button({ title: 'Enter XR', shape: 'pill', text: 'Enter XR', icon: Glasses }));
previous.position.set(-0.055, -0.118, CARD_REST_LIFT);
next.position.set(0.055, -0.118, CARD_REST_LIFT);
previous.scale.setScalar(0.6);
next.scale.setScalar(0.6);
enter.position.set(-0.24, 0.118, 0.008);
enter.visible = false;
enter.setEnabled(false);
const fixedControls = [previous, next, enter];
interfaceRoot.add(...fixedControls);
fixedControls.forEach((control) => control.attach(xrb.interaction));
xrb.bindMouse();

const tiltTarget = new THREE.Vector2();
let tilting = false;
let tiltPointer = { x: 0, y: 0 };
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 2) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  tilting = true;
  tiltPointer = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
}, true);
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!tilting) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const dx = event.clientX - tiltPointer.x;
  const dy = event.clientY - tiltPointer.y;
  tiltPointer = { x: event.clientX, y: event.clientY };
  tiltTarget.y = THREE.MathUtils.clamp(tiltTarget.y + dx * 0.0012, -0.09, 0.09);
  tiltTarget.x = THREE.MathUtils.clamp(tiltTarget.x + dy * 0.001, -0.055, 0.055);
}, true);
const stopTilting = (event) => {
  if (!tilting) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  tilting = false;
  tiltTarget.set(0, 0);
};
renderer.domElement.addEventListener('pointerup', stopTilting, true);
renderer.domElement.addEventListener('pointercancel', stopTilting, true);

const cardsRoot = new THREE.Group();
interfaceRoot.add(cardsRoot);
let slidingCards = false;
let slideStartX = 0;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || xrb.interaction.captured(-1)) return;
  slidingCards = true;
  slideStartX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!slidingCards) return;
  const distance = event.clientX - slideStartX;
  cardsRoot.position.x = THREE.MathUtils.clamp(distance / renderer.domElement.clientWidth * 0.7, -0.18, 0.18);
});
const stopSlidingCards = () => {
  if (!slidingCards) return;
  slidingCards = false;
  const offset = cardsRoot.position.x;
  if (offset < -0.055 && (page + 1) * PAGE_SIZE < apps.length) {
    page++;
    renderPage(1);
  } else if (offset > 0.055 && page > 0) {
    page--;
    renderPage(-1);
  }
};
renderer.domElement.addEventListener('pointerup', stopSlidingCards);
renderer.domElement.addEventListener('pointercancel', stopSlidingCards);
let appCards = [];
let apps = [];
let page = 0;
let loading = false;
let catalogLoaded = false;
let catalogError = null;
let catalogSignature = '';
let controller = null;
let xrAvailable = false;
const textureLoader = new THREE.TextureLoader();
// The 3D icon fits a sphere this wide (metres), inside the card's icon well.
const ICON_DIAMETER = 0.056;
const DEFAULT_ICON_COLORS = {
  blue: '#2f9bff', green: '#269b5b', amber: '#d58a20', red: '#d94239',
  purple: '#864fd4', teal: '#20a4af', grey: '#7d8796',
};
textureLoader.setCrossOrigin('anonymous');

function wrapLines(text, maxLength, maxLines = 2) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > maxLength && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).join('\n');
}

function roundedArc(radius, width, sweep, segments = 48) {
  const shape = new THREE.Shape();
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  for (let index = 0; index <= segments; index++) {
    const angle = sweep * index / segments;
    const point = new THREE.Vector2(Math.cos(angle) * outer, Math.sin(angle) * outer);
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  }
  for (let index = segments; index >= 0; index--) {
    const angle = sweep * index / segments;
    shape.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((entry) => {
      entry.map?.dispose?.();
      entry.dispose?.();
    });
  });
}

class AppCard extends THREE.Group {
  constructor(app, index) {
    super();
    this.app = app;
    this.baseZ = 0;
    this.launchLift = 0;
    this.launching = false;
    this.launchStartedAt = 0;
    this.launchOrigin = new THREE.Vector3();
    this.disposed = false;
    this.icon3d = null;
    this.iconReveal = 0;
    this.iconSeconds = 0;

    this.panel = new Dialog({ title: '', text: '', width: CARD_WIDTH, height: CARD_HEIGHT, lift: CARD_REST_LIFT });
    this.panel.closeButton.visible = false;
    this.panel.open('code');
    this.panel.closeButton.setEnabled(false);
    const content = new THREE.Group();
    this.add(this.panel, content);

    const iconWell = new THREE.Mesh(roundedBox(0.058, 0.058, 0.006, 0.012), material(COLORS.well));
    iconWell.position.set(0, 0.043, CARD_FACE_Z);
    content.add(iconWell);
    const fallbackText = app.placeholder ? '+' : app.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
    const fallback = new Label(fallbackText, { size: app.placeholder ? 0.02 : 0.014, weight: 700, color: COLORS.accent });
    fallback.position.set(0, 0.043, CARD_FACE_Z + 0.007);
    content.add(fallback);
    // The app's 3D icon (its build's icon.js) pops out of the well; without one, its PNG icon on a plane.
    let image = null;
    const showPng = () => app.iconUrl && textureLoader.load(app.iconUrl, (texture) => {
      if (this.disposed || this.icon3d) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.052), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
      icon.position.set(0, 0.043, CARD_FACE_Z + 0.0075);
      fallback.visible = false;
      image = icon;
      content.add(icon);
    }, undefined, () => {});
    const show3d = (icon) => {
      if (this.disposed) { disposeObject(icon); return; }
      if (image) { image.removeFromParent(); disposeObject(image); image = null; }
      if (app.defaultSphere) icon.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.color?.set(DEFAULT_ICON_COLORS[app.iconColor] ?? DEFAULT_ICON_COLORS.blue);
      });
      icon.position.set(0, 0.043, CARD_FACE_Z + ICON_DIAMETER / 2);
      icon.scale.multiplyScalar(0.01 * (app.defaultSphere ? 0.819315 : 1));
      fallback.visible = false;
      this.icon3d = icon;
      content.add(icon);
    };
    if (app.defaultIcon3d) show3d(fitIcon(new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshStandardMaterial({ color: DEFAULT_ICON_COLORS[app.iconColor] ?? DEFAULT_ICON_COLORS.blue, metalness: 0.1, roughness: 0.35 }),
    ), ICON_DIAMETER));
    else if (app.placeholder || !app.route) showPng();
    else {
      showPng();  // A usable image stays visible while authored geometry loads.
      const model = app.iconModelUrl ? loadIconModel(app.iconModelUrl, ICON_DIAMETER, fitIcon)
        : app.projectId ? Promise.resolve(null) : loadAppIcon(app.route, ICON_DIAMETER);
      void model.then((icon) => { if (icon) show3d(icon); });
    }

    const title = new Label(wrapLines(app.title, 18), { size: 0.011, weight: 700 });
    title.position.set(0, 0.001, CARD_FACE_Z);
    const description = new Label(wrapLines(app.description, 25), { size: 0.0072, weight: 500, color: COLORS.text });
    description.position.set(0, -0.018, CARD_FACE_Z);
    this.loadingSpinner = new THREE.Group();
    const spinnerRadius = 0.007;
    const spinnerWidth = 0.0018;
    const spinnerTrack = new THREE.Mesh(
      new THREE.RingGeometry(spinnerRadius - spinnerWidth / 2, spinnerRadius + spinnerWidth / 2, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.muted, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.spinnerArc = new THREE.Group();
    const sweep = Math.PI * 1.45;
    const arcMaterial = new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, depthWrite: false });
    const arc = new THREE.Mesh(roundedArc(spinnerRadius, spinnerWidth, sweep), arcMaterial);
    const capGeometry = new THREE.CircleGeometry(spinnerWidth / 2, 20);
    const startCap = new THREE.Mesh(capGeometry, arcMaterial);
    const endCap = new THREE.Mesh(capGeometry, arcMaterial);
    startCap.position.set(spinnerRadius, 0, 0.0001);
    endCap.position.set(Math.cos(sweep) * spinnerRadius, Math.sin(sweep) * spinnerRadius, 0.0001);
    this.spinnerArc.add(arc, startCap, endCap);
    this.loadingSpinner.add(spinnerTrack, this.spinnerArc);
    this.loadingSpinner.position.set(0, -0.055, CARD_FACE_Z + 0.002);
    this.loadingSpinner.visible = false;
    content.add(title, description, this.loadingSpinner);

    this.launch = null;
    if (!app.placeholder) {
      this.launch = compact(new Button({ title: `Open ${app.title}`, shape: 'pill', text: 'Open' }));
      this.launch.position.set(0, -0.055, CARD_FACE_Z);
      this.launch.attach(xrb.interaction);
      activateOnRelease(this.launch, () => this.beginLaunch());
      content.add(this.launch);
    }
    content.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((entry) => { entry.transparent = true; });
    });
  }

  beginLaunch() {
    if (this.launching) return;
    this.launching = true;
    this.launchStartedAt = performance.now();
    this.launchOrigin.copy(this.position);
    this.renderOrder = 10;
    this.launch?.setEnabled(false);
    if (this.launch) this.launch.visible = false;
    this.loadingSpinner.visible = true;
    appCards.forEach((card) => { if (card !== this) card.visible = false; });
    previous.visible = false;
    next.visible = false;
    pageDots.visible = false;
    const launchUrl = appLaunchUrl(this.app.launchUrl, { returnUrl: location.href, projection: app.projection });
    setTimeout(() => location.assign(launchUrl), 1150);
  }

  update(dt, now = performance.now()) {
    this.panel.update(dt);
    this.launch?.update(dt);
    if (this.icon3d) {
      if (this.iconReveal < 1) {
        const before = 1 - Math.pow(1 - this.iconReveal, 3);
        this.iconReveal = Math.min(1, this.iconReveal + dt * 2.8);
        const reveal = 1 - Math.pow(1 - this.iconReveal, 3);
        this.icon3d.scale.multiplyScalar(Math.max(reveal, 0.01) / Math.max(before, 0.01));
        this.icon3d.rotation.y = (1 - reveal) * -0.6;
      }
      this.iconSeconds += dt;
      updateIcon(this.icon3d.children[0], this.iconSeconds);
    }
    if (!this.launching) return;
    this.spinnerArc.rotation.z -= dt * 5.5;
    const progress = THREE.MathUtils.clamp((now - this.launchStartedAt) / 850, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.position.x = THREE.MathUtils.lerp(this.launchOrigin.x, 0, eased);
    this.position.y = THREE.MathUtils.lerp(this.launchOrigin.y, 0, eased);
    this.launchLift = eased * (CARD_ACTIVE_LIFT - CARD_REST_LIFT);
    this.scale.setScalar(1 + eased * 0.12);
    this.rotation.y = Math.sin(progress * Math.PI) * -Math.sign(this.launchOrigin.x || 1) * 0.055;
  }

  destroy() {
    this.disposed = true;
    this.launch?.detach();
    disposeObject(this);
    this.removeFromParent();
  }
}

function clearCards() {
  appCards.forEach((card) => card.destroy());
  appCards = [];
}

function renderPageDots(totalPages) {
  for (const dot of [...pageDots.children]) {
    dot.geometry.dispose();
    dot.material.dispose();
    dot.removeFromParent();
  }
  pageDots.visible = totalPages > 1;
  const spacing = 0.012;
  for (let index = 0; index < totalPages; index++) {
    const active = index === page;
    const dotMaterial = material(active ? COLORS.accent : '#4b5668', { roughness: 0.45, metalness: 0.06 });
    const dot = new THREE.Mesh(
      roundedDisc(active ? 0.0035 : 0.0028, active ? 0.003 : 0.0022, 32),
      dotMaterial,
    );
    dot.position.x = (index - (totalPages - 1) / 2) * spacing;
    pageDots.add(dot);
  }
}

function renderPage(direction = 0) {
  clearCards();
  cardsRoot.position.x = direction * 0.16;
  const totalPages = Math.max(1, Math.ceil(apps.length / PAGE_SIZE));
  page = Math.min(page, totalPages - 1);
  const visible = apps.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  // Lay out the resting glass cards in their slightly raised projection plane.
  const cardPlaneWidth = FRAME.width * (camera.position.z - CARD_REST_LIFT) / (camera.position.z - boardSurface.position.z);
  const gap = (cardPlaneWidth - visible.length * CARD_WIDTH) / (visible.length + 1);
  const positions = visible.map((_, index) => -cardPlaneWidth / 2 + gap + CARD_WIDTH / 2 + index * (CARD_WIDTH + gap));
  visible.forEach((app, index) => {
    const card = new AppCard(app, page * PAGE_SIZE + index);
    card.position.set(positions[index], 0, card.baseZ);
    cardsRoot.add(card);
    appCards.push(card);
  });

  if (!visible.length && catalogLoaded) {
    const empty = new Label(catalogError ? 'The app library could not be loaded. Reload to try again.' : 'No apps published yet.', { size: 0.011, weight: 600, color: COLORS.muted });
    empty.position.set(0, -0.01, 0.012);
    cardsRoot.add(empty);
    appCards.push({
      position: empty.position,
      baseZ: empty.position.z,
      update() {},
      destroy() { disposeObject(empty); empty.removeFromParent(); },
    });
  }

  const paged = totalPages > 1;
  previous.visible = paged;
  next.visible = paged;
  previous.setEnabled(paged && page > 0);
  next.setEnabled(paged && page < totalPages - 1);
  renderPageDots(totalPages);
}

function catalogBase() {
  return catalogBaseHref(location.href, import.meta.env.VITE_CATALOG_ORIGIN);
}

function localizePublishedApp(app) {
  const entry = import.meta.env.VITE_XRB_LOCAL_PUBLICATIONS[app.slug];
  if (!entry) return app;
  const launch = new URL(entry, location.origin);
  launch.searchParams.set('xrb-xr', 'enter');
  return { ...app, route: launch.href, launchUrl: launch.href };
}

async function updateCatalog() {
  if (loading) return;
  loading = true;
  controller?.abort();
  controller = new AbortController();
  try {
    const panelPreview = isPanelPreview(location.href);
    const workspaceBase = workspaceCatalogBase(location.href);
    const development = isLoopbackDevelopment(location.href);
    const publishedBase = panelPreview || workspaceBase ? location.href : catalogBase();
    const catalog = await loadRuntimeCatalog({ runtimeHref: location.href, publishedBase, signal: controller.signal });
    let nextApps = excludeCurrentPublication(catalog, location.href, {
      id: import.meta.env.VITE_XRB_PUBLICATION_ID,
      slug: import.meta.env.VITE_XRB_PUBLICATION_SLUG,
    });
    catalogError = null;
    catalogLoaded = true;
    if (development && !panelPreview && !workspaceBase) nextApps = nextApps.map(localizePublishedApp);
    const signature = JSON.stringify(nextApps.map(({ id, title, description, route, launchUrl, iconUrl, iconColor, defaultSphere, defaultIcon3d, iconModelUrl, iconRevision }) =>
      [id, title, description, route, launchUrl, iconUrl, iconColor, defaultSphere, defaultIcon3d, iconModelUrl, iconRevision]));
    if (signature !== catalogSignature) {
      apps = nextApps;
      catalogSignature = signature;
      page = Math.min(page, Math.max(0, Math.ceil(apps.length / PAGE_SIZE) - 1));
      renderPage();
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('[launcher] library unavailable:', error);
      catalogError = error;
      catalogLoaded = true;
      catalogSignature = '';  // recovery must redraw even when the library has not changed
      apps = [];
      page = 0;
      renderPage();
    }
  } finally {
    loading = false;
  }
}

activateOnRelease(previous, () => { if (page > 0) { page--; renderPage(-1); } });
activateOnRelease(next, () => { if ((page + 1) * PAGE_SIZE < apps.length) { page++; renderPage(1); } });
enter.on('click', () => void xrb.enterXR().catch((error) => console.warn('[launcher] could not enter XR:', error)));
renderPage();
updateCatalog();
if (isPanelPreview(location.href) || workspaceCatalogBase(location.href)) setInterval(() => void updateCatalog(), 1000);
// A published launcher keeps watching its publisher's inventory, so apps published later appear without republishing it.
else if (isPublishedHosting(location.href)) setInterval(() => void updateCatalog(), 15000);

document.body.classList.add('ready');
app.setFrame(({ timeMs: now, deltaSeconds }) => {
  const dt = Math.min(0.1, deltaSeconds);
  fixedControls.forEach((control) => control.update(dt));
  if (!slidingCards) cardsRoot.position.x += (0 - cardsRoot.position.x) * (1 - Math.exp(-dt * 12));
  appCards.forEach((card, index) => {
    card.update(dt, now);
    card.position.z = card.baseZ + (card.launchLift ?? 0) + Math.sin(now * 0.001 + index * 0.8) * 0.0014;
  });
  const revealProgress = THREE.MathUtils.clamp((now - revealStartedAt) / 720, 0, 1);
  const reveal = 1 - Math.pow(1 - revealProgress, 3);
  interfaceRoot.scale.setScalar(0.94 + reveal * 0.06);
  interfaceRoot.position.y = -0.012 * (1 - reveal);
  const tiltX = (xrb.presenting ? 0 : tiltTarget.x) - 0.04 * (1 - reveal);
  const tiltY = xrb.presenting ? 0 : tiltTarget.y;
  interfaceRoot.rotation.x += (tiltX - interfaceRoot.rotation.x) * (1 - Math.exp(-dt * 10));
  interfaceRoot.rotation.y += (tiltY - interfaceRoot.rotation.y) * (1 - Math.exp(-dt * 10));
  const available = Boolean(xrb.xrMode) && !xrb.presenting;
  if (available !== xrAvailable) {
    xrAvailable = available;
    enter.visible = available;
    enter.setEnabled(available);
  }
});
app.start();
