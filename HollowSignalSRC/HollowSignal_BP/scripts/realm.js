import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { can, personal, hasAnswered } from "./settings.js";
import { addC } from "./corruption.js";
import { REALM, inRealm } from "./zones.js";
import { getStage, setStage, giveItem, returnToOverworld, K_RETURN, you } from "./state.js";
import { zoneOf } from "./zones.js";
import { spawnKeeper, keeperNear } from "./creatures.js";
import { spawnWatcher } from "./watcher.js";
import { jumpscare } from "./jumpscare.js";
import { SND, play, sleep, cmd, overworld, rand, randInt, pick, getPlayer, isDead, addEffect, title, actionBar, dist3, safeSpawn, groundAt, behindOf } from "./util.js";

/**
 * THE HOLLOW REALM - a generated flat world built far from spawn (Bedrock add-ons cannot add real dimensions).
 * Cobblestone plazas and grass-and-flower gardens ringed in cobblestone, scattered structures, lore tablets.
 * Only the surface block can be dug: bedrock lies directly under it.
 */
const B = REALM.floor;
const FLOWERS = ["dandelion", "poppy", "cornflower", "azure_bluet", "oxeye_daisy", "allium", "white_tulip", "lily_of_the_valley"];

// ------------------------------------------------------------------ deterministic RNG
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (cx, cz) => (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x5bd1e995) | 0;
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

// ------------------------------------------------------------------ chunk generation
const OCX = REALM.x >> 4, OCZ = REALM.z >> 4;
const generating = new Set();
const queued = new Set();

function isGenerated(dim, cx, cz) {
  try {
    const b = dim.getBlock({ x: cx * 16, y: B - 3, z: cz * 16 });
    if (!b) return undefined; // not loaded
    return b.typeId === "minecraft:bedrock";
  } catch (e) {
    return undefined;
  }
}

function genChunk(dim, cx, cz) {
  const key = `${cx},${cz}`;
  if (generating.has(key)) return;
  generating.add(key);
  const x0 = cx * 16, z0 = cz * 16;
  const r = rng(hash(cx, cz));
  const F = (a, b, c, d, e, f, blk) => cmd(dim, `fill ${x0 + a} ${B + b} ${z0 + c} ${x0 + d} ${B + e} ${z0 + f} ${blk}`);
  const P = (a, b, c, blk) => cmd(dim, `setblock ${x0 + a} ${B + b} ${z0 + c} ${blk}`);

  F(0, 1, 0, 15, 60, 15, "air");
  F(0, -5, 0, 15, -1, 15, "bedrock"); // only the surface block can be dug

  const origin = cx === OCX && cz === OCZ;
  const roll = r();
  const kind = origin ? "garden" : roll < 0.55 ? "garden" : roll < 0.9 ? "plaza" : "dark";

  if (kind === "garden") {
    F(0, 0, 0, 15, 0, 15, "grass_block");
    F(0, 0, 0, 15, 0, 0, "cobblestone");
    F(0, 0, 15, 15, 0, 15, "cobblestone");
    F(0, 0, 0, 0, 0, 15, "cobblestone");
    F(15, 0, 0, 15, 0, 15, "cobblestone");
    for (let i = 0; i < 26; i++) P(ri(r, 1, 14), 1, ri(r, 1, 14), `${pick2(r, FLOWERS)}`);
    for (let i = 0; i < 14; i++) P(ri(r, 1, 14), 1, ri(r, 1, 14), "tallgrass");
  } else if (kind === "plaza") {
    F(0, 0, 0, 15, 0, 15, "cobblestone");
    for (let i = 0; i < 24; i++) P(ri(r, 0, 15), 0, ri(r, 0, 15), pick2(r, ["mossy_cobblestone", "stone_bricks", "andesite", "stone"]));
  } else {
    F(0, 0, 0, 15, 0, 15, "polished_blackstone");
    for (let i = 0; i < 20; i++) P(ri(r, 0, 15), 0, ri(r, 0, 15), pick2(r, ["blackstone", "hs:static_block", "deepslate"]));
  }

  if (origin) {
    P(8, 1, 12, "hs:tablet");
    F(4, 1, 4, 4, 3, 4, "oak_fence");
    P(4, 4, 4, "hs:hollow_lamp");
  } else if (kind === "dark") {
    (r() < 0.5 ? monolith : doorway)(F, P, r);
  } else if (r() < (kind === "plaza" ? 0.8 : 0.35)) {
    const pool = kind === "plaza" ? [chapel, house, graveyard, pillar, bedCircle, monolith, doorway, lamppost] : [deadTree, lamppost, pillar, graveyard];
    pick2(r, pool)(F, P, r);
  }
  generating.delete(key);
}
const pick2 = (r, arr) => arr[Math.floor(r() * arr.length)];
const tablet = (P, r, x, z, p = 0.55) => r() < p && P(x, 1, z, "hs:tablet");

