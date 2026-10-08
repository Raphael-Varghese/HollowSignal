import { world, system } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { getC } from "./corruption.js";
import {
  SND, play, rand, pick, randInt, dist3, groundAt, safeSpawn, behindOf, edgeOfView, lookingAt, addEffect, hurt, title,
  actionBar, holdingLight, getPlayer, isDead,
} from "./util.js";

const DIMS = ["overworld", "nether", "the_end"];
const each = (type, fn) => {
  for (const id of DIMS) {
    const dim = world.getDimension(id);
    let list = [];
    try {
      list = dim.getEntities({ type });
    } catch (e) {}
    for (const e of list) fn(dim, e);
  }
};

// ---------------------------------------------------------------- Hollows that were someone
const POOL = ["Ada", "Wren", "Elias", "Marlow", "Ines", "Tobias", "Odette", "Ravi", "Mina", "Caleb", "Hana"];
export function rememberName(n) {
  try {
    const a = JSON.parse(world.getDynamicProperty("hs:names") ?? "[]");
    if (!a.includes(n)) {
      a.push(n);
      while (a.length > 20) a.shift();
      world.setDynamicProperty("hs:names", JSON.stringify(a));
    }
  } catch (e) {}
}
function nameList() {
  let a = [];
  try {
    a = JSON.parse(world.getDynamicProperty("hs:names") ?? "[]");
  } catch (e) {}
  return a.concat(POOL);
}
world.afterEvents.playerSpawn.subscribe(({ player }) => rememberName(player.name));
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId === "minecraft:player") rememberName(deadEntity.name);
});

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId !== "hs:hollow" || entity.nameTag) return;
    const near = entity.dimension.getPlayers({ location: entity.location, maxDistance: 48, closest: 1 })[0];
    if (near && personal(near) && can.heavy(near) && Math.random() < 0.12) entity.nameTag = near.name; // a Hollow wearing your name
    else if (Math.random() < 0.35) entity.nameTag = pick(nameList());
  } catch (e) {}
});
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (deadEntity.typeId !== "hs:hollow") return;
    const tag = deadEntity.nameTag;
    if (!tag) return;
    for (const p of deadEntity.dimension.getPlayers({ location: deadEntity.location, maxDistance: 24 })) {
      actionBar(p, p.name === tag ? `§8${tag}... that was you.` : `§8${tag} was a Hollow.`);
    }
  } catch (e) {}
});

// ---------------------------------------------------------------- Mimic: friendly until you look away
const mimicSeen = new Map();
function turnHostile(m) {
  try {
    if (m.getDynamicProperty("hs:hostile")) return;
    m.setDynamicProperty("hs:hostile", true);
    m.triggerEvent("hs:turn_hostile");
  } catch (e) {}
}
world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  if (hurtEntity.typeId === "hs:mimic") turnHostile(hurtEntity);
});
system.runInterval(() => {
  const seen = new Set();
  each("hs:mimic", (dim, m) => {
    seen.add(m.id);
    if (m.getDynamicProperty("hs:hostile")) return;
    const near = dim.getPlayers({ location: m.location, maxDistance: 18, closest: 1 })[0];
    if (!near) return;
    if (near.hasTag("hs_ward") && dist3(near.location, m.location) < 14) {
      m.remove();
      return;
    }
    const d = dist3(near.location, m.location);
    const st = mimicSeen.get(m.id) ?? 0;
    if (lookingAt(near, m.location, d, 0.6)) mimicSeen.set(m.id, 0);
    else {
      mimicSeen.set(m.id, st + 5);
      if (st + 5 >= 60 && d < 15) {
        turnHostile(m);
        play(near, SND.whisper, { volume: 0.9 });
      }
    }
  });
  for (const id of mimicSeen.keys()) if (!seen.has(id)) mimicSeen.delete(id);
}, 5);

// ---------------------------------------------------------------- Lurker: moves only while you are in the dark
const cd = new Map();
system.runInterval(() => {
  each("hs:lurker", (dim, l) => {
    const p = dim.getPlayers({ location: l.location, maxDistance: 48, closest: 1 })[0];
    if (!p) return;
    const d = dist3(p.location, l.location);
    if (p.hasTag("hs_ward") && d < 18) {
      l.remove();
      return;
    }
    const lit = holdingLight(p);
    const dx = (p.location.x - l.location.x) / (d || 1), dz = (p.location.z - l.location.z) / (d || 1);
    if (lit && d < 12) {
      // recoils from the light
      const nx = l.location.x - dx * 1.2, nz = l.location.z - dz * 1.2;
      const gy = groundAt(dim, nx, nz, l.location.y);
      if (gy !== undefined) l.teleport({ x: nx, y: gy, z: nz }, { facingLocation: p.location });
      return;
    }
    if (lit) return;
    if (d > 2.2) {
      const step = Math.min(1.5, d - 2);
      const nx = l.location.x + dx * step, nz = l.location.z + dz * step;
      const gy = groundAt(dim, nx, nz, l.location.y);
      if (gy !== undefined && Math.abs(gy - l.location.y) < 2.5) l.teleport({ x: nx, y: gy, z: nz }, { facingLocation: p.location });
    } else if (system.currentTick - (cd.get(l.id) ?? -99) > 30) {
      cd.set(l.id, system.currentTick);
      if (can.harm(p)) hurt(p, 4);
      addEffect(p, "slowness", 40, 1);
      title(p, "§c§k||", "", 0, 5, 5);
    }
  });
}, 4);

// ---------------------------------------------------------------- Keeper: cannot be killed, only repelled by a Ward Charm
export function spawnKeeper(p) {
  if (!can.heavy(p)) return false;
  const g = behindOf(p, 32, 6);
  const y = groundAt(p.dimension, g.x, g.z, p.location.y);
  if (y === undefined) return false;
  const e = safeSpawn(p.dimension, "hs:keeper", { x: g.x, y, z: g.z });
  if (!e) return false;
  p.sendMessage("§8Something heavy is walking.");
  play(p, SND.keeper, { volume: 1.0 });
  return true;
}
export const keeperNear = (dim, loc, r = 150) => {
  try {
    return dim.getEntities({ type: "hs:keeper", location: loc, maxDistance: r }).length > 0;
  } catch (e) {
    return false;
  }
};
let keeperTick = 0;
system.runInterval(() => {
  keeperTick++;
  each("hs:keeper", (dim, k) => {
    try {
      k.getComponent("health").resetToMaxValue();
    } catch (e) {}
    const p = dim.getPlayers({ location: k.location, maxDistance: 140, closest: 1 })[0];
    if (!p) {
      k.remove();
      return;
    }
    if (p.hasTag("hs_ward") && dist3(p.location, k.location) < 40) {
      k.remove();
      p.sendMessage("§7The heavy steps stop. They will come back.");
      return;
    }
    if (keeperTick % 6 === 0) {
      play(p, SND.keeper, { location: k.location, volume: 1.0 });
      play(p, SND.heartbeat, { volume: Math.max(0.2, 1 - dist3(p.location, k.location) / 60) });
    }
  });
}, 20);
