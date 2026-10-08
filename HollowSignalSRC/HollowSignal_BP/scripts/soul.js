import { world } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { addC } from "./corruption.js";
import { SND, play, sleep, randInt, addEffect, heldItemName, getPlayer, isDead, hp, hurt, shake, stopShake } from "./util.js";

/**
 * THE SOUL IMPOSTOR: a fake player with your exact name joins, types at you, "leaves" as a soul,
 * and then the camera shakes harder, hunger rushes in, and your health drains.
 * Needs personalization AND harm permission (Medium/High, not Quiet). Medium stops at 3 hearts.
 * High can kill. A Ward Charm ends it at any moment.
 */
const active = new Set();
export const soulActive = (p) => active.has(p.id);
export const soulEligible = (p, minutes) => personal(p) && can.harm(p) && minutes >= 8 && !active.has(p.id);

function cleanse(p) {
  stopShake(p);
  for (const fx of ["hunger", "nausea", "darkness", "weakness"]) {
    try {
      p.removeEffect(fx);
    } catch (e) {}
  }
}

function chatLines(p, minutes) {
  const n = p.name, held = heldItemName(p);
  const lines = [
    `hello, ${n}.`,
    "it is very quiet in there, isn't it",
    `i have been standing behind you for ${Math.max(1, minutes)} minutes`,
    `day ${world.getDay()}. you keep counting. why do you keep counting`,
    "i am wearing your name better than you are",
    "do you want to switch",
    "don't turn around",
    "you can stay. i will go outside for you",
  ];
  if (held) lines.splice(3, 0, `you are holding ${held}. it is still warm from my hand`);
  return lines;
}

export async function startSoulEvent(player, minutes = 8) {
  if (active.has(player.id) || !personal(player) || !can.harm(player)) return;
  const id = player.id, name = player.name;
  const lethal = can.lethal(player);
  active.add(id);
  try {
    let p = getPlayer(id);
    if (!p) return;
    addC(p, 5);
    p.setDynamicProperty("hs:souls", (p.getDynamicProperty("hs:souls") ?? 0) + 1);
    p.sendMessage({ rawtext: [{ translate: "multiplayer.player.joined", with: [name] }] });
    play(p, "random.pop", { volume: 0.6, pitch: 0.8 });
    await sleep(randInt(100, 160));
    for (const line of chatLines(p, minutes).slice(0, randInt(4, 6))) {
      p = getPlayer(id);
      if (!p || isDead(p)) return;
      if (p.hasTag("hs_ward")) {
        p.sendMessage("§7The name in the chat goes quiet.");
        return;
      }
      p.sendMessage(`<${name}> ${line}`);
      play(p, SND.whisper, { volume: 0.8 });
      await sleep(randInt(90, 170));
    }
    p = getPlayer(id);
    if (!p || isDead(p)) return;
    p.sendMessage(`§e${name}'s soul left the game`);
    play(p, "mob.endermen.portal", { volume: 0.7, pitch: 0.6 });
    await sleep(60);
    await drain(id, lethal);
  } finally {
    active.delete(id);
  }
}

async function drain(id, lethal) {
  const STEPS = 90; // one step = one second
  for (let i = 0; i <= STEPS + (lethal ? 30 : 0); i++) {
    const p = getPlayer(id);
    if (!p || isDead(p)) return;
    if (p.hasTag("hs_ward") || !can.harm(p)) {
      cleanse(p);
      p.sendMessage("§7The weight lifts. Something wearing your name steps back.");
      return;
    }
    const prog = Math.min(1, i / STEPS);
    shake(p, 0.05 + prog * 1.3, 2.2, "positional");
    addEffect(p, "hunger", 60, Math.floor(10 + prog * 80));
    if (prog > 0.3) addEffect(p, "nausea", 140, 0);
    if (prog > 0.55) addEffect(p, "weakness", 60, 0);
    if (prog > 0.75) addEffect(p, "darkness", 80, 0);
    play(p, SND.heartbeat, { volume: 0.5 + prog * 0.5, pitch: 0.8 + prog * 0.5 });
    if (prog > 0.5 && i % 2 === 0) {
      if (!lethal && hp(p) <= 6) {
        cleanse(p);
        p.sendMessage("§7It lets go. For now.");
        return;
      }
      hurt(p, 1, "starve");
    }
    if (lethal && i > STEPS) hurt(p, 1, "starve");
    await sleep(20);
  }
  const p = getPlayer(id);
  if (p) cleanse(p);
}