function chapel(F, P, r) {
  F(2, 1, 3, 10, 6, 11, "cobblestone hollow");
  F(6, 1, 3, 6, 3, 3, "air");
  F(2, 3, 7, 2, 4, 8, "air"); F(10, 3, 7, 10, 4, 8, "air"); F(5, 3, 11, 7, 4, 11, "air");
  for (let i = 0; i < 12; i++) P(ri(r, 2, 10), ri(r, 1, 6), r() < 0.5 ? 3 : 11, "air");
  F(5, 1, 10, 7, 1, 10, "stone_bricks");
  P(6, 2, 10, "hs:hollow_lamp");
  tablet(P, r, 6, 7, 0.7);
}
function house(F, P, r) {
  F(4, 1, 4, 10, 5, 10, "spruce_planks hollow");
  F(7, 1, 4, 7, 2, 4, "air");
  P(4, 3, 7, "glass_pane"); P(10, 3, 7, "glass_pane"); P(7, 3, 10, "glass_pane");
  F(4, 6, 4, 10, 6, 10, "spruce_planks");
  P(6, 1, 8, "white_wool"); P(6, 1, 9, "red_wool");
  P(8, 4, 8, "hs:hollow_lamp");
  tablet(P, r, 8, 8, 0.4);
}
function graveyard(F, P, r) {
  for (let x = 3; x <= 12; x += 3) for (const z of [4, 8, 12]) F(x, 1, z, x, 2, z, "cobblestone_wall");
  tablet(P, r, 7, 14, 0.6);
}
function pillar(F, P, r) {
  F(7, 0, 7, 9, 0, 9, "hs:static_block");
  const h = ri(r, 10, 20);
  F(8, 1, 8, 8, h, 8, "hs:hollow_stone");
  P(8, h + 1, 8, "hs:hollow_lamp");
}
function bedCircle(F, P, r) {
  F(5, 0, 5, 11, 0, 11, "cobblestone");
  P(8, 1, 8, "white_wool"); P(8, 1, 9, "red_wool");
  P(8, 1, 6, "hs:hollow_lamp");
  tablet(P, r, 8, 11, 0.55);
}
function monolith(F, P, r) {
  F(6, 0, 6, 10, 0, 10, "hs:static_block");
  F(7, 1, 7, 9, 10, 9, "hs:hollow_stone");
  P(8, 11, 8, "hs:hollow_lamp");
  tablet(P, r, 8, 5, 0.6);
}
function doorway(F, P, r) {
  F(6, 1, 8, 10, 5, 8, "polished_blackstone_bricks");
  F(7, 1, 8, 9, 4, 8, "air");
  P(6, 6, 8, "hs:hollow_lamp"); P(10, 6, 8, "hs:hollow_lamp");
}
function lamppost(F, P, r) {
  for (let x = 3; x <= 13; x += 2) { F(x, 1, 8, x, 4, 8, "oak_fence"); P(x, 5, 8, "hs:hollow_lamp"); }
}
function deadTree(F, P, r) {
  F(8, 1, 8, 8, 7, 8, "oak_log");
  for (const [x, y, z] of [[7, 5, 8], [6, 6, 8], [9, 4, 8], [10, 5, 8], [8, 6, 9], [8, 7, 10], [8, 5, 7]]) P(x, y, z, "oak_log");
}

// ------------------------------------------------------------------ streaming
const CHUNK_RADIUS = 4;
function enqueueAround(p) {
  const pcx = Math.floor(p.location.x) >> 4, pcz = Math.floor(p.location.z) >> 4;
  for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
    queued.add(`${pcx + dx},${pcz + dz}`);
  }
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) if (inRealm(p.location, p.dimension.id)) enqueueAround(p);
}, 20);

