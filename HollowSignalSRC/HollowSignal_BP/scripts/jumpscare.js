import { system } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { addC } from "./corruption.js";
import { SND, play, shake, title, addEffect, safeSpawn, sleep, getPlayer, pick, rand, stopAllSounds, behindOf, groundAt, flashWord } from "./util.js";

/**
 * Jumpscares. Every kind checks what the player agreed to:
 *   stinger, static, name, lights : need can.jumps  (Medium or High, not Quiet)
 *   face, behind                  : need can.heavy  (High, not Quiet)
 * Sounds come from sound_definitions.json (hs.scare.*). Replace the .ogg files with your own.
 */

function faceInFront(p) {
  const head = p.getHeadLocation();
  const v = p.getViewDirection();
  const loc = { x: head.x + v.x * 1.9, y: head.y + v.y * 1.9, z: head.z + v.z * 1.9 };
  const e = safeSpawn(p.dimension, "hs:scare_face", loc);
  if (!e) return;
  try {
    e.teleport(loc, { facingLocation: head });
  } catch (err) {}
  system.runTimeout(() => {
    try {
      e.remove();
    } catch (err) {}
  }, 14);
}

const KINDS = {
  async stinger(p) {
    play(p, SND.stinger);
    title(p, "§f§k#####", "", 0, 6, 6);
    addEffect(p, "blindness", 8, 0);
  },
  async static(p) {
    play(p, SND.static);
    title(p, "§7§k##########################", "", 0, 22, 8);
    await sleep(8);
    play(p, SND.glitch);
  },
  async name(p) {
    play(p, SND.stinger);
    flashWord(p, personal(p) ? `§c§l${p.name.toUpperCase()}` : "§c§lLOOK");
    addEffect(p, "blindness", 6, 0);
  },
  async lights(p) {
    play(p, SND.heartbeat);
    for (let i = 0; i < 3; i++) {
      const q = getPlayer(p.id);
      if (!q) return;
      addEffect(q, "blindness", 6, 0);
      await sleep(8);
    }
    const q = getPlayer(p.id);
    if (!q) return;
    addEffect(q, "darkness", 60, 0);
    play(q, SND.stinger, { volume: 0.8 });
  },
  async face(p) {
    faceInFront(p);
    play(p, SND.scream);
    shake(p, 2.4, 0.8, "rotational");
    await sleep(6);
    const q = getPlayer(p.id);
    if (q) {
      addEffect(q, "blindness", 10, 0);
      title(q, "§c§k||||||", "", 0, 5, 4);
    }
  },
  async behind(p) {
    const b = behindOf(p, 2, 0.5);
    play(p, SND.breath, { location: { x: b.x, y: p.location.y + 1, z: b.z }, volume: 1.0 });
    await sleep(55);
    const q = getPlayer(p.id);
    if (!q) return;
    stopAllSounds(q);
    await sleep(35);
    const r = getPlayer(p.id);
    if (!r) return;
    play(r, SND.stinger);
    shake(r, 1.8, 0.6, "positional");
    const g = behindOf(r, 3, 0.5);
    const y = groundAt(r.dimension, g.x, g.z, r.location.y);
    if (y !== undefined) safeSpawn(r.dimension, "hs:watcher", { x: g.x, y, z: g.z });
  },
};

export function availableKinds(p) {
  const k = [];
  if (can.jumps(p)) k.push("stinger", "static", "lights");
  if (can.jumps(p) && personal(p)) k.push("name");
  if (can.heavy(p)) k.push("face", "behind");
  return k;
}

export async function jumpscare(p, kind) {
  const avail = availableKinds(p);
  if (!avail.length) return false;
  const k = kind && avail.includes(kind) ? kind : pick(avail);
  addC(p, 1);
  await KINDS[k](p);
  return true;
}
