import { world, ItemStack } from "@minecraft/server";
import { personal } from "./settings.js";
import { addEffect, overworld } from "./util.js";

export const K_STAGE = "hs:stage";
export const K_SIGNAL = "hs:signal";
export const K_RETURN = "hs:return";

/* 0 not started | 1 find signal | 2 Station | 3 Field | 4 House | 5 Court | 6 done (door open)
   7 Realm: read tablets | 8 final signal | 9 the Keeper | 10 finished */
export const getStage = (p) => {
  const v = p.getDynamicProperty(K_STAGE);
  return typeof v === "number" ? v : 0;
};
export const setStage = (p, n) => p.setDynamicProperty(K_STAGE, n);
export const isCrowned = (p) => p.getDynamicProperty("hs:crowned") === true;

export function giveItem(player, id, count = 1) {
  try {
    const left = player.getComponent("inventory").container.addItem(new ItemStack(id, count));
    if (left) player.dimension.spawnItem(left, player.location);
  } catch (e) {}
}

/** Text that uses the player's name only if they enabled personalization. {n} is replaced. */
export const you = (p, withName, generic) => (personal(p) ? withName.replaceAll("{n}", p.name) : generic);

export function returnToOverworld(player) {
  let target;
  try {
    target = JSON.parse(player.getDynamicProperty(K_RETURN));
  } catch (e) {}
  try {
    if (target) {
      player.teleport({ x: target.x, y: target.y + 1, z: target.z }, { dimension: world.getDimension(target.dim.replace("minecraft:", "")) });
    } else {
      player.teleport(world.getDefaultSpawnLocation(), { dimension: overworld() });
    }
    addEffect(player, "resistance", 100, 4);
  } catch (e) {}
}

// ------------------------------------------------------------------ session clock
import { system } from "@minecraft/server";
const joined = new Map();
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) joined.set(player.id, system.currentTick);
});
export const minutesPlayed = (p) => Math.floor((system.currentTick - (joined.get(p.id) ?? system.currentTick)) / 1200);