system.runInterval(() => {
  if (!queued.size) return;
  const players = world.getAllPlayers().filter((p) => inRealm(p.location, p.dimension.id));
  if (!players.length) {
    queued.clear();
    return;
  }
  const dim = overworld();
  let best, bd = Infinity;
  for (const k of queued) {
    const [cx, cz] = k.split(",").map(Number);
    for (const p of players) {
      const d = Math.hypot(cx * 16 + 8 - p.location.x, cz * 16 + 8 - p.location.z);
      if (d < bd) { bd = d; best = [cx, cz, k]; }
    }
  }
  if (!best) return;
  const [cx, cz, k] = best;
  const gen = isGenerated(dim, cx, cz);
  if (gen === undefined) {
    queued.delete(k); // not loaded yet; the 1s refill will retry
    return;
  }
  queued.delete(k);
  if (!gen) genChunk(dim, cx, cz);
}, 2);

// keep players inside the map
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!inRealm(p.location, p.dimension.id)) continue;
    if (Math.abs(p.location.x - REALM.x) > REALM.radius - 200 || Math.abs(p.location.z - REALM.z) > REALM.radius - 200) {
      p.teleport({ x: REALM.x + 8.5, y: B + 1, z: REALM.z + 8.5 });
      p.sendMessage("§8The edge folds you back.");
    }
  }
}, 100);

// ------------------------------------------------------------------ entering the Realm
export async function enterRealm(p) {
  const id = p.id;
  const stage = getStage(p);
  if (stage < 6) {
    p.sendMessage("§8The door is not open yet.");
    return;
  }
  const here = inRealm(p.location, p.dimension.id) || zoneOf(p.location, p.dimension.id);
  if (!here) p.setDynamicProperty(K_RETURN, JSON.stringify({ x: p.location.x, y: p.location.y, z: p.location.z, dim: p.dimension.id }));
  const dim = overworld();
  const area = "hs_realm";
  cmd(dim, `tickingarea add ${REALM.x - 40} 0 ${REALM.z - 40} ${REALM.x + 56} 0 ${REALM.z + 56} ${area}`);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    const q = getPlayer(id);
    if (!q) return;
    addEffect(q, "blindness", 60, 0);
    actionBar(q, "§8Turning the page...");
    let loaded = true;
    for (let dx = -2; dx <= 2 && loaded; dx++) for (let dz = -2; dz <= 2 && loaded; dz++) {
      const g = isGenerated(dim, OCX + dx, OCZ + dz);
      if (g === undefined) loaded = false;
      else if (!g) genChunk(dim, OCX + dx, OCZ + dz);
    }
    ready = loaded;
    await sleep(10);
  }
  cmd(dim, `tickingarea remove ${area}`);
  const q = getPlayer(id);
  if (!q) return;
  try {
    q.teleport({ x: REALM.x + 8.5, y: B + 1, z: REALM.z + 8.5 }, { dimension: dim, facingLocation: { x: REALM.x + 8.5, y: B + 1.6, z: REALM.z + 14 } });
  } catch (e) {}
  addEffect(q, "resistance", 100, 4);
  await sleep(30);
  title(q, "§fTHE HOLLOW REALM", "", 20, 70, 30);
  play(q, SND.drone, { volume: 0.8 });
  if (stage === 6) {
    setStage(q, 7);
    await sleep(80);
    q.sendMessage("§8Everything here is kept. Nothing here is alive.");
    await sleep(60);
    q.sendMessage(you(q, "§8Read the tablets, {n}. Seven of them. The reader is supposed to read.", "§8Read the tablets. Seven of them. The reader is supposed to read."));
  }
}

