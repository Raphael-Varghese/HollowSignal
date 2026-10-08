import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { hooks, hasAnswered, personal, showSettings, can } from "./settings.js";
import { ZONES, ensureZone, zoneOf, forgetZones, Y0, inRealm } from "./zones.js";
import { getC, setC, tier, TIER_NAMES } from "./corruption.js";
import { getStage, setStage, giveItem, you, returnToOverworld, K_SIGNAL, K_RETURN, isCrowned } from "./state.js";
import { enterRealm, activateFinal, finalLoc } from "./realm.js";
import { SND, play, sleep, cmd, overworld, rand, safeSpawn, addEffect, title, actionBar, getPlayer, safeSound } from "./util.js";

const STAGE_ZONE = { 2: "station", 3: "field", 4: "house", 5: "court" };

// ------------------------------------------------------------------ lore
const ENTRIES = [
  { stage: 1, title: "The Hum", text: "Day one of listening. A note sits under the world like a held breath. I wrote it down: it gets louder the moment I stop.\n\nThere is a white block somewhere nearby that is warm to the touch. The hum is coming from it." },
  { stage: 1, title: "On Charms", text: "A Memory Shard and a gold ingot, crafted together, make a Ward Charm. Use it and the things that stare, follow, or wear your name step back for a minute. It also loosens the dread that sticks to you." },
  { stage: 1, title: "On Lamps", text: "A Hollow Lamp near a bed keeps the bed clean. Four glowstone dust around each side of a shard makes them." },
  { stage: 2, title: "The Station", text: "A platform that was never on any map. The rails end where the roof does. Something small and glitching asked me to follow the light at the far end." },
  { stage: 3, title: "The Field", text: "White ground, grey sky, tall figures that only move when I look away. If I stare, they leave. If I look away too long, they arrive." },
  { stage: 4, title: "The House", text: "A house copied from memory. The copy kept the furniture and forgot the people. There is a hole in the floor that was not on the plans. Look under it." },
  { stage: 5, title: "The Court", text: "The signal is a crown. The crown is a thing that wants to be remembered. Do not let it." },
  { stage: 6, title: "Quiet", text: "It stopped. I keep checking. The hum is gone, and what is left is the sound of me noticing that it is gone.\n\nA door has appeared in the journal's last page. It opens onto somewhere flat." },
  { stage: 7, title: "The Realm", text: "Cobblestone, and squares of grass and flowers kept like pressed leaves. The ground under the surface is bedrock. You can dig down one block and no more. This is where the missing things were filed." },
  { stage: 8, title: "The East", text: "The tablets said there is a door in the east. A very tall dark pillar is the way. Whatever is behind it has been waiting to be read." },
  { stage: 9, title: "The Keeper", text: "It is not a monster. It is the one who started this. It is slow and it does not stop. Ward Charms make it step back." },
  { stage: 10, title: "Reader", text: "I read it all. I left. Somewhere a page is still open. If you hear a hum, that is it, remembering you." },
];

const SIGNAL_LINES = {
  1: (p) => ["§7The block is warm, like something that was held a moment ago.", "§f\"You heard it too.\"", you(p, "§f\"{n}. That is what it called you before it stopped.\"", "§f\"It has a name for you. It will not say it yet.\""), "§7The ground lets go."],
  2: () => ["§7The light in the alcove thins out, one lamp at a time.", "§f\"Past the platform there is a field. Do not stop looking at the tall ones.\"", "§7Static drifts upward like snow in reverse."],
  3: (p) => ["§7The white settles. Something exhales behind you.", "§f\"It built a house from what it remembered. It remembered badly.\"", you(p, "§f\"There is a letter for {n} on the table.\"", "§f\"There is a letter on the table. It is not for the person who wrote it.\"")],
  4: () => ["§7The hum stops. That is worse.", "§f\"It is waiting in the Court. It has worn the crown a long time.\"", "§7The stones under your feet start to count."],
};

// ------------------------------------------------------------------ overworld signal
function placeOverworldSignal(player) {
  const dim = player.dimension;
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), r = rand(32, 58);
    const x = Math.floor(player.location.x + Math.cos(a) * r);
    const z = Math.floor(player.location.z + Math.sin(a) * r);
    let top;
    try {
      top = dim.getTopmostBlock({ x, z });
    } catch (e) {}
    if (!top || top.isLiquid) continue;
    const y = top.location.y;
    cmd(dim, `setblock ${x} ${y} ${z} hs:static_block`);
    cmd(dim, `setblock ${x} ${y + 1} ${z} hs:signal_block`);
    cmd(dim, `fill ${x + 2} ${y + 1} ${z} ${x + 2} ${y + 4} ${z} hs:hollow_stone`);
    cmd(dim, `setblock ${x + 2} ${y + 5} ${z} hs:hollow_lamp`);
    player.setDynamicProperty(K_SIGNAL, JSON.stringify({ x, y: y + 1, z }));
    return true;
  }
  return false;
}

