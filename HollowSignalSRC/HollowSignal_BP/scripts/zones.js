import { world } from "@minecraft/server";
import { cmd, sleep, overworld, randInt, rand } from "./util.js";

/**
 * Story zones are built high above the overworld (Y=200) at far-away coordinates,
 * generated on demand with /fill, and fenced with barriers so nobody can walk off.
 */
export const Y0 = 200;

export const ZONES = {
  station: { label: "The Hollow Station", x: 3000, z: 3000, sx: 61, sz: 13, spawn: { x: 3003.5, y: Y0, z: 3006.5 }, look: { x: 3040, y: Y0 + 1, z: 3006 } },
  field: { label: "The Static Field", x: 3200, z: 3000, sx: 81, sz: 81, spawn: { x: 3204.5, y: Y0, z: 3040.5 }, look: { x: 3240, y: Y0 + 1, z: 3040 } },
  house: { label: "The Empty House", x: 3400, z: 3000, sx: 41, sz: 41, spawn: { x: 3420.5, y: Y0, z: 3006.5 }, look: { x: 3420, y: Y0 + 1, z: 3020 } },
  court: { label: "The Hollow Court", x: 3600, z: 3000, sx: 61, sz: 61, spawn: { x: 3630.5, y: Y0, z: 3054.5 }, look: { x: 3630, y: Y0 + 1, z: 3030 } },
};

export function zoneOf(loc, dimId = "minecraft:overworld") {
  if (dimId !== "minecraft:overworld" || loc.y < Y0 - 12) return undefined;
  for (const [key, z] of Object.entries(ZONES)) {
    if (loc.x >= z.x - 3 && loc.x <= z.x + z.sx + 3 && loc.z >= z.z - 3 && loc.z <= z.z + z.sz + 3) return key;
  }
  return undefined;
}

// ------------------------------------------------------------------ build helpers
const fill = (d, x1, y1, z1, x2, y2, z2, b, mode = "") =>
  cmd(d, `fill ${Math.floor(x1)} ${Math.floor(y1)} ${Math.floor(z1)} ${Math.floor(x2)} ${Math.floor(y2)} ${Math.floor(z2)} ${b} ${mode}`.trim());
const put = (d, x, y, z, b) => cmd(d, `setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${b}`);

/** Clear a big box in slabs small enough for /fill (32768 block limit). */
async function clear(d, x1, y1, z1, x2, y2, z2) {
  const sx = x2 - x1 + 1, sy = y2 - y1 + 1;
  const dz = Math.max(1, Math.floor(30000 / (sx * sy)));
  for (let z = z1; z <= z2; z += dz) {
    fill(d, x1, y1, z, x2, y2, Math.min(z2, z + dz - 1), "air");
    await sleep(2);
  }
}

function barrierRing(d, x1, z1, x2, z2, y1, y2) {
  fill(d, x1, y1, z1, x2, y2, z1, "barrier");
  fill(d, x1, y1, z2, x2, y2, z2, "barrier");
  fill(d, x1, y1, z1, x1, y2, z2, "barrier");
  fill(d, x2, y1, z1, x2, y2, z2, "barrier");
}

// ------------------------------------------------------------------ zone builders
async function buildStation(d) {
  const { x: X, z: Z } = ZONES.station;
  await clear(d, X - 2, Y0 - 3, Z - 2, X + 62, Y0 + 12, Z + 14);
  fill(d, X, Y0 - 1, Z, X + 60, Y0 - 1, Z + 12, "hs:hollow_stone");
  fill(d, X, Y0 + 7, Z, X + 60, Y0 + 7, Z + 12, "minecraft:polished_blackstone_bricks");
  fill(d, X, Y0, Z, X + 60, Y0 + 6, Z, "minecraft:polished_blackstone_bricks");
  fill(d, X, Y0, Z + 12, X + 60, Y0 + 6, Z + 12, "minecraft:polished_blackstone_bricks");
  fill(d, X, Y0, Z, X, Y0 + 6, Z + 12, "minecraft:polished_blackstone_bricks");
  fill(d, X + 60, Y0, Z, X + 60, Y0 + 6, Z + 12, "minecraft:polished_blackstone_bricks");
  // dead rail line down the middle
  fill(d, X + 1, Y0, Z + 6, X + 59, Y0, Z + 6, "minecraft:rail");
  // pillars with lamps
  for (let px = X + 6; px <= X + 54; px += 8) {
    for (const pz of [Z + 3, Z + 9]) {
      fill(d, px, Y0, pz, px, Y0 + 6, pz, "hs:hollow_stone");
      put(d, px, Y0 + 4, pz, "hs:hollow_lamp");
    }
  }
  // static damage on floor and ceiling
  for (let i = 0; i < 40; i++) {
    put(d, X + randInt(2, 58), Y0 - 1, Z + randInt(1, 11), "hs:static_block");
    put(d, X + randInt(2, 58), Y0 + 7, Z + randInt(1, 11), "hs:static_block");
  }
  await sleep(2);
  // end alcove with the signal
  fill(d, X + 55, Y0, Z + 4, X + 59, Y0 + 3, Z + 8, "air");
  put(d, X + 57, Y0, Z + 6, "hs:signal_block");
  put(d, X + 57, Y0 + 3, Z + 6, "hs:hollow_lamp");
}

