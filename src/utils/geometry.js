import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shared material cache: low-poly scenes reuse a handful of flat colors, so
// we hand out one material per color instead of creating hundreds.
const materialCache = new Map();

export function flatMat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  }
  return materialCache.get(key);
}

export function box(w, h, d, color, opts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Triangular prism used for gable roofs. Ridge runs along Z. */
export function prismGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Radial gradient canvas texture, used for glows, the sun and blob shadows. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let vertexColorMat = null;

/**
 * Merge the direct Mesh children of a group into one vertex-colored mesh,
 * keeping sub-groups (animated joints) untouched. Cuts draw calls for
 * models assembled from many small boxes.
 */
export function mergeMeshChildren(group) {
  const meshes = group.children.filter((c) => c.isMesh && c.material?.color);
  if (meshes.length < 2) return group;
  vertexColorMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const geos = [];
  for (const m of meshes) {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = m.material.color;
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) {
      cols[i] = c.r;
      cols[i + 1] = c.g;
      cols[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(g);
    group.remove(m);
  }
  const merged = new THREE.Mesh(mergeGeometries(geos), vertexColorMat);
  merged.castShadow = true;
  merged.receiveShadow = true;
  group.add(merged);
  return group;
}

/** mergeMeshChildren applied to every group in a hierarchy. */
export function mergeHierarchy(root) {
  const groups = [];
  root.traverse((o) => {
    if (!o.isMesh) groups.push(o);
  });
  groups.forEach(mergeMeshChildren);
  return root;
}
