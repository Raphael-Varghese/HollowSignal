import { world, system } from "@minecraft/server";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sleep = (ticks) => new Promise((res) => system.runTimeout(res, Math.max(1, ticks)));
export const overworld = () => world.getDimension("overworld");
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const getPlayer = (id) => world.getAllPlayers().find((p) => p.id === id);

/** Custom sound ids (see sound_definitions.json). Replace the .ogg files to use your own recordings. */
export const SND = {
  scream: "hs.scare.scream",
  stinger: "hs.scare.stinger",
  static: "hs.scare.static",
  whisper: "hs.whisper",
  breath: "hs.breath",
  drone: "hs.watcher.drone",
  keeper: "hs.keeper.walk",
  glitch: "hs.glitch",
  heartbeat: "hs.heartbeat.fast",
  musicbox: "hs.musicbox",
};

/** Run a command, never throw. */
export function cmd(target, c) {
  try {
    return target.runCommand(c);
  } catch (e) {
    return undefined;
  }
}

export function play(player, id, opts) {
  try {
    player.playSound(id, opts);
  } catch (e) {}
}
export const safeSound = play;

export function stopAllSounds(p) {
  cmd(p, "stopsound @s");
}
export function shake(p, intensity = 1, seconds = 1, type = "positional") {
  cmd(p, `camerashake add @s ${Number(intensity).toFixed(2)} ${Number(seconds).toFixed(2)} ${type}`);
}
export function stopShake(p) {
  cmd(p, "camerashake stop @s");
}

export function isDead(p) {
  try {
    return p.getComponent("health").currentValue <= 0;
  } catch (e) {
    return false;
  }
}
export function hp(p) {
  try {
    return p.getComponent("health").currentValue;
  } catch (e) {
    return 20;
  }
}
export function hurt(p, amount, cause) {
  try {
    if (cause) p.applyDamage(amount, { cause });
    else p.applyDamage(amount);
  } catch (e) {
    try {
      p.applyDamage(amount);
    } catch (e2) {}
  }
}

export function addEffect(player, id, ticks, amp = 0) {
  try {
    player.addEffect(id, ticks, { amplifier: amp, showParticles: false });
  } catch (e) {}
}

export function title(player, main, sub = "", fadeIn = 10, stay = 40, fadeOut = 20) {
  try {
    player.onScreenDisplay.setTitle(main, { fadeInDuration: fadeIn, stayDuration: stay, fadeOutDuration: fadeOut, subtitle: sub });
  } catch (e) {}
}
export const flashWord = (p, word) => title(p, word, "", 0, 7, 3);
export function actionBar(p, text) {
  try {
    p.onScreenDisplay.setActionBar(text);
  } catch (e) {}
}

export function heldItemName(player) {
  try {
    const item = player.getComponent("inventory")?.container?.getItem(player.selectedSlotIndex);
    if (!item) return undefined;
    return item.typeId.replace(/^[a-z_]+:/, "").replace(/_/g, " ");
  } catch (e) {
    return undefined;
  }
}

const LIGHT_ITEMS = new Set([
  "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern", "minecraft:glowstone",
  "minecraft:sea_lantern", "minecraft:lit_pumpkin", "minecraft:shroomlight", "minecraft:campfire", "hs:hollow_lamp",
]);
export function holdingLight(p) {
  try {
    const main = p.getComponent("inventory")?.container?.getItem(p.selectedSlotIndex);
    if (main && LIGHT_ITEMS.has(main.typeId)) return true;
  } catch (e) {}
  try {
    const off = p.getComponent("equippable")?.getEquipment("Offhand");
    if (off && LIGHT_ITEMS.has(off.typeId)) return true;
  } catch (e) {}
  return false;
}

/** Standing position near (x,z), searching around refY. Returns y of the air block above a solid floor. */
export function groundAt(dim, x, z, refY) {
  try {
    for (let y = Math.floor(refY) + 8; y > Math.floor(refY) - 24; y--) {
      const b = dim.getBlock({ x: Math.floor(x), y, z: Math.floor(z) });
      const above = dim.getBlock({ x: Math.floor(x), y: y + 1, z: Math.floor(z) });
      if (b && above && !b.isAir && !b.isLiquid && above.isAir) return y + 1;
    }
  } catch (e) {}
  return undefined;
}

export function safeSpawn(dim, typeId, loc) {
  try {
    return dim.spawnEntity(typeId, loc);
  } catch (e) {
    return undefined;
  }
}

/** A point `dist` blocks behind the player (opposite their view), with a little sideways spread. */
export function behindOf(p, dist, spread = 3) {
  const v = p.getViewDirection();
  const h = Math.hypot(v.x, v.z) || 1;
  return { x: p.location.x - (v.x / h) * dist + rand(-spread, spread), z: p.location.z - (v.z / h) * dist + rand(-spread, spread) };
}

/** A point at the edge of the player's field of view (roughly 55-75 degrees off to a random side). */
export function edgeOfView(p, dist) {
  const v = p.getViewDirection();
  const base = Math.atan2(v.z, v.x);
  const a = base + (Math.random() < 0.5 ? -1 : 1) * rand(0.95, 1.3);
  return { x: p.location.x + Math.cos(a) * dist, z: p.location.z + Math.sin(a) * dist };
}

/** Is the player looking at `loc` (not blocked by terrain)? */
export function lookingAt(p, loc, d, minDot = 0.72) {
  if (d > 56) return false;
  const v = p.getViewDirection();
  const dx = loc.x - p.location.x, dy = loc.y + 1.6 - (p.location.y + 1.6), dz = loc.z - p.location.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  if ((v.x * dx + v.y * dy + v.z * dz) / len < minDot) return false;
  try {
    const hit = p.getBlockFromViewDirection({ maxDistance: Math.max(2, d) });
    if (hit && dist3(hit.block.location, p.location) < d - 1.5) return false;
  } catch (e) {}
  return true;
}

/** Random sampling around a point; returns the first Block for which test(block) is truthy. */
export function sampleNear(dim, center, radius, tries, test, vertical = radius) {
  for (let i = 0; i < tries; i++) {
    const loc = {
      x: Math.floor(center.x + rand(-radius, radius)),
      y: Math.floor(center.y + rand(-vertical, vertical)),
      z: Math.floor(center.z + rand(-radius, radius)),
    };
    try {
      const b = dim.getBlock(loc);
      if (b && test(b)) return b;
    } catch (e) {}
  }
  return undefined;
}
