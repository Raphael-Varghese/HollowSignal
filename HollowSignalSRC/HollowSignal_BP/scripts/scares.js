import { world, system } from "@minecraft/server";
import { hasAnswered, can, personal, level } from "./settings.js";
import { getC, addC, tier } from "./corruption.js";
import { getStage, minutesPlayed, isCrowned } from "./state.js";
import { placeOf } from "./zones.js";
import { soulActive, soulEligible, startSoulEvent } from "./soul.js";
import { jumpscare, availableKinds } from "./jumpscare.js";
import { silenceThen, approachingSteps, fakeSound, rainWithoutRain } from "./atmosphere.js";
import { quoteBack, canQuote } from "./chat.js";
import { doorOpen, torchRemove, lampPlace, strayStatic, signPlace, giveYours, fakeDeath, fakeJoin, fakeAdvancement } from "./tamper.js";
import { spawnWatcher } from "./watcher.js";
import { spawnKeeper, keeperNear } from "./creatures.js";
import { SND, play, randInt, pick, rand, behindOf, groundAt, safeSpawn, heldItemName, title, actionBar, flashWord, shake } from "./util.js";

/** Gap between scares, in ticks (20 per second), by intensity level. */
const GAPS = [[12000, 24000], [8000, 16000], [4000, 9000], [2000, 6000]];
const next = new Map();
const lastKeeper = new Map();

// ---------------------------------------------------------------- lines
function personalLine(p) {
  const n = p.name, held = heldItemName(p);
  const L = [`${n}.`, `Day ${world.getDay()}. You are still here, ${n}.`, `It remembers you, ${n}.`, `Do not look behind you, ${n}.`];
  if (held) L.push(`Put the ${held} down, ${n}. You will not need it.`);
  return `§8${pick(L)}`;
}
const genericLine = () => pick(["§8Someone is still here.", "§8It is listening.", "§8Do not look behind you.", "§8The hum is closer than before."]);

// ---------------------------------------------------------------- scare menu
function ambient(p) {
  const b = behindOf(p, 6, 1);
  play(p, pick(["ambient.cave", "random.door_open", "random.door_close", "mob.ghast.moan", "mob.endermen.idle"]), { location: { x: b.x, y: p.location.y, z: b.z }, volume: 0.7, pitch: rand(0.6, 0.9) });
}
function whisperLine(p) {
  actionBar(p, personal(p) ? personalLine(p) : genericLine());
  play(p, SND.whisper, { volume: 0.7 });
}
function fakeLeave(p) {
  const name = p.name, id = p.id;
  p.sendMessage({ rawtext: [{ translate: "multiplayer.player.left", with: [name] }] });
  system.runTimeout(() => {
    const q = world.getAllPlayers().find((x) => x.id === id);
    if (q) q.sendMessage({ rawtext: [{ translate: "multiplayer.player.joined", with: [name] }] });
  }, 140);
}
function glitchTitle(p) {
  title(p, "§f§k#########", personal(p) ? `§8${p.name}` : "", 2, 14, 10);
  play(p, SND.glitch);
}
function brief(p) {
  flashWord(p, pick(["§8BEHIND", "§8LOOK", "§8STILL HERE", personal(p) ? `§8${p.name}` : "§8YOU"]));
  shake(p, 0.6, 0.4, "positional");
}
function mimicSpawn(p) {
  const e = behindOf(p, rand(9, 14), 4);
  const y = groundAt(p.dimension, e.x, e.z, p.location.y);
  if (y !== undefined) safeSpawn(p.dimension, "hs:mimic", { x: e.x, y, z: e.z });
}
function lurkerSpawn(p) {
  const e = behindOf(p, rand(18, 26), 5);
  const y = groundAt(p.dimension, e.x, e.z, p.location.y);
  if (y !== undefined) safeSpawn(p.dimension, "hs:lurker", { x: e.x, y, z: e.z });
}
function stalker(p) {
  const e = behindOf(p, 22, 4);
  const y = groundAt(p.dimension, e.x, e.z, p.location.y);
  if (y !== undefined) safeSpawn(p.dimension, pick(["hs:hollow", "hs:crawler"]), { x: e.x, y, z: e.z });
}

