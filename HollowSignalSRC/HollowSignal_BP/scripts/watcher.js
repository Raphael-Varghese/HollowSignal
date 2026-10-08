import { world, system } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { addC } from "./corruption.js";
import { SND, play, dist3, groundAt, addEffect, title, hurt, actionBar, behindOf, edgeOfView, sampleNear, safeSpawn, lookingAt } from "./util.js";

/**
 * The Watcher never walks while you look at it. Stare ~3.5 s and it leaves; look away ~2 s and it appears closer;
 * reach 3 blocks unwatched and it grabs you (damage only if you agreed to harm).
 */
const STATE = new Map();
const DIMS = ["overworld", "nether", "the_end"];

function vanish(w, p, scare) {
  try {
    w.remove();
  } catch (e) {}
  if (!scare) return;
  play(p, "mob.endermen.portal", { volume: 0.8, pitch: 0.7 });
  if (can.textual(p)) actionBar(p, personal(p) ? `§8Good, ${p.name}. Keep looking.` : "§8Good. Keep looking.");
}

function grab(w, p) {
  try {
    w.remove();
  } catch (e) {}
  play(p, SND.stinger);
  addC(p, 2);
  if (can.harm(p)) {
    addEffect(p, "blindness", 80, 0);
    addEffect(p, "slowness", 80, 1);
    hurt(p, can.heavy(p) ? 4 : 2);
    title(p, "§c§k|||", personal(p) ? `§8${p.name}` : "", 2, 20, 20);
  } else if (can.textual(p)) {
    actionBar(p, "§8It was right behind you.");
  }
}

function advance(dim, w, p, d) {
  const step = Math.min(4.5, d - 2.6);
  if (step <= 0.5) return;
  const dx = (p.location.x - w.location.x) / d, dz = (p.location.z - w.location.z) / d;
  const nx = w.location.x + dx * step, nz = w.location.z + dz * step;
  const gy = groundAt(dim, nx, nz, w.location.y);
  if (gy === undefined || Math.abs(gy - w.location.y) > 3) return;
  try {
    w.teleport({ x: nx, y: gy, z: nz }, { facingLocation: p.location });
  } catch (e) {}
}

system.runInterval(() => {
  const seen = new Set();
  for (const dimId of DIMS) {
    const dim = world.getDimension(dimId);
    let list = [];
    try {
      list = dim.getEntities({ type: "hs:watcher" });
    } catch (e) {}
    for (const w of list) {
      seen.add(w.id);
      const near = dim.getPlayers({ location: w.location, maxDistance: 64, closest: 1 });
      if (!near.length) continue;
      const p = near[0];
      const d = dist3(p.location, w.location);
      const st = STATE.get(w.id) ?? { gaze: 0, unseen: 0 };
      STATE.set(w.id, st);
      if (p.hasTag("hs_ward") && d < 16) {
        vanish(w, p, false);
        continue;
      }
      if (lookingAt(p, w.location, d)) {
        st.gaze += 4;
        st.unseen = 0;
        if (st.gaze % 60 === 0 && d < 40) play(p, SND.drone, { volume: 0.6 });
        if (st.gaze >= 70) vanish(w, p, true);
      } else {
        st.gaze = 0;
        st.unseen += 4;
        if (st.unseen >= 36) {
          st.unseen = 0;
          if (d <= 3.4) grab(w, p);
          else advance(dim, w, p, d);
        }
      }
    }
  }
  for (const id of STATE.keys()) if (!seen.has(id)) STATE.delete(id);
}, 4);

// ---------------------------------------------------------------- how a Watcher shows up
const capReached = (p) => {
  try {
    return p.dimension.getEntities({ type: "hs:watcher", location: p.location, maxDistance: 90 }).length >= 2;
  } catch (e) {
    return false;
  }
};

/** mode: behind | edge | far | window */
export function spawnWatcher(p, mode = "behind") {
  if (capReached(p)) return false;
  const dim = p.dimension;
  let x, z, y;
  if (mode === "window") {
    const glass = sampleNear(dim, p.location, 10, 50, (b) => /glass(_pane)?$/.test(b.typeId), 3);
    if (!glass) return spawnWatcher(p, "edge");
    const gx = glass.location.x + 0.5, gz = glass.location.z + 0.5;
    const dx = gx - p.location.x, dz = gz - p.location.z, l = Math.hypot(dx, dz) || 1;
    x = gx + (dx / l) * 2.5;
    z = gz + (dz / l) * 2.5;
    y = groundAt(dim, x, z, glass.location.y);
  } else if (mode === "far") {
    const e = edgeOfView(p, rand2(44, 58));
    x = e.x; z = e.z;
    try {
      const top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
      y = top ? top.location.y + 1 : undefined;
    } catch (err) {}
  } else if (mode === "edge") {
    const e = edgeOfView(p, rand2(11, 17));
    x = e.x; z = e.z;
    y = groundAt(dim, x, z, p.location.y);
  } else {
    const b = behindOf(p, 24, 3);
    x = b.x; z = b.z;
    y = groundAt(dim, x, z, p.location.y);
  }
  if (y === undefined) return false;
  return !!safeSpawn(dim, "hs:watcher", { x, y, z });
}
function rand2(a, b) {
  return a + Math.random() * (b - a);
}
