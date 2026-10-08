import { world, system } from "@minecraft/server";
import { can, personal, level } from "./settings.js";
import { getC, addC, tier } from "./corruption.js";
import { placeOf } from "./zones.js";
import { minutesPlayed } from "./state.js";
import {
  SND, play, sleep, rand, randInt, pick, getPlayer, isDead, stopAllSounds, behindOf, cmd, actionBar,
  overworld,
} from "./util.js";

/** Silence first, then the scare: the gap is what makes it work. */
export async function silenceThen(p, fn, ticks = 60) {
  stopAllSounds(p);
  await sleep(ticks);
  const q = getPlayer(p.id);
  if (q && !isDead(q)) await fn(q);
}

/** Footsteps that start far behind you and slowly close the distance. */
export async function approachingSteps(p) {
  if (!can.spooks(p)) return;
  const id = p.id;
  let dist = 22;
  while (dist > 3) {
    const q = getPlayer(id);
    if (!q || isDead(q) || q.hasTag("hs_ward")) return;
    const b = behindOf(q, dist, 0.6);
    let under = "minecraft:stone";
    try {
      under = q.dimension.getBlock({ x: q.location.x, y: q.location.y - 1, z: q.location.z })?.typeId ?? under;
    } catch (e) {}
    const sound = under.includes("grass") || under.includes("dirt") ? "step.grass" : under.includes("sand") ? "step.sand" : "step.stone";
    play(q, sound, { location: { x: b.x, y: q.location.y, z: b.z }, volume: 0.9, pitch: rand(0.85, 1.0) });
    dist -= rand(0.7, 1.5);
    await sleep(randInt(14, 24));
  }
  const q = getPlayer(id);
  if (!q) return;
  stopAllSounds(q);
  await sleep(50);
  const r = getPlayer(id);
  if (!r) return;
  actionBar(r, "§8Do not turn around.");
  play(r, SND.breath, { volume: 0.7 });
}

const FAKE = ["mob.creeper.say", "random.chestopen", "random.door_open", "random.door_close", "mob.zombie.say", "mob.skeleton.say", "mob.spider.say", "random.explode"];
export function fakeSound(p) {
  const b = behindOf(p, randInt(7, 13), 5);
  play(p, pick(FAKE), { location: { x: b.x, y: p.location.y, z: b.z }, volume: 0.9, pitch: rand(0.8, 1.05) });
}

export function rainWithoutRain(p) {
  play(p, "ambient.weather.rain", { volume: 0.6 });
}

// ---------------------------------------------------------------- fog in dark places
const fogged = new Set();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const here = !!placeOf(p.location, p.dimension.id);
    if (here && !fogged.has(p.id)) {
      cmd(p, "fog @s push hs:dread_fog hs_dread");
      fogged.add(p.id);
    } else if (!here && fogged.has(p.id)) {
      cmd(p, "fog @s pop hs_dread");
      fogged.delete(p.id);
    }
  }
}, 40);

// ---------------------------------------------------------------- the world drifts as corruption rises
system.runInterval(() => {
  const dim = overworld();
  for (const p of world.getAllPlayers()) {
    if (!can.spooks(p) || placeOf(p.location, p.dimension.id) || p.dimension.id !== "minecraft:overworld") continue;
    const day = world.getDay();
    const t = world.getTimeOfDay();
    if (tier(p) >= 2 && t > 11200 && t < 12200 && world.getDynamicProperty("hs:driftday") !== day) {
      world.setDynamicProperty("hs:driftday", day);
      cmd(dim, "time add 700"); // the sun sets a little early
    }
    if (tier(p) >= 2 && world.getDynamicProperty("hs:wxday") !== day && Math.random() < 0.02) {
      world.setDynamicProperty("hs:wxday", day);
      cmd(dim, "weather rain 3600");
    }
  }
}, 200);

// ---------------------------------------------------------------- time pressure
const sent = new Map();
const MARKS = [30, 45, 60, 90, 120, 180];
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!can.textual(p)) continue;
    const mins = minutesPlayed(p);
    const done = sent.get(p.id) ?? new Set();
    sent.set(p.id, done);
    for (const m of MARKS) {
      if (mins >= m && !done.has(m)) {
        done.add(m);
        const line = personal(p)
          ? `§8It has been ${m} minutes, ${p.name}. You should have stopped by now.`
          : `§8It has been ${m} minutes. You should have stopped by now.`;
        p.sendMessage(line);
        addC(p, 2);
        break;
      }
    }
  }
}, 1200);
