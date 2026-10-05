// Procedural stick-figure rig: joints are computed from the unit's state
// every frame (walk cycles, attack arcs, ragdoll deaths), then drawn with
// round-capped strokes. Local space: feet at (0,0), facing +x, up is -y.

const THIGH = 12.5;
const SHIN = 12.5;
const UPPER = 10.5;
const FORE = 10.5;
const TORSO = 19;

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Point at angle a (0 = straight down, +ve = forward) and length l from p. */
function pt(p, a, l) {
  return { x: p.x + Math.sin(a) * l, y: p.y + Math.cos(a) * l };
}

/** Piecewise keyframes: [[t, value], ...] sampled with smoothstep. */
function keys(t, k) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return k[k.length - 1][1];
}

/**
 * Build the pose for a unit. Returns joints + weapon hints.
 * u: { kind, anim, animT (0..1 attack progress), walkPhase, speedFactor, time, hurtT, deathT }
 */
export function computePose(u) {
  const p = u.walkPhase || 0;
  const moving = u.moving;
  const run = Math.min(1.3, (u.speedFactor || 0.8));
  let lean = moving ? 0.1 + run * 0.08 : 0.02 + Math.sin(u.time * 2) * 0.01;
  if (u.kind === 'giant') lean += 0.08;
  let hipY = -THIGH - SHIN;
  if (moving) hipY += -Math.abs(Math.cos(p)) * 1.8 * run + 1.2;
  else hipY += Math.sin(u.time * 2.2) * 0.4;

  // legs
  const legs = [0, Math.PI].map((off) => {
    const t = p + off;
    if (!moving) {
      const spread = off ? -0.16 : 0.16;
      return { thigh: spread, shin: spread * 0.6 };
    }
    const amp = 0.45 + run * 0.18;
    const thigh = amp * Math.sin(t);
    const shin = thigh - Math.max(0, Math.cos(t)) * (0.7 + run * 0.35);
    return { thigh, shin };
  });

  // default arms: swing while moving
  const arms = [Math.PI, 0].map((off) => {
    const t = p + off;
    if (!moving) return { upper: off ? 0.15 : -0.12, fore: off ? 0.45 : 0.2 };
    const amp = 0.38 + run * 0.25;
    const upper = amp * Math.sin(t);
    return { upper, fore: upper + 0.55 + run * 0.2 };
  });

  const out = { lean, hipY, legs, arms, weapon: null, weaponAngle: 0, glow: 0 };
  const a = u.anim === 'attack' ? clamp01(u.animT) : -1;

  switch (u.kind) {
    case 'melee': {
      out.weapon = 'sword';
      if (a >= 0) {
        const up = keys(a, [[0, 0.3], [0.42, -2.7], [0.6, 1.7], [1, 0.6]]);
        arms[1].upper = up;
        arms[1].fore = up + keys(a, [[0, 0.4], [0.42, -0.4], [0.6, 0.15], [1, 0.4]]);
        arms[0].upper = keys(a, [[0, -0.2], [0.42, 0.7], [0.6, -0.6], [1, -0.2]]);
        out.lean += keys(a, [[0, 0], [0.42, -0.12], [0.6, 0.28], [1, 0.05]]);
      } else if (!moving) {
        arms[1].upper = 0.55;
        arms[1].fore = 1.35;
      }
      break;
    }
    case 'archer': {
      out.weapon = 'bow';
      const raise = moving && a < 0 ? 0 : 1;
      if (raise) {
        const pitch = u.aimPitch || 0;
        arms[0].upper = 1.57 - pitch;
        arms[0].fore = 1.57 - pitch;
        const draw = a >= 0 ? keys(a, [[0, 0], [0.62, 1], [0.7, 0], [1, 0]]) : 0.2;
        arms[1].upper = lerp(1.2, 0.35, draw) - pitch;
        arms[1].fore = lerp(1.9, 2.75, draw) - pitch;
        out.draw = draw;
        out.pitch = pitch;
      }
      break;
    }
    case 'spear': {
      out.weapon = 'spear';
      const thrust = a >= 0 ? keys(a, [[0, 0.2], [0.4, -0.15], [0.55, 1], [1, 0.25]]) : 0.25;
      arms[1].upper = lerp(0.6, 1.4, thrust);
      arms[1].fore = lerp(1.9, 1.62, thrust);
      arms[0].upper = lerp(0.9, 1.35, thrust);
      arms[0].fore = lerp(1.5, 1.6, thrust);
      out.thrust = thrust;
      out.lean += thrust * 0.15;
      out.shield = true;
      break;
    }
    case 'mage': {
      out.weapon = 'staff';
      if (a >= 0) {
        const up = keys(a, [[0, 0.4], [0.5, -2.6], [0.62, 1.3], [1, 0.5]]);
        arms[1].upper = up;
        arms[1].fore = up + 0.1;
        out.glow = keys(a, [[0, 0.2], [0.5, 1], [0.62, 1], [0.8, 0.2]]);
      } else {
        arms[1].upper = 0.35;
        arms[1].fore = 0.9;
        out.glow = 0.25 + Math.sin(u.time * 4) * 0.1;
      }
      out.hood = true;
      break;
    }
    case 'healer': {
      out.weapon = 'rod';
      if (a >= 0) {
        const up = keys(a, [[0, 0.4], [0.45, -2.9], [0.75, -2.9], [1, 0.4]]);
        arms[1].upper = up;
        arms[1].fore = up;
        arms[0].upper = keys(a, [[0, -0.1], [0.45, -2.2], [0.75, -2.2], [1, -0.1]]);
        arms[0].fore = arms[0].upper;
        out.glow = keys(a, [[0, 0], [0.45, 1], [0.75, 1], [1, 0]]);
      } else {
        arms[1].upper = 0.3;
        arms[1].fore = 0.7;
      }
      out.hood = true;
      break;
    }
    case 'miner': {
      out.weapon = 'pick';
      if (u.anim === 'mine' || a >= 0) {
        const t = u.anim === 'mine' ? u.animT : a;
        const up = keys(t, [[0, 0.6], [0.45, -2.8], [0.62, 1.25], [1, 0.6]]);
        arms[1].upper = up;
        arms[1].fore = up + 0.2;
        arms[0].upper = up - 0.2;
        arms[0].fore = up;
        out.lean += keys(t, [[0, 0.1], [0.45, -0.1], [0.62, 0.45], [1, 0.1]]);
      }
      out.sack = u.carrying > 0;
      break;
    }
    case 'giant': {
      out.weapon = u.boss ? 'axe' : 'club';
      if (a >= 0) {
        const up = keys(a, [[0, 0.5], [0.5, -2.9], [0.66, 1.4], [1, 0.6]]);
        arms[1].upper = up;
        arms[1].fore = up + 0.15;
        arms[0].upper = up - 0.3;
        arms[0].fore = up - 0.1;
        out.lean += keys(a, [[0, 0.08], [0.5, -0.15], [0.66, 0.4], [1, 0.1]]);
      } else {
        arms[1].upper = 0.25;
        arms[1].fore = 0.6;
      }
      break;
    }
    default:
      break;
  }

  // hurt flinch
  if (u.hurtT > 0) out.lean -= u.hurtT * 1.2;
  return out;
}