export function startStory(player) {
  if (getStage(player) > 0 || !hasAnswered(player)) return;
  if (player.dimension.id !== "minecraft:overworld" || zoneOf(player.location, player.dimension.id) || inRealm(player.location, player.dimension.id)) {
    system.runTimeout(() => startStory(player), 200);
    return;
  }
  setStage(player, 1);
  giveItem(player, "hs:journal", 1);
  cmd(player.dimension, "gamerule keepinventory true");
  placeOverworldSignal(player);
  safeSound(player, "ambient.cave");
  system.runTimeout(() => {
    player.sendMessage("§7You have a Worn Journal now. Use it to read, find the signal, or change settings.");
    player.sendMessage(you(player, "§8Something low is humming, {n}. Find the white block.", "§8Something low is humming. Find the white block."));
  }, 100);
}

// ------------------------------------------------------------------ signals: right-click OR just walk up (3x3 area around it)
const busy = new Set();

async function activateSignal(player, loc, dim) {
  if (busy.has(player.id)) return;
  const stage = getStage(player);
  if (stage < 1 || stage > 4) return;
  busy.add(player.id);
  const id = player.id;
  try {
    play(player, SND.heartbeat, { volume: 0.7 });
    title(player, "§f§k||||", "", 4, 24, 10);
    for (const line of SIGNAL_LINES[stage](player)) {
      const p = getPlayer(id);
      if (!p) return;
      p.sendMessage(line);
      await sleep(50);
    }
    cmd(dim, `setblock ${loc.x} ${loc.y} ${loc.z} hs:static_block`);
    const p = getPlayer(id);
    if (!p) return;
    giveItem(p, "hs:memory_shard", 1);
    setStage(p, stage + 1);
    await sleep(30);
    await enterZone(p, STAGE_ZONE[stage + 1]);
  } finally {
    busy.delete(id);
  }
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (block.typeId === "hs:signal_block") {
    const stage = getStage(player);
    if (stage === 8) activateFinal(player);
    else activateSignal(player, block.location, block.dimension);
  }
});

function signalTarget(p) {
  const stage = getStage(p);
  if (stage === 1) {
    try {
      return JSON.parse(p.getDynamicProperty(K_SIGNAL));
    } catch (e) {
      return undefined;
    }
  }
  if (stage === 2) return { x: ZONES.station.x + 57, y: Y0, z: ZONES.station.z + 6 };
  if (stage === 3) return { x: ZONES.field.x + 40, y: Y0 + 1, z: ZONES.field.z + 40 };
  if (stage === 4) return { x: ZONES.house.x + 20, y: Y0 - 6, z: ZONES.house.z + 11 };
  if (stage === 8) return finalLoc(p);
  return undefined;
}
// A signal triggers when you stand anywhere within 2 blocks of it (covers the 3x3 square around it, diagonals included).
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== "minecraft:overworld" || busy.has(p.id)) continue;
    const t = signalTarget(p);
    if (!t) continue;
    if (Math.abs(p.location.x - (t.x + 0.5)) <= 2.5 && Math.abs(p.location.z - (t.z + 0.5)) <= 2.5 && Math.abs(p.location.y - t.y) <= 3.5) {
      if (getStage(p) === 8) activateFinal(p);
      else activateSignal(p, t, p.dimension);
    }
  }
}, 4);

// ------------------------------------------------------------------ zones
export async function enterZone(player, key) {
  const id = player.id;
  const z = ZONES[key];
  if (!z) return;
  if (!zoneOf(player.location, player.dimension.id) && !inRealm(player.location, player.dimension.id)) {
    player.setDynamicProperty(K_RETURN, JSON.stringify({ x: player.location.x, y: player.location.y, z: player.location.z, dim: player.dimension.id }));
  }
  let done = false;
  const build = ensureZone(key).then(() => (done = true));
  while (!done) {
    const p = getPlayer(id);
    if (!p) return;
    addEffect(p, "blindness", 60, 0);
    actionBar(p, "§8The ground is remembering...");
    await sleep(20);
  }
  await build;
  const p = getPlayer(id);
  if (!p) return;
  try {
    p.teleport(z.spawn, { dimension: overworld(), facingLocation: z.look });
  } catch (e) {}
  addEffect(p, "resistance", 100, 4);
  await sleep(20);
  title(p, `§f${z.label}`, "", 20, 60, 30);
  play(p, SND.drone, { volume: 0.7 });
  await sleep(60);
  await onZoneEnter(id, key);
}