async function buildField(d) {
  const { x: X, z: Z } = ZONES.field;
  await clear(d, X - 2, Y0 - 3, Z - 2, X + 82, Y0 + 34, Z + 82);
  fill(d, X, Y0 - 1, Z, X + 80, Y0 - 1, Z + 80, "minecraft:light_gray_concrete");
  for (let i = 0; i < 70; i++) {
    const s = randInt(2, 6), px = randInt(0, 80 - s), pz = randInt(0, 80 - s);
    fill(d, X + px, Y0 - 1, Z + pz, X + px + s, Y0 - 1, Z + pz + s, "minecraft:white_concrete");
  }
  for (let i = 0; i < 45; i++) {
    const s = randInt(0, 2), px = randInt(0, 78), pz = randInt(0, 78);
    fill(d, X + px, Y0 - 1, Z + pz, X + px + s, Y0 - 1, Z + pz + s, "hs:static_block");
  }
  await sleep(2);
  barrierRing(d, X - 1, Z - 1, X + 81, Z + 81, Y0, Y0 + 30);
  // scattered pillars
  let placed = 0, tries = 0;
  while (placed < 18 && tries++ < 200) {
    const px = randInt(8, 76), pz = randInt(4, 76);
    if (Math.abs(px - 40) < 8 && Math.abs(pz - 40) < 8) continue; // keep the center clear
    if (px < 14 && Math.abs(pz - 40) < 6) continue; // keep the spawn clear
    const h = randInt(5, 13);
    fill(d, X + px, Y0, Z + pz, X + px, Y0 + h, Z + pz, "hs:hollow_stone");
    put(d, X + px, Y0 + h + 1, Z + pz, "hs:hollow_lamp");
    placed++;
  }
  await sleep(2);
  // center shrine
  fill(d, X + 39, Y0, Z + 39, X + 41, Y0, Z + 41, "hs:static_block");
  put(d, X + 40, Y0 + 1, Z + 40, "hs:signal_block");
  for (const [dx, dz] of [[-3, -3], [-3, 0], [-3, 3], [0, -3], [0, 3], [3, -3], [3, 0], [3, 3]]) {
    put(d, X + 40 + dx, Y0, Z + 40 + dz, "hs:hollow_lamp");
  }
}

async function buildHouse(d) {
  const { x: X, z: Z } = ZONES.house;
  const f = (x1, y1, z1, x2, y2, z2, b, m = "") => fill(d, X + x1, Y0 + y1, Z + z1, X + x2, Y0 + y2, Z + z2, b, m);
  const p = (x, y, z, b) => put(d, X + x, Y0 + y, Z + z, b);

  await clear(d, X - 2, Y0 - 10, Z - 2, X + 42, Y0 + 12, Z + 42);
  f(0, -1, 0, 40, -1, 40, "minecraft:grass_block");
  barrierRing(d, X - 1, Z - 1, X + 41, Z + 41, Y0, Y0 + 12);
  // shell, roof, floor
  f(10, 0, 10, 30, 4, 26, "minecraft:dark_oak_planks", "hollow");
  f(10, 5, 10, 30, 5, 26, "minecraft:dark_oak_planks");
  f(10, -1, 10, 30, -1, 26, "minecraft:spruce_planks");
  f(19, 0, 10, 20, 1, 10, "air"); // front door
  // interior walls
  f(11, 0, 18, 29, 3, 18, "minecraft:dark_oak_planks");
  f(19, 0, 18, 20, 2, 18, "air");
  f(20, 0, 19, 20, 3, 25, "minecraft:dark_oak_planks");
  f(20, 0, 22, 20, 2, 23, "air");
  await sleep(2);
  // windows
  for (const [x, z] of [[14, 10], [26, 10], [10, 14], [30, 14], [10, 22], [30, 22], [14, 26], [26, 26]]) p(x, 2, z, "minecraft:glass_pane");
  // living room
  f(11, 0, 11, 15, 2, 11, "minecraft:bookshelf");
  p(28, 0, 12, "minecraft:crafting_table");
  p(28, 0, 16, "minecraft:chest");
  p(25, 0, 14, "minecraft:oak_fence"); p(25, 1, 14, "minecraft:oak_pressure_plate");
  // bedroom (wool bed) and kitchen
  p(12, 0, 24, "minecraft:white_wool"); p(12, 0, 25, "minecraft:red_wool");
  p(27, 0, 24, "minecraft:furnace"); p(22, 0, 24, "minecraft:cauldron");
  // lamps
  for (const [x, z] of [[15, 14], [25, 14], [15, 22], [25, 22]]) p(x, 4, z, "hs:hollow_lamp");
  // basement: shell, interior, hole in the floor with hay to soften the drop
  f(10, -8, 10, 30, -2, 26, "minecraft:stone_bricks", "hollow");
  f(24, -1, 22, 25, -2, 23, "air");
  f(24, -7, 22, 25, -7, 23, "minecraft:hay_block");
  for (const bx of [14, 18, 22, 26]) for (const bz of [14, 20]) {
    f(bx, -7, bz, bx, -3, bz, "hs:hollow_stone");
    p(bx, -4, bz + 1, "hs:hollow_lamp");
  }
  f(19, -7, 11, 21, -7, 11, "hs:static_block");
  p(20, -6, 11, "hs:signal_block");
}

