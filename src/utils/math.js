// Small math helpers shared across systems.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential damping factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

/** Shortest signed difference between two angles (radians). */
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Distance from point to an axis aligned rectangle (0 inside). */
export const distToRect = (x, z, cx, cz, hw, hd) => {
  const dx = Math.max(Math.abs(x - cx) - hw, 0);
  const dz = Math.max(Math.abs(z - cz) - hd, 0);
  return Math.hypot(dx, dz);
};

/** Distance from point P to segment AB in the XZ plane. */
export const distToSegment = (px, pz, ax, az, bx, bz) => {
  const abx = bx - ax;
  const abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
};
