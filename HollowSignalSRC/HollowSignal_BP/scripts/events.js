import { world, system } from "@minecraft/server";
import { hasAnswered, personal, can, level } from "./settings.js";
import { getC, addC, setC, tier } from "./corruption.js";
import { getStage, minutesPlayed } from "./state.js";
import { soulActive } from "./soul.js";
import { placeOf } from "./zones.js";
import { SND, play, safeSpawn, groundAt, behindOf, actionBar, rand, pick } from "./util.js";
import { spawnWatcher } from "./watcher.js";
import { jumpscare } from "./jumpscare.js";

/**
 * Trigger-based events. Each respects the player's settings via `can.*`; lines that use a name need personalization.
 */
const cooldowns = new Map();
function ready(player, key, ticks) {
  const k = `${player.id}:${key}`;
  const last = cooldowns.get(k) ?? -Infinity;
  if (system.currentTick - last < ticks) return false;
  cooldowns.set(k, system.currentTick);
  return true;
}
const active = (p) => hasAnswered(p) && getStage(p) >= 1;
const nameOr = (p, a, b) => (personal(p) ? a.replaceAll("{n}", p.name) : b);

// ------------------------------------------------------------------ Ward Charm
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== "hs:ward_charm" || source.typeId !== "minecraft:player") return;
  const p = source;
  if (p.hasTag("hs_ward")) {
    p.sendMessage("§7The charm is already warm.");
    return;
  }
  try {
    const inv = p.getComponent("inventory").container;
    const slot = p.selectedSlotIndex;
    const it = inv.getItem(slot);
    if (it) {
      if (it.amount > 1) {
        it.amount -= 1;
        inv.setItem(slot, it);
      } else inv.setItem(slot, undefined);
    }
  } catch (e) {}
  p.addTag("hs_ward");
  addC(p, -10);
  p.sendMessage("§7The charm burns down. Things that stare, follow or wear your name step back for a minute.");
  play(p, "random.orb", { volume: 0.8, pitch: 0.6 });
  system.runTimeout(() => {
    try {
      p.removeTag("hs_ward");
      p.sendMessage("§8The charm is ash.");
    } catch (e) {}
  }, 1200);
});

// ------------------------------------------------------------------ death & return
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== "minecraft:player") return;
  const p = deadEntity;
  try {
    p.setDynamicProperty("hs:deaths", (p.getDynamicProperty("hs:deaths") ?? 0) + 1);
    if (soulActive(p)) p.setDynamicProperty("hs:soulkill", true);
  } catch (e) {}
});
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn || !active(player) || !can.textual(player)) return;
  system.runTimeout(() => {
    const n = player.getDynamicProperty("hs:deaths") ?? 1;
    if (player.getDynamicProperty("hs:soulkill") === true) {
      player.setDynamicProperty("hs:soulkill", false);
      player.sendMessage(nameOr(player, "§8<{n}> you rejoined. so did i.", "§8Something rejoined with you."));
      return;
    }
    player.sendMessage(nameOr(player, `§8Welcome back, {n}. That is ${n === 1 ? "the first time" : "time number " + n}.`, "§8Welcome back."));
  }, 60);
});

// ------------------------------------------------------------------ interacting with blocks
const safeFromBed = (p, bed) => {
  // a Hollow Lamp near a bed keeps it clean
  for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) {
    try {
      if (p.dimension.getBlock({ x: bed.x + dx, y: bed.y + dy, z: bed.z + dz })?.typeId === "hs:hollow_lamp") return true;
    } catch (e) {}
  }
  return false;
};

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (!active(player) || !can.spooks(player)) return;
  const id = block.typeId;
  if (id === "minecraft:bed" && ready(player, "bed", 2400)) {
    if (safeFromBed(player, block.location)) {
      actionBar(player, "§7The lamp keeps it away.");
      return;
    }
    addC(player, 3);
    play(player, SND.heartbeat, { volume: 0.7 });
    actionBar(player, nameOr(player, "§8You are not alone in the dark, {n}.", "§8You are not alone in the dark."));
    if (can.heavy(player)) {
      // sleep penalty: the world gets a little worse each time you rest here
      player.setDynamicProperty("hs:sleeps", (player.getDynamicProperty("hs:sleeps") ?? 0) + 1);
      system.runTimeout(() => spawnWatcher(player, "edge"), 200);
    }
    return;
  }
  if ((id === "minecraft:chest" || id === "minecraft:trapped_chest" || id === "minecraft:barrel") && Math.random() < 0.07 && ready(player, "chest", 3600)) {
    play(player, "random.door_close", { volume: 0.6, pitch: 0.7 });
    actionBar(player, "§8Someone has already looked in here.");
  }
});

// ------------------------------------------------------------------ low health, deep underground, tenth dawn
const deepSince = new Map();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!active(p) || soulActive(p)) continue;
    const inPlace = !!placeOf(p.location, p.dimension.id);
    try {
      const h = p.getComponent("health").currentValue;
      if (can.textual(p) && h > 0 && h <= 6 && ready(p, "lowhp", 12000)) {
        play(p, SND.heartbeat, { volume: 0.7 });
        actionBar(p, nameOr(p, "§8Almost, {n}.", "§8Almost."));
      }
    } catch (e) {}
    if (!inPlace && p.dimension.id === "minecraft:overworld" && p.location.y < -30) {
      const since = deepSince.get(p.id) ?? system.currentTick;
      deepSince.set(p.id, since);
      if (system.currentTick - since > 1200 && can.spooks(p) && ready(p, "deep", 9000)) {
        actionBar(p, nameOr(p, "§8You are very far from the surface, {n}.", "§8You are very far from the surface."));
        play(p, SND.drone, { volume: 1.0 });
        if (can.heavy(p)) spawnWatcher(p, "behind");
      }
    } else deepSince.delete(p.id);
    try {
      const day = world.getDay();
      if (can.textual(p) && day > 0 && day % 10 === 0 && world.getTimeOfDay() < 1500 && p.getDynamicProperty("hs:lastday") !== day) {
        p.setDynamicProperty("hs:lastday", day);
        actionBar(p, nameOr(p, `§8Day ${day}. {n} is still counting.`, `§8Day ${day}. Still counting?`));
      }
    } catch (e) {}
    // corruption drifts up in strange places and slowly settles in daylight
    if (system.currentTick % 1200 < 100) {
      if (inPlace) addC(p, 1);
      else if (getC(p) > 0 && world.getTimeOfDay() < 12000 && p.dimension.id === "minecraft:overworld") addC(p, -0.3);
    }
  }
}, 100);