async function buildCourt(d) {
  const { x: X, z: Z } = ZONES.court;
  const cx = X + 30, cz = Z + 30;
  await clear(d, X - 2, Y0 - 3, Z - 2, X + 62, Y0 + 26, Z + 62);
  fill(d, X, Y0 - 1, Z, X + 60, Y0 - 1, Z + 60, "minecraft:blackstone");
  const R = 28;
  for (let dz = -R; dz <= R; dz++) {
    const half = Math.floor(Math.sqrt(R * R - dz * dz));
    fill(d, cx - half, Y0 - 1, cz + dz, cx + half, Y0 - 1, cz + dz, "hs:hollow_stone");
  }
  await sleep(2);
  barrierRing(d, X - 1, Z - 1, X + 61, Z + 61, Y0, Y0 + 24);
  // ring of pillars
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(a) * 22), pz = Math.round(cz + Math.sin(a) * 22);
    fill(d, px, Y0, pz, px, Y0 + 8, pz, "hs:static_block");
    put(d, px, Y0 + 9, pz, "hs:hollow_lamp");
  }
  // dais
  fill(d, cx - 4, Y0, cz - 4, cx + 4, Y0, cz + 4, "hs:static_block");
  fill(d, cx - 2, Y0 + 1, cz - 2, cx + 2, Y0 + 1, cz + 2, "hs:hollow_stone");
}

const BUILDERS = { station: buildStation, field: buildField, house: buildHouse, court: buildCourt };

// ------------------------------------------------------------------ public API
const builds = new Map(); // key -> Promise (so concurrent players do not build twice)

export function ensureZone(key) {
  if (world.getDynamicProperty(`hs:built:${key}`) === true) return Promise.resolve(true);
  if (builds.has(key)) return builds.get(key);
  const p = (async () => {
    const d = overworld();
    const z = ZONES[key];
    const area = `hs_${key}`;
    cmd(d, `tickingarea add ${z.x - 4} 0 ${z.z - 4} ${z.x + z.sx + 4} 0 ${z.z + z.sz + 4} ${area}`);
    // wait until the chunks respond
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(20);
      try {
        ready = !!d.getBlock({ x: z.x + 1, y: Y0, z: z.z + 1 });
      } catch (e) {
        ready = false;
      }
    }
    await BUILDERS[key](d);
    await sleep(10);
    cmd(d, `tickingarea remove ${area}`);
    world.setDynamicProperty(`hs:built:${key}`, true);
    builds.delete(key);
    return true;
  })();
  builds.set(key, p);
  return p;
}

/** Wipe the build flag so a zone is regenerated next visit (used by the reset event). */
export function forgetZones() {
  for (const k of Object.keys(ZONES)) world.setDynamicProperty(`hs:built:${k}`, undefined);
}

// ------------------------------------------------------------------ the Hollow Realm (generated flat world)
export const REALM = { x: 20000, z: 20000, floor: 100, radius: 4000 };
export function inRealm(loc, dimId = "minecraft:overworld") {
  return (
    dimId === "minecraft:overworld" &&
    Math.abs(loc.x - REALM.x) < REALM.radius &&
    Math.abs(loc.z - REALM.z) < REALM.radius &&
    loc.y > REALM.floor - 8 &&
    loc.y < REALM.floor + 100
  );
}
/** "station" | "field" | "house" | "court" | "realm" | undefined */
export const placeOf = (loc, dimId = "minecraft:overworld") => zoneOf(loc, dimId) ?? (inRealm(loc, dimId) ? "realm" : undefined);