// ------------------------------------------------------------------ lore tablets
const TABLETS = [
  () => "INDEX, PAGE 1\n\nI started keeping things because things kept leaving. A street. A kitchen. A voice on the stairs. I wrote each one down so it could not go.",
  () => "PAGE 4\n\nWriting was not enough. A page cannot hold a room. So I copied the rooms. The copies were quiet and tidy and wrong.",
  () => "PAGE 9\n\nThe copies forgot the people. I kept the chairs, the lamps, the good coats. I did not know a coat could stand by itself.",
  () => "PAGE 12\n\nThey started to look at me. Not angry. Curious, the way a mirror is curious. I named them Hollows so I could stop thinking of them as visitors.",
  () => "PAGE 17\n\nSomeone wanted to be remembered more than the rest. It found a crown I had left on the stairs and put it on. After that, every room had one door that led to it.",
  () => "PAGE 23\n\nThe garden plots are where I tried to grow something that would stay. The grass grows. The flowers close when I look at them. Everything here is kept. Nothing here is alive.",
  (p) => personal(p)
    ? `PAGE 31\n\nI made a signal so that someone would come and read. I did not think about what kind of someone answers a signal.\n\nYour name is ${p.name}. I wish I had not read it.`
    : "PAGE 31\n\nI made a signal so that someone would come and read. I did not think about what kind of someone answers a signal.\n\nYou have a name. Do not tell me it.",
  () => "PAGE 40\n\nIf you have read this far, you are the reader. Readers are supposed to leave. That is the rule I forgot to write down.",
  () => "PAGE 41\n\nThe last page is not a page. It is a door in the east. Behind it is the thing I have been keeping. It does not know it was a person. Please do not tell it.",
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

async function readTablet(p, loc) {
  const n = p.getDynamicProperty("hs:tablets") ?? 0;
  p.setDynamicProperty("hs:tablets", n + 1);
  cmd(p.dimension, `setblock ${loc.x} ${loc.y} ${loc.z} hs:static_block`);
  play(p, SND.whisper, { volume: 0.6 });
  addC(p, 2);
  const body = n < TABLETS.length ? TABLETS[n](p) : "The text has worn off.";
  const title2 = n < TABLETS.length ? `Tablet ${ROMAN[n]}` : "Tablet";
  try {
    await new ActionFormData().title(title2).body(body).button("Close").show(p);
  } catch (e) {}
  const q = getPlayer(p.id);
  if (q && getStage(q) === 7 && n + 1 >= 7) unlockFinal(q);
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (block.typeId === "hs:tablet" && inRealm(player.location, player.dimension.id)) readTablet(player, block.location);
});
// walking up to a tablet is enough (a 5x5 area around it, so you never get stuck one block away)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!inRealm(p.location, p.dimension.id) || !hasAnswered(p) || getStage(p) < 7) continue;
    const fx = Math.floor(p.location.x), fy = Math.floor(p.location.y), fz = Math.floor(p.location.z);
    let found;
    for (let dx = -2; dx <= 2 && !found; dx++) for (let dz = -2; dz <= 2 && !found; dz++) for (let dy = -1; dy <= 2 && !found; dy++) {
      try {
        const b = p.dimension.getBlock({ x: fx + dx, y: fy + dy, z: fz + dz });
        if (b?.typeId === "hs:tablet") found = b.location;
      } catch (e) {}
    }
    if (found) readTablet(p, found);
  }
}, 12);

// ------------------------------------------------------------------ the final signal
async function unlockFinal(p) {
  const id = p.id;
  const cx = OCX + 8, cz = OCZ + randInt(-3, 3);
  const tx = cx * 16 + 8, tz = cz * 16 + 8;
  p.sendMessage("§8Something to the east has opened its eyes.");
  setStage(p, 8);
  const dim = overworld();
  cmd(dim, `tickingarea add ${tx - 24} 0 ${tz - 24} ${tx + 24} 0 ${tz + 24} hs_final`);
  for (let i = 0; i < 80; i++) {
    await sleep(10);
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) for (let dz = -1; dz <= 1 && ok; dz++) {
      const g = isGenerated(dim, cx + dx, cz + dz);
      if (g === undefined) ok = false;
      else if (!g) genChunk(dim, cx + dx, cz + dz);
    }
    if (ok) break;
  }
  const F = (a, b, c, d, e, f, blk) => cmd(dim, `fill ${a} ${b} ${c} ${d} ${e} ${f} ${blk}`);
  F(tx - 3, B, tz - 3, tx + 3, B, tz + 3, "hs:static_block");
  F(tx, B + 1, tz, tx, B + 1, tz, "hs:signal_block");
  for (const [dx, dz] of [[-3, -3], [-3, 3], [3, -3], [3, 3], [0, -3], [0, 3], [-3, 0], [3, 0]]) cmd(dim, `setblock ${tx + dx} ${B + 1} ${tz + dz} hs:hollow_lamp`);
  F(tx + 5, B + 1, tz, tx + 5, B + 46, tz, "hs:hollow_stone");
  cmd(dim, `setblock ${tx + 5} ${B + 47} ${tz} hs:hollow_lamp`);
  cmd(dim, "tickingarea remove hs_final");
  const q = getPlayer(id);
  if (q) q.setDynamicProperty("hs:final", JSON.stringify({ x: tx, y: B + 1, z: tz }));
}
export function finalLoc(p) {
  try {
    return JSON.parse(p.getDynamicProperty("hs:final"));
  } catch (e) {
    return undefined;
  }
}

