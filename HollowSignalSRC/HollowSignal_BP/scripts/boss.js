import { world, system } from "@minecraft/server";
import { overworld, dist3, safeSpawn, safeSound, addEffect, title, pick } from "./util.js";
import { finishStory } from "./story.js";
import { getStage } from "./state.js";

/** The Hollow King: every few seconds it picks a pattern. Under 40% health it enrages. */
const TIMERS = new Map();

function healthFrac(e) {
  try {
    const h = e.getComponent("health");
    return h.currentValue / (h.effectiveMax || h.defaultValue || 1);
  } catch (e2) {
    return 1;
  }
}

function summonHollows(dim, king) {
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2;
    safeSpawn(dim, "hs:hollow", { x: king.location.x + Math.cos(a) * 4, y: king.location.y, z: king.location.z + Math.sin(a) * 4 });
  }
}

system.runInterval(() => {
  const dim = overworld();
  let kings = [];
  try {
    kings = dim.getEntities({ type: "hs:hollow_king" });
  } catch (e) {}
  const seen = new Set();
  for (const king of kings) {
    seen.add(king.id);
    const t = (TIMERS.get(king.id) ?? 0) + 1;
    TIMERS.set(king.id, t);
    const enraged = healthFrac(king) < 0.4;
    if (enraged) {
      try {
        king.addEffect("speed", 40, { amplifier: 1, showParticles: false });
      } catch (e) {}
    }
    const every = enraged ? 4 : 6;
    if (t % every !== 0) continue;
    const players = dim.getPlayers({ location: king.location, maxDistance: 48 });
    if (!players.length) continue;
    const move = pick(["summon", "blind", "slow", "static"]);
    for (const p of players) {
      if (move === "blind") {
        addEffect(p, "blindness", 60, 0);
        safeSound(p, "mob.elderguardian.curse", { volume: 0.6, pitch: 0.7 });
      } else if (move === "slow") {
        addEffect(p, "slowness", 100, 1);
        addEffect(p, "weakness", 100, 0);
      } else if (move === "static") {
        title(p, "§f§k#####", "", 2, 12, 8);
        addEffect(p, "nausea", 100, 0);
        try {
          p.applyDamage(2);
        } catch (e) {}
      }
    }
    if (move === "summon") summonHollows(dim, king);
  }
  for (const id of TIMERS.keys()) if (!seen.has(id)) TIMERS.delete(id);
}, 20);

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== "hs:hollow_king") return;
  let loc = { x: 3630, y: 200, z: 3030 };
  try {
    loc = deadEntity.location;
  } catch (e) {}
  for (const p of overworld().getPlayers({ location: loc, maxDistance: 90 })) {
    if (getStage(p) >= 5) finishStory(p);
  }
});
  
