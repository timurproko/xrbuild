// Just enough DOM for the controls under Node: labels draw into a canvas texture, sound binds
// global listeners. Import this first in every test file.
class FakeContext2d {
  font = '';
  fillStyle = '';
  strokeStyle = '';
  textBaseline = '';
  textAlign = '';
  lineWidth = 1;
  measureText(text: string) { return { width: text.length * 10 }; }
  lineCap = '';
  lineJoin = '';
  fillText() {}
  clearRect() {}
  save() {}
  restore() {}
  scale() {}
  arc() {}
  ellipse() {}
  closePath() {}
  beginPath() {}
  roundRect() {}
  fill() {}
  stroke() {}
  strokeRect() {}
  moveTo() {}
  lineTo() {}
}

class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  getContext() { return new FakeContext2d(); }
  addEventListener() {}
  removeEventListener() {}
}

const g = globalThis as unknown as Record<string, unknown>;
if (!g.document) g.document = { createElement: () => new FakeCanvas(), documentElement: { style: {} }, body: { style: {}, appendChild() {} } };
if (!g.addEventListener) g.addEventListener = () => {};
if (!g.Path2D) g.Path2D = class { constructor(_d?: string) {} };
if (!g.removeEventListener) g.removeEventListener = () => {};
if (!g.AudioContext) {
  // No sound under Node: the engine sees a context that never runs and stays silent.
  g.AudioContext = class { state = 'suspended'; sampleRate = 48000; resume() { return Promise.resolve(); } };
}
if (!g.console) g.console = console;
