import * as THREE from 'three';
import { mulberry32 } from '../utils/random.js';

/**
 * Procedural surface textures painted on canvases at startup (no image
 * files). They are mostly neutral/light so a material's color tints them,
 * which lets one texture serve many buildings.
 */

const cache = new Map();
let maxAniso = 4;

export function setMaxAnisotropy(n) {
  maxAniso = Math.min(8, n || 1);
}

function make(name, size, paint) {
  if (cache.has(name)) return cache.get(name);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(name.length * 7919 + size);
  paint(g, size, rnd);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(name, tex);
  return tex;
}

const shade = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

/** Speckle/blotch noise: many translucent dots of varying size. */
function speckle(g, size, rnd, count, minR, maxR, lo, hi, alpha) {
  for (let i = 0; i < count; i++) {
    const v = lo + rnd() * (hi - lo);
    g.fillStyle = shade(v, alpha * (0.4 + rnd() * 0.6));
    const r = minR + rnd() * (maxR - minR);
    const x = rnd() * size;
    const y = rnd() * size;
    // draw wrapped so the texture tiles seamlessly
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (x + dx + r < 0 || x + dx - r > size || y + dy + r < 0 || y + dy - r > size) continue;
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

export const TEX = {
  grass: () =>
    make('grass', 256, (g, s, rnd) => {
      g.fillStyle = '#e4ecd6';
      g.fillRect(0, 0, s, s);
      // soft color patches
      for (let i = 0; i < 70; i++) {
        const cols = ['#b8c8a0', '#f4f6ea', '#c8d4b0', '#f4eed4', '#a8bc92'];
        g.fillStyle = cols[(rnd() * cols.length) | 0];
        g.globalAlpha = 0.35 + rnd() * 0.35;
        const r = 10 + rnd() * 30;
        const x = rnd() * s;
        const y = rnd() * s;
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
          g.beginPath();
          g.ellipse(x + dx, y + dy, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      // little blade strokes
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const l = 2 + rnd() * 4;
        const light = rnd() < 0.5;
        g.strokeStyle = light ? 'rgba(255,255,235,0.5)' : 'rgba(70,100,45,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rnd() - 0.5) * 2, y - l);
        g.stroke();
      }
    }),

  dirt: () =>
    make('dirt', 256, (g, s, rnd) => {
      g.fillStyle = '#ece4d6';
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, 260, 3, 14, 170, 240, 0.2);
      speckle(g, s, rnd, 900, 0.6, 2.2, 70, 230, 0.5); // pebbles
      // tire ruts
      g.strokeStyle = 'rgba(80,60,40,0.12)';
      g.lineWidth = 10;
      for (const x of [s * 0.3, s * 0.7]) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, s);
        g.stroke();
      }
    }),

  plaster: () =>
    make('plaster', 256, (g, s, rnd) => {
      g.fillStyle = '#ececec';
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, 220, 4, 22, 200, 255, 0.18);
      speckle(g, s, rnd, 1200, 0.5, 1.5, 150, 255, 0.35);
      // grime towards the bottom
      const grad = g.createLinearGradient(0, s * 0.65, 0, s);
      grad.addColorStop(0, 'rgba(90,80,70,0)');
      grad.addColorStop(1, 'rgba(90,80,70,0.28)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }),

  wood: () =>
    make('wood', 256, (g, s, rnd) => {
      const planks = 8;
      const h = s / planks;
      for (let i = 0; i < planks; i++) {
        const v = 200 + rnd() * 40;
        g.fillStyle = shade(v);
        g.fillRect(0, i * h, s, h);
        // grain
        for (let k = 0; k < 18; k++) {
          g.strokeStyle = `rgba(90,60,30,${0.08 + rnd() * 0.12})`;
          g.lineWidth = 1;
          const y = i * h + rnd() * h;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + (rnd() - 0.5) * 4, s * 0.6, y + (rnd() - 0.5) * 4, s, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,25,15,0.55)';
        g.fillRect(0, i * h, s, 2);
        // nail heads
        for (const x of [s * 0.08, s * 0.58]) {
          g.fillStyle = 'rgba(40,40,40,0.6)';
          g.fillRect(x, i * h + h / 2, 3, 3);
        }
      }
    }),

  brick: () =>
    make('brick', 256, (g, s, rnd) => {
      g.fillStyle = '#d6d0c8';
      g.fillRect(0, 0, s, s);
      const rows = 12;
      const h = s / rows;
      const w = s / 4;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? w / 2 : 0;
        for (let c = -1; c < 5; c++) {
          const v = 190 + rnd() * 55;
          g.fillStyle = shade(v);
          g.fillRect(c * w + off + 2, r * h + 2, w - 4, h - 4);
        }
      }
      speckle(g, s, rnd, 600, 0.5, 1.4, 120, 255, 0.3);
    }),

  metal: () =>
    make('metal', 128, (g, s, rnd) => {
      // corrugated vertical ribs
      for (let x = 0; x < s; x++) {
        const v = 200 + Math.sin((x / s) * Math.PI * 16) * 35;
        g.fillStyle = shade(v);
        g.fillRect(x, 0, 1, s);
      }
      speckle(g, s, rnd, 60, 2, 9, 120, 170, 0.15); // rust/dirt
      const grad = g.createLinearGradient(0, s * 0.7, 0, s);
      grad.addColorStop(0, 'rgba(110,70,40,0)');
      grad.addColorStop(1, 'rgba(110,70,40,0.25)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }),

  shingle: () =>
    make('shingle', 256, (g, s, rnd) => {
      g.fillStyle = '#cfcfcf';
      g.fillRect(0, 0, s, s);
      const rows = 10;
      const h = s / rows;
      const w = s / 8;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? w / 2 : 0;
        for (let c = -1; c < 9; c++) {
          const v = 175 + rnd() * 70;
          g.fillStyle = shade(v);
          g.fillRect(c * w + off + 1, r * h + 1, w - 2, h - 1);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(c * w + off, r * h + h - 3, w, 3);
        }
      }
    }),

  concrete: () =>
    make('concrete', 256, (g, s, rnd) => {
      g.fillStyle = '#d9d9d9';
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, 300, 3, 18, 170, 240, 0.2);
      speckle(g, s, rnd, 2200, 0.4, 1.2, 90, 255, 0.4);
      // cracks
      g.strokeStyle = 'rgba(60,60,60,0.35)';
      for (let i = 0; i < 6; i++) {
        let x = rnd() * s;
        let y = rnd() * s;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (rnd() - 0.5) * 30;
          y += rnd() * 20;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }),

  crate: () =>
    make('crate', 128, (g, s, rnd) => {
      g.fillStyle = '#e2d2b2';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `rgba(120,80,40,${0.08 + rnd() * 0.1})`;
        g.fillRect(0, (i * s) / 5, s, s / 5 - 2);
        g.fillStyle = 'rgba(60,40,20,0.4)';
        g.fillRect(0, ((i + 1) * s) / 5 - 2, s, 2);
      }
      speckle(g, s, rnd, 300, 0.4, 1.2, 80, 160, 0.3);
    }),

  leaves: () =>
    make('leaves', 128, (g, s, rnd) => {
      g.fillStyle = '#e6e6e6';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        const v = 150 + rnd() * 105;
        g.fillStyle = shade(v, 0.7);
        const x = rnd() * s;
        const y = rnd() * s;
        g.beginPath();
        g.ellipse(x, y, 2 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }),
};

/**
 * Give a world-space geometry box-projected UVs (like triplanar mapping):
 * each face takes the two world axes it spans, scaled by `scale` meters
 * per texture repeat. Lets textures tile evenly on any box size.
 */
export function boxProjectUVs(geo, scale = 2) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
