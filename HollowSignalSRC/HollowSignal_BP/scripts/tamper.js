import { ItemStack, world } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { cmd, play, rand, pick, randInt, sampleNear, behindOf, groundAt, dist3 } from "./util.js";

/**
 * Things that break your trust in the world. Block edits only run for players on High (can.edits);
 * fake chat events only need Medium (can.spooks). Nothing here deletes player items or builds.
 */

const NAMES = ["Elias", "M_o_r_g", "Ashby", "qwerty0", "Wren", "Ines", "Tobias", "Odette"];

export function doorOpen(p) {
  if (!can.edits(p)) return false;
  const b = sampleNear(p.dimension, p.location, 14, 60, (bl) => /_door$/.test(bl.typeId) && !bl.typeId.includes("iron"), 5);
  if (!b) return false;
  try {
    if (b.permutation.getState("upper_block_bit") === true) return false;
    if (b.permutation.getState("open_bit") === true) return false;
    b.setPermutation(b.permutation.withState("open_bit", true));
    play(p, "random.door_open", { location: b.location, volume: 0.8, pitch: 0.8 });
    return true;
  } catch (e) {
    return false;
  }
}

export function torchRemove(p) {
  if (!can.edits(p)) return false;
  const b = sampleNear(p.dimension, p.location, 18, 70, (bl) => bl.typeId === "minecraft:torch", 6);
  if (!b) return false;
  cmd(p.dimension, `setblock ${b.location.x} ${b.location.y} ${b.location.z} air`);
  play(p, "random.fizz", { location: b.location, volume: 0.7, pitch: 0.7 });
  return true;
}

/** A Hollow Lamp appears on the floor somewhere behind you, indoors if possible. */
export function lampPlace(p) {
  if (!can.edits(p)) return false;
  for (let i = 0; i < 12; i++) {
    const g = behindOf(p, rand(4, 9), 3);
    const y = groundAt(p.dimension, g.x, g.z, p.location.y);
    if (y === undefined || Math.abs(y - p.location.y) > 3) continue;
    cmd(p.dimension, `setblock ${Math.floor(g.x)} ${y} ${Math.floor(g.z)} hs:hollow_lamp`);
    return true;
  }
  return false;
}

export function strayStatic(p) {
  if (!can.edits(p)) return false;
  for (let i = 0; i < 12; i++) {
    const g = behindOf(p, rand(3, 8), 3);
    const y = groundAt(p.dimension, g.x, g.z, p.location.y);
    if (y === undefined) continue;
    cmd(p.dimension, `setblock ${Math.floor(g.x)} ${y} ${Math.floor(g.z)} hs:static_block`);
    return true;
  }
  return false;
}

const SIGNS = ["DON'T|LOOK UP", "IT IS|WAITING|WHERE YOU|SLEEP", "WE KEPT|YOUR SEAT", "NOT YOURS|ANY MORE"];
export function signPlace(p) {
  if (!can.edits(p)) return false;
  for (let i = 0; i < 12; i++) {
    const g = behindOf(p, rand(5, 10), 3);
    const y = groundAt(p.dimension, g.x, g.z, p.location.y);
    if (y === undefined) continue;
    const x = Math.floor(g.x), z = Math.floor(g.z);
    cmd(p.dimension, `setblock ${x} ${y} ${z} standing_sign`);
    try {
      const block = p.dimension.getBlock({ x, y, z });
      const lines = personal(p) && Math.random() < 0.5 ? [`${p.name}`, "WAS HERE"] : pick(SIGNS).split("|");
      block?.getComponent("minecraft:sign")?.setText(lines.join("\n"));
    } catch (e) {}
    return true;
  }
  return false;
}

/** Adds (never replaces) a renamed paper to an empty slot. */
export function giveYours(p) {
  if (!can.edits(p)) return false;
  const day = world.getDay();
  if (p.getDynamicProperty("hs:yours") === day) return false;
  try {
    const c = p.getComponent("inventory").container;
    if (c.emptySlotsCount < 1) return false;
    const it = new ItemStack("minecraft:paper", 1);
    it.nameTag = "§8Yours?";
    it.setLore(["§8Found in your pocket.", "§8It was not there before.", personal(p) ? `§8It has ${p.name} written on the back.` : "§8There is a name on the back."]);
    c.addItem(it);
    p.setDynamicProperty("hs:yours", day);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- fake world events (chat only)
export function fakeDeath(p) {
  if (!can.spooks(p)) return false;
  p.sendMessage(`${pick(NAMES)} was slain by Hollow`);
  return true;
}
export function fakeJoin(p) {
  if (!can.spooks(p)) return false;
  const n = pick(NAMES);
  p.sendMessage({ rawtext: [{ translate: "multiplayer.player.joined", with: [n] }] });
  return true;
}
export function fakeAdvancement(p) {
  if (!can.spooks(p)) return false;
  p.sendMessage(`${pick(NAMES)} has made the advancement §a[${pick(["Nobody's Home", "Still Counting", "Do Not Turn Around", "Kept"])}]`);
  return true;
}
