// A plain default app icon (512x512 PNG): a coloured shape on a dark tile. Used when an app has no
// icon of its own, so a window, a list entry or a package always has one. Its colour and shape come
// from the manifest's iconColor and iconShape; blue sphere when unset.
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** Windows .ico with PNG-compressed images (Vista+), one per size; sizes up to 256. */
export function icoFromPngs(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);  // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir[e] = size >= 256 ? 0 : size;  // 0 means 256
    dir[e + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, e + 4);  // planes
    dir.writeUInt16LE(32, e + 6);  // bits per pixel
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.png)]);
}

/** The default icon as a multi-size .ico (the host exe's built-in icon). */
export function defaultIco(): Buffer {
  return icoFromPngs([16, 24, 32, 48, 64, 256].map((size) => ({ size, png: defaultIcon(size) })));
}

/** Sphere colours of the default icon: [dark, lit] RGB and the halo. */
export const ICON_COLORS = {
  blue: { base: [30, 100, 190], lit: [60, 110, 60], halo: [40, 110, 160] },
  green: { base: [24, 120, 70], lit: [70, 110, 70], halo: [35, 120, 80] },
  amber: { base: [170, 105, 15], lit: [80, 90, 60], halo: [150, 105, 30] },
  red: { base: [170, 40, 35], lit: [80, 80, 70], halo: [150, 50, 45] },
  purple: { base: [100, 55, 180], lit: [80, 80, 70], halo: [100, 70, 160] },
  teal: { base: [15, 125, 135], lit: [70, 100, 90], halo: [30, 120, 130] },
  grey: { base: [95, 105, 120], lit: [90, 90, 90], halo: [90, 100, 115] },
} as const;
export type IconColor = keyof typeof ICON_COLORS;
export const isIconColor = (v: unknown): v is IconColor => typeof v === 'string' && Object.hasOwn(ICON_COLORS, v);

export const ICON_SHAPES = ['sphere', 'cube', 'diamond', 'hexagon'] as const;
export type IconShape = typeof ICON_SHAPES[number];
export const isIconShape = (v: unknown): v is IconShape => typeof v === 'string' && ICON_SHAPES.includes(v as IconShape);

/** Distance from the centre as a proportion of a shape's edge (below 1 is inside). */
function shapeDistance(shape: IconShape, dx: number, dy: number, r: number): number {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (shape === 'cube') return Math.max(ax, ay) / (r * 0.9);
  if (shape === 'diamond') return (ax + ay) / (r * 1.22);
  if (shape === 'hexagon') {
    // Regular flat-top hexagon: intersection of its three pairs of parallel half-planes.
    return Math.max(ax / r, (ax * 0.5 + ay * Math.sqrt(3) / 2) / (r * Math.sqrt(3) / 2));
  }
  return Math.hypot(dx, dy) / r;
}

export function defaultIcon(size = 512, color: IconColor = 'blue', shape: IconShape = 'sphere'): Buffer {
  const pal = ICON_COLORS[color] ?? ICON_COLORS.blue;
  const safeShape = isIconShape(shape) ? shape : 'sphere';
  const rows: Buffer[] = [];
  const c = size / 2, r = size * 0.36;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c;
      const d = shapeDistance(safeShape, dx, dy, r);
      let rgb = [16, 21, 28];
      if (d < 1) {
        // Lit from the upper left; using shape distance keeps the highlight inside each silhouette.
        const nz = Math.sqrt(Math.max(0, 1 - d ** 2));
        const light = Math.max(0, (-dx / r) * 0.45 + (-dy / r) * 0.55 + nz * 0.7);
        rgb = pal.base.map((b, i) => b + pal.lit[i] * light);
      } else if (d < 1.08) {
        rgb = [...pal.halo];  // thin halo
      }
      row.set(rgb.map((v) => Math.min(255, Math.round(v))), 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