/** Joint positions from a pose. */
export function solve(pose) {
  const hip = { x: 0, y: pose.hipY };
  const neck = { x: Math.sin(pose.lean) * TORSO, y: hip.y - Math.cos(pose.lean) * TORSO };
  const head = { x: neck.x + Math.sin(pose.lean) * 8, y: neck.y - Math.cos(pose.lean) * 8 };
  const legs = pose.legs.map((l) => {
    const knee = pt(hip, l.thigh, THIGH);
    const foot = pt(knee, l.shin, SHIN);
    return { knee, foot };
  });
  const shoulder = { x: lerp(hip.x, neck.x, 0.92), y: lerp(hip.y, neck.y, 0.92) };
  const arms = pose.arms.map((a) => {
    const elbow = pt(shoulder, a.upper, UPPER);
    const hand = pt(elbow, a.fore, FORE);
    return { elbow, hand, fore: a.fore };
  });
  return { hip, neck, head, legs, shoulder, arms };
}

function line(ctx, a, b) {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

/**
 * Draw a unit at the current transform (feet at origin, facing +x).
 * style: { body, accent, metal, glowColor }
 */
export function drawStick(ctx, u, style, pose, j) {
  const body = style.body;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = body;
  ctx.fillStyle = body;

  // back arm + back leg first (depth)
  const backArm = j.arms[0];
  const frontArm = j.arms[1];
  const thick = (u.kind === 'giant' ? 4.6 : 3.6) + (style.extra || 0);

  // shield behind the front arm for phalanx is drawn later; back arm first
  ctx.lineWidth = thick * 0.92;
  ctx.globalAlpha *= 0.92;
  ctx.beginPath();
  line(ctx, j.shoulder, backArm.elbow);
  line(ctx, backArm.elbow, backArm.hand);
  line(ctx, j.hip, j.legs[1].knee);
  line(ctx, j.legs[1].knee, j.legs[1].foot);
  ctx.stroke();
  ctx.globalAlpha /= 0.92;

  // weapon held in the back hand (bow) is drawn with that arm
  if (style.rimOnly) {
    /* skip weapons in the outline pass */
  } else if (pose.weapon === 'bow') drawBow(ctx, backArm, frontArm, pose, style);
  if (!style.rimOnly && pose.weapon === 'spear') drawSpear(ctx, backArm, frontArm, pose, style);

  // torso + front leg
  ctx.lineWidth = thick;
  ctx.beginPath();
  line(ctx, j.hip, j.neck);
  line(ctx, j.hip, j.legs[0].knee);
  line(ctx, j.legs[0].knee, j.legs[0].foot);
  ctx.stroke();
  // feet
  ctx.lineWidth = thick * 0.9;
  ctx.beginPath();
  for (const l of j.legs) {
    ctx.moveTo(l.foot.x, l.foot.y);
    ctx.lineTo(l.foot.x + 3.2, l.foot.y + 0.3);
  }
  ctx.stroke();

  // head
  ctx.beginPath();
  ctx.arc(j.head.x, j.head.y, (u.kind === 'giant' ? 7.5 : 6.4) + (style.extra || 0) / 2, 0, Math.PI * 2);
  ctx.fill();
  if (style.rimOnly) {
    // outline pass: just the body silhouette
    ctx.beginPath();
    line(ctx, j.shoulder, frontArm.elbow);
    line(ctx, frontArm.elbow, frontArm.hand);
    ctx.stroke();
    return;
  }
  drawHeadgear(ctx, u, pose, j, style);

  if (pose.sack) {
    ctx.fillStyle = '#8a6a3a';
    ctx.beginPath();
    ctx.ellipse(j.neck.x - 7, j.neck.y + 6, 5.5, 6.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(j.neck.x - 7, j.neck.y + 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
  }

  // front arm
  ctx.strokeStyle = body;
  ctx.lineWidth = thick;
  ctx.beginPath();
  line(ctx, j.shoulder, frontArm.elbow);
  line(ctx, frontArm.elbow, frontArm.hand);
  ctx.stroke();

  // weapons held in the front hand
  switch (pose.weapon) {
    case 'sword': drawSword(ctx, frontArm, style); break;
    case 'staff': drawStaff(ctx, frontArm, pose, style, '#ff8a3a'); break;
    case 'rod': drawStaff(ctx, frontArm, pose, style, '#7dffb0'); break;
    case 'pick': drawPick(ctx, frontArm, style); break;
    case 'club': drawClub(ctx, frontArm, style, false); break;
    case 'axe': drawClub(ctx, frontArm, style, true); break;
    default: break;
  }
  if (pose.shield) drawShield(ctx, backArm, style);
  // sash in team accent
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(j.hip.x - 3, j.hip.y + 1);
  ctx.lineTo(j.hip.x + 3, j.hip.y - 1);
  ctx.stroke();
}

function handDir(arm) {
  return { x: Math.sin(arm.fore), y: Math.cos(arm.fore) };
}

function drawSword(ctx, arm, style) {
  const d = handDir(arm);
  const h = arm.hand;
  ctx.strokeStyle = style.metal;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(h.x - d.x * 2, h.y - d.y * 2);
  ctx.lineTo(h.x + d.x * 24, h.y + d.y * 24);
  ctx.stroke();
  // guard
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(h.x + d.y * 4, h.y - d.x * 4);
  ctx.lineTo(h.x - d.y * 4, h.y + d.x * 4);
  ctx.stroke();
}

function drawStaff(ctx, arm, pose, style, orb) {
  const d = handDir(arm);
  const h = arm.hand;
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(h.x + d.x * 8, h.y + d.y * 8);
  ctx.lineTo(h.x - d.x * 20, h.y - d.y * 20);
  ctx.stroke();
  const tip = { x: h.x - d.x * 22, y: h.y - d.y * 22 };
  const g = 3 + pose.glow * 5;
  ctx.save();
  ctx.globalAlpha *= 0.35 + pose.glow * 0.5;
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, g * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPick(ctx, arm, style) {
  const d = handDir(arm);
  const h = arm.hand;
  const end = { x: h.x + d.x * 15, y: h.y + d.y * 15 };
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(h.x - d.x * 3, h.y - d.y * 3);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = style.metal;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(end.x + d.y * 8, end.y - d.x * 8);
  ctx.quadraticCurveTo(end.x + d.x * 2, end.y + d.y * 2, end.x - d.y * 8, end.y + d.x * 8);
  ctx.stroke();
}

function drawClub(ctx, arm, style, axe) {
  const d = handDir(arm);
  const h = arm.hand;
  const len = 34;
  const end = { x: h.x + d.x * len, y: h.y + d.y * len };
  if (axe) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x - d.x * 4, h.y - d.y * 4);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.fillStyle = style.metal;
    ctx.beginPath();
    ctx.moveTo(end.x - d.x * 4, end.y - d.y * 4);
    ctx.lineTo(end.x + d.y * 14 - d.x * 10, end.y - d.x * 14 - d.y * 10);
    ctx.lineTo(end.x + d.y * 16 + d.x * 6, end.y - d.x * 16 + d.y * 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#5a3a20';
  ctx.beginPath();
  const n = { x: d.y, y: -d.x };
  ctx.moveTo(h.x + n.x * 1.5, h.y + n.y * 1.5);
  ctx.lineTo(end.x + n.x * 5, end.y + n.y * 5);
  ctx.quadraticCurveTo(end.x + d.x * 6, end.y + d.y * 6, end.x - n.x * 5, end.y - n.y * 5);
  ctx.lineTo(h.x - n.x * 1.5, h.y - n.y * 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = style.metal;
  for (let i = 0; i < 3; i++) {
    const k = 0.62 + i * 0.13;
    ctx.beginPath();
    ctx.arc(h.x + d.x * len * k + n.x * 4, h.y + d.y * len * k + n.y * 4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBow(ctx, back, front, pose, style) {
  // bow is held in the back arm (index 0, extended forward)
  const h = back.hand;
  const pitch = pose.pitch || 0;
  const ax = Math.cos(pitch);
  const ay = -Math.sin(pitch);
  const nx = -ay;
  const ny = ax;
  ctx.strokeStyle = '#7a5530';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const top = { x: h.x - nx * 14, y: h.y - ny * 14 };
  const bot = { x: h.x + nx * 14, y: h.y + ny * 14 };
  ctx.moveTo(top.x, top.y);
  ctx.quadraticCurveTo(h.x + ax * 9, h.y + ay * 9, bot.x, bot.y);
  ctx.stroke();
  // string pulled to the drawing hand
  const pull = front.hand;
  ctx.strokeStyle = 'rgba(240,240,230,0.85)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(pull.x, pull.y);
  ctx.lineTo(bot.x, bot.y);
  ctx.stroke();
  if ((pose.draw || 0) > 0.1) {
    ctx.strokeStyle = style.metal;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pull.x, pull.y);
    ctx.lineTo(h.x + ax * 8, h.y + ay * 8);
    ctx.stroke();
  }
}

function drawSpear(ctx, back, front, pose, style) {
  const a = back.hand;
  const b = front.hand;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(a.x - dx * 12, a.y - dy * 12);
  ctx.lineTo(b.x + dx * 24, b.y + dy * 24);
  ctx.stroke();
  const tip = { x: b.x + dx * 24, y: b.y + dy * 24 };
  ctx.fillStyle = style.metal;
  ctx.beginPath();
  ctx.moveTo(tip.x + dx * 9, tip.y + dy * 9);
  ctx.lineTo(tip.x + dy * 3, tip.y - dx * 3);
  ctx.lineTo(tip.x - dy * 3, tip.y + dx * 3);
  ctx.closePath();
  ctx.fill();
}

function drawShield(ctx, arm, style) {
  const h = arm.hand;
  ctx.fillStyle = style.accent;
  ctx.strokeStyle = style.metal;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(h.x + 3, h.y - 4, 6.5, 13, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.metal;
  ctx.beginPath();
  ctx.arc(h.x + 4, h.y - 4, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeadgear(ctx, u, pose, j, style) {
  const h = j.head;
  if (u.kind === 'spear') {
    // crested helmet
    ctx.fillStyle = style.metal;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 7.4, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.moveTo(h.x - 6, h.y - 6);
    ctx.quadraticCurveTo(h.x - 2, h.y - 15, h.x + 6, h.y - 8);
    ctx.lineTo(h.x + 2, h.y - 6);
    ctx.closePath();
    ctx.fill();
  } else if (pose.hood) {
    ctx.fillStyle = u.kind === 'healer' ? '#e6e0cc' : style.accent;
    ctx.beginPath();
    ctx.moveTo(h.x - 8, h.y + 3);
    ctx.quadraticCurveTo(h.x - 6, h.y - 12, h.x + 3, h.y - 13);
    ctx.quadraticCurveTo(h.x + 9, h.y - 6, h.x + 6, h.y + 1);
    ctx.quadraticCurveTo(h.x, h.y - 6, h.x - 8, h.y + 3);
    ctx.fill();
  } else if (u.kind === 'miner') {
    ctx.fillStyle = '#e0b040';
    ctx.beginPath();
    ctx.arc(h.x, h.y - 1, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(h.x - 8, h.y - 1.5, 16, 2);
  } else if (u.kind === 'archer') {
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x - 6, h.y - 2);
    ctx.lineTo(h.x + 6, h.y - 3);
    ctx.stroke();
    // feather
    ctx.beginPath();
    ctx.moveTo(h.x - 6, h.y - 2);
    ctx.lineTo(h.x - 12, h.y - 8);
    ctx.stroke();
  } else if (u.kind === 'melee') {
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x - 6.5, h.y - 1.5);
    ctx.lineTo(h.x + 6.5, h.y - 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h.x - 6.5, h.y - 1.5);
    ctx.lineTo(h.x - 11, h.y + 2);
    ctx.stroke();
  } else if (u.kind === 'giant') {
    ctx.fillStyle = style.accent;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(h.x + i * 3 - 1.5, h.y - 6.5);
      ctx.lineTo(h.x + i * 3.4, h.y - 12 - (u.boss ? 4 : 0));
      ctx.lineTo(h.x + i * 3 + 1.5, h.y - 6.5);
      ctx.fill();
    }
  }
  if (u.undead) {
    // glowing eye
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.arc(h.x + 2.5, h.y - 1, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Death ragdoll: whole rig tips over around the feet, limbs go slack. */
export function deathPose(u) {
  const t = Math.min(1, (u.deathT || 0) * 2.6);
  const pose = {
    lean: 0, hipY: -THIGH - SHIN,
    legs: [{ thigh: 0.2 * t, shin: 0.5 * t }, { thigh: -0.3 * t, shin: -0.1 * t }],
    arms: [{ upper: 0.2 + t * 1.6, fore: 0.6 + t * 1.2 }, { upper: -0.2 - t * 1.4, fore: -0.4 - t * 1.6 }],
    weapon: null,
  };
  return { pose, tilt: -ease(t) * 1.45 };
}