const countNear = (dim, type, loc, r) => {
  try {
    return dim.getEntities({ type, location: loc, maxDistance: r }).length;
  } catch (e) {
    return 0;
  }
};

async function onZoneEnter(id, key) {
  const dim = overworld();
  const z = ZONES[key];
  const p = getPlayer(id);
  if (!p) return;
  if (key === "station") {
    if (countNear(dim, "hs:echo", z.spawn, 60) === 0) safeSpawn(dim, "hs:echo", { x: z.x + 9.5, y: z.spawn.y, z: z.z + 6.5 });
    p.sendMessage("§8Something small is standing by the rails. It looks like it is waiting to be spoken to.");
  } else if (key === "field") {
    if (countNear(dim, "hs:watcher", z.spawn, 120) < 2) {
      safeSpawn(dim, "hs:watcher", { x: z.x + 62.5, y: z.spawn.y, z: z.z + 22.5 });
      safeSpawn(dim, "hs:watcher", { x: z.x + 62.5, y: z.spawn.y, z: z.z + 58.5 });
    }
    p.sendMessage("§8Do not look away from them for long. Do not look at them for long, either.");
  } else if (key === "house") {
    await sleep(40);
    const q = getPlayer(id);
    if (!q) return;
    await showLetter(q);
    if (countNear(dim, "hs:hollow", { x: z.x + 20, y: z.spawn.y - 7, z: z.z + 18 }, 30) < 2) {
      safeSpawn(dim, "hs:hollow", { x: z.x + 14.5, y: z.spawn.y - 7, z: z.z + 15.5 });
      safeSpawn(dim, "hs:hollow", { x: z.x + 26.5, y: z.spawn.y - 7, z: z.z + 21.5 });
    }
  } else if (key === "court") {
    await sleep(80);
    const q = getPlayer(id);
    if (!q) return;
    if (countNear(dim, "hs:hollow_king", { x: z.x + 30, y: z.spawn.y, z: z.z + 30 }, 80) === 0) {
      safeSpawn(dim, "hs:hollow_king", { x: z.x + 30.5, y: z.spawn.y + 2, z: z.z + 24.5 });
      title(q, "§c§lTHE HOLLOW KING", "§7It remembers a crown", 10, 60, 30);
      play(q, SND.scream, { volume: 0.7 });
    }
  }
}

async function showLetter(player) {
  const body = personal(player)
    ? `${player.name},\n\nI kept the house the way you left it. I did not remember where you kept the people, so I kept the chairs.\n\nDay ${world.getDay()} and still no one has come down to the basement. It is quiet down there. You will like it.\n\nBe kind to the Hollows. They are what happens when I forget a face.\n\n- the one who answers when you say your own name`
    : "To whoever finds this,\n\nI kept the house the way it was. I did not remember where the people went, so I kept the chairs.\n\nIt is quiet in the basement. You will like it.\n\nBe kind to the Hollows. They are what happens when I forget a face.\n\n- the one who answers when called";
  try {
    await new ActionFormData().title("A letter on the table").body(body).button("Put it down").show(player);
  } catch (e) {}
}

// ------------------------------------------------------------------ finale of Act I: a choice
export async function finishStory(player) {
  if (getStage(player) >= 6) return;
  setStage(player, 6);
  const id = player.id;
  title(player, "§f§lIT STOPPED", "", 20, 80, 40);
  play(player, SND.musicbox, { volume: 0.7 });
  await sleep(120);
  let p = getPlayer(id);
  if (!p) return;
  p.sendMessage("§7The hum is gone. A crown lies where the king fell.");
  await sleep(40);
  p = getPlayer(id);
  if (!p) return;
  let take = false;
  try {
    const res = await new ActionFormData()
      .title("The crown")
      .body("It is lighter than it looks. It is very quiet.\n\nLeave it, and the world goes back to how it was.\nTake it, and the world will not.")
      .button("Leave it where it is")
      .button("Take the crown")
      .show(p);
    take = !res.canceled && res.selection === 1;
  } catch (e) {}
  p = getPlayer(id);
  if (!p) return;
  if (take) {
    p.setDynamicProperty("hs:crowned", true);
    setC(p, 100);
    p.sendMessage(you(p, "§8You wear it well, {n}. It fits like it was waiting.", "§8It fits like it was waiting."));
    addEffect(p, "strength", 1200, 0);
  } else {
    p.setDynamicProperty("hs:crowned", false);
    setC(p, 10);
    p.sendMessage(you(p, "§8Thank you for remembering, {n}.", "§8Thank you for remembering."));
  }
  giveItem(p, "hs:ward_charm", 3);
  giveItem(p, "minecraft:totem_of_undying", 1);
  await sleep(60);
  p = getPlayer(id);
  if (!p) return;
  p.sendMessage("§7A door has opened on the last page of your journal.");
  await sleep(100);
  p = getPlayer(id);
  if (p) returnToOverworld(p);
}