function menu(p) {
  const m = [[ambient, 3], [rainWithoutRain, 1]];
  if (can.textual(p)) m.push([whisperLine, 3]);
  if (can.spooks(p)) {
    m.push([fakeSound, 3], [approachingSteps, 2], [glitchTitle, 1], [fakeDeath, 1], [fakeJoin, 1], [fakeAdvancement, 1],
      [(q) => spawnWatcher(q, pick(["behind", "edge", "far", "window"])), 3], [mimicSpawn, 2], [stalker, 2]);
    if (personal(p)) m.push([fakeLeave, 2]);
    if (canQuote(p)) m.push([quoteBack, 3]);
  }
  if (can.jumps(p)) {
    m.push([(q) => jumpscare(q), 3], [(q) => silenceThen(q, (r) => jumpscare(r), randInt(50, 90)), 4], [brief, 2]);
  }
  if (can.heavy(p)) {
    m.push([lurkerSpawn, 2], [doorOpen, 2], [torchRemove, 2], [lampPlace, 1], [strayStatic, 2], [signPlace, 1], [giveYours, 1]);
    if (tier(p) >= 2) m.push([strayStatic, 3], [doorOpen, 2]);
  }
  return m;
}
function pickWeighted(m) {
  const total = m.reduce((a, x) => a + x[1], 0);
  let r = Math.random() * total;
  for (const [fn, w] of m) {
    r -= w;
    if (r <= 0) return fn;
  }
  return m[0][0];
}

function schedule(p) {
  const [a, b] = GAPS[level(p)] ?? GAPS[0];
  let mult = Math.max(0.35, 1 - getC(p) / 140);
  if (placeOf(p.location, p.dimension.id)) mult *= 0.5;
  if (isCrowned(p)) mult *= 0.5;
  next.set(p.id, system.currentTick + randInt(a, b) * mult);
}

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!hasAnswered(p) || getStage(p) < 1 || p.hasTag("hs_ward") || soulActive(p)) continue;
    if (!next.has(p.id)) schedule(p);
    if (system.currentTick < next.get(p.id)) continue;
    schedule(p);
    addC(p, 0.5);

    // The Keeper: rare, only on High, once enough dread has built up
    if (can.heavy(p) && getStage(p) >= 3 && (tier(p) >= 2 || isCrowned(p)) && !keeperNear(p.dimension, p.location) &&
        system.currentTick - (lastKeeper.get(p.id) ?? -99999) > 30000 && Math.random() < 0.3) {
      lastKeeper.set(p.id, system.currentTick);
      spawnKeeper(p);
      continue;
    }
    // The Soul Impostor gets its own roll (once per in-game day at most)
    const day = world.getDay();
    if (getStage(p) >= 2 && soulEligible(p, minutesPlayed(p)) && Math.random() < 0.2 + getC(p) / 300 && p.getDynamicProperty("hs:soulday") !== day) {
      p.setDynamicProperty("hs:soulday", day);
      startSoulEvent(p, minutesPlayed(p));
      continue;
    }
    try {
      pickWeighted(menu(p))(p);
    } catch (e) {}
  }
}, 40);

// manual testing: /scriptevent hs:soul   |   /scriptevent hs:scare [kind]
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  if (p?.typeId !== "minecraft:player") return;
  if (ev.id === "hs:soul") startSoulEvent(p, minutesPlayed(p));
  if (ev.id === "hs:scare") {
    const kinds = availableKinds(p);
    if (!kinds.length) p.sendMessage("§7Your settings do not allow jumpscares (needs Medium+ and Quiet mode off).");
    else jumpscare(p, ev.message || undefined);
  }
});