export async function activateFinal(p) {
  if (getStage(p) !== 8 || p.getDynamicProperty("hs:conf") === true) return;
  p.setDynamicProperty("hs:conf", true);
  const id = p.id;
  try {
    setStage(p, 9);
    title(p, "§f§k||||", "", 4, 30, 10);
    play(p, SND.stinger);
    const say = (q, t) => q.sendMessage(`§f<The Keeper> §7${t}`);
    for (const line of [
      "I wrote the journal. I wrote all of it.",
      "I am what you have been walking away from. I am so sorry.",
      "Do not let me catch you. I do not know what I would keep.",
    ]) {
      const q = getPlayer(id);
      if (!q) return;
      say(q, line);
      await sleep(70);
    }
    const loc = finalLoc(p);
    if (loc) cmd(overworld(), `setblock ${loc.x} ${loc.y} ${loc.z} hs:static_block`);
    // survive 90 seconds
    for (let t = 90; t > 0; t--) {
      const q = getPlayer(id);
      if (!q || isDead(q) || !inRealm(q.location, q.dimension.id)) {
        if (q) {
          q.sendMessage("§8It keeps what it catches. The signal is still there.");
          if (loc) cmd(overworld(), `setblock ${loc.x} ${loc.y} ${loc.z} hs:signal_block`);
          setStage(q, 8);
        }
        return;
      }
      actionBar(q, `§f§lSURVIVE §r§7${t}s`);
      if (t % 5 === 0 && can.harm(q) && !q.hasTag("hs_ward") && !keeperNear(q.dimension, q.location)) spawnKeeper(q);
      if (t % 12 === 0) await jumpscare(q);
      if (t % 20 === 0) spawnWatcher(q, "edge");
      await sleep(20);
    }
    const q = getPlayer(id);
    if (!q) return;
    try {
      for (const k of q.dimension.getEntities({ type: "hs:keeper" })) k.remove();
    } catch (e) {}
    setStage(q, 10);
    title(q, "§f§lIT LETS GO", "", 20, 80, 40);
    play(q, SND.musicbox, { volume: 0.8 });
    await sleep(100);
    say(q, "You may go. Take the quiet with you.");
    await sleep(80);
    say(q, you(q, "Thank you for reading, {n}.", "Thank you for reading."));
    giveItem(q, "minecraft:diamond", 8);
    giveItem(q, "minecraft:totem_of_undying", 1);
    giveItem(q, "hs:ward_charm", 4);
    await sleep(120);
    const r = getPlayer(id);
    if (r) returnToOverworld(r);
  } finally {
    const q = getPlayer(id);
    if (q) q.setDynamicProperty("hs:conf", false);
  }
}

// ------------------------------------------------------------------ life in the Realm
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!inRealm(p.location, p.dimension.id) || !can.spooks(p) || p.hasTag("hs_ward") || getStage(p) < 7) continue;
    let near = 0;
    try {
      near = p.dimension.getEntities({ families: ["monster"], location: p.location, maxDistance: 60 }).length;
    } catch (e) {}
    if (near >= 4) continue;
    const roll = Math.random();
    const b = behindOf(p, rand(16, 26), 6);
    const y = groundAt(p.dimension, b.x, b.z, p.location.y);
    if (y === undefined) continue;
    const type = roll < 0.45 ? "hs:hollow" : roll < 0.65 ? "hs:crawler" : roll < 0.8 ? "hs:mimic" : roll < 0.92 && can.heavy(p) ? "hs:lurker" : "hs:watcher";
    if (type === "hs:watcher") spawnWatcher(p, pick(["far", "edge"]));
    else safeSpawn(p.dimension, type, { x: b.x, y, z: b.z });
  }
}, 600);