// crowned players are strong, and everything is closer
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (isCrowned(p) && getStage(p) >= 6) addEffect(p, "strength", 500, 0);
  }
}, 400);

// ------------------------------------------------------------------ journal
function dirText(p, t) {
  const dx = t.x - p.location.x, dz = t.z - p.location.z;
  const d = Math.round(Math.hypot(dx, dz));
  const ang = (Math.atan2(dz, dx) * 180) / Math.PI;
  const dirs = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  return `about ${d} blocks to the ${dirs[((Math.round(ang / 45) % 8) + 8) % 8]}`;
}

function signalHint(p) {
  const stage = getStage(p);
  if (stage === 1) {
    const t = signalTarget(p);
    return t ? `A tall dark pillar with a pale lamp marks the signal, next to a white glowing block.\nIt is ${dirText(p, t)}. Walking within two blocks is enough.` : "The signal has not shown itself. Walk a while.";
  }
  if (stage === 2) return "The signal is at the far end of the station, in the alcove behind the last pillar.";
  if (stage === 3) return "The signal is in the center of the field, inside a ring of lamps.";
  if (stage === 4) return "The signal is under the floor. Find the hole.";
  if (stage === 5) return "There is no signal left. There is a king.";
  if (stage === 6) return "Quiet. A door is open on the last page.";
  if (stage === 7) return `Read the tablets in the Realm. Tablets read: ${Math.min(7, p.getDynamicProperty("hs:tablets") ?? 0)}/7. Walking up to one is enough.`;
  if (stage === 8) {
    const t = finalLoc(p);
    return t ? `The final signal stands at the foot of a very tall dark pillar, ${dirText(p, t)}.` : "Something to the east has opened its eyes.";
  }
  if (stage === 9) return "Survive. Ward Charms make it step back.";
  if (stage >= 10) return "Quiet.";
  return "Nothing yet.";
}

export async function openJournal(player) {
  const stage = getStage(player);
  const body = `Progress: ${Math.min(stage, 10)}/10\nDread: ${TIER_NAMES[tier(player)]}${isCrowned(player) ? "\n§8You are wearing the crown.§r" : ""}\n\n${signalHint(player)}`;
  const form = new ActionFormData().title("Worn Journal").body(body)
    .button("Read entries")
    .button("Follow the signal (go to current area)")
    .button(stage >= 6 ? "Open the Door (the Hollow Realm)" : "The Door (locked)")
    .button("Return to the overworld")
    .button("Settings")
    .button("Close");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: {
      const shown = ENTRIES.filter((e) => e.stage <= stage);
      const text = shown.length ? shown.map((e) => `§l${e.title}§r\n${e.text}`).join("\n\n") : "The pages are blank.";
      await new ActionFormData().title("Entries").body(text).button("Close").show(player);
      break;
    }
    case 1: {
      const key = STAGE_ZONE[stage];
      if (key) enterZone(player, key);
      else if (stage >= 7 && stage <= 9) enterRealm(player);
      else player.sendMessage("§7There is nowhere to follow yet.");
      break;
    }
    case 2:
      if (stage >= 6) enterRealm(player);
      else player.sendMessage("§8Not yet.");
      break;
    case 3:
      returnToOverworld(player);
      break;
    case 4:
      showSettings(player);
      break;
  }
}

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId === "hs:journal" && source.typeId === "minecraft:player") openJournal(source);
});

// ------------------------------------------------------------------ hooks and test events
hooks.onAnswered = (p) => system.runTimeout(() => startStory(p), 100);
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn && hasAnswered(player) && getStage(player) === 0) system.runTimeout(() => startStory(player), 200);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  if (!p || p.typeId !== "minecraft:player") return;
  if (ev.id === "hs:journal") giveItem(p, "hs:journal", 1);
  if (ev.id === "hs:stage") {
    const n = parseInt(ev.message, 10);
    if (n >= 1 && n <= 10) {
      setStage(p, n);
      if (STAGE_ZONE[n]) enterZone(p, STAGE_ZONE[n]);
      else if (n >= 7) enterRealm(p);
      p.sendMessage(`§7Stage set to ${n}.`);
    }
  }
  if (ev.id === "hs:realm") {
    if (getStage(p) < 6) setStage(p, 6);
    enterRealm(p);
  }
  if (ev.id === "hs:reset") {
    setStage(p, 0);
    p.setDynamicProperty("hs:tablets", 0);
    setC(p, 0);
    forgetZones();
    p.sendMessage("§7Story reset. Zones will be rebuilt on next visit.");
    startStory(p);
  }
});
