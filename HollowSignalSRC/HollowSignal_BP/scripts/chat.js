import { world, system } from "@minecraft/server";
import { can, personal } from "./settings.js";
import { sleep, getPlayer, pick, isDead } from "./util.js";

/**
 * Remembers the last few things a player typed (in memory only, never saved) and may quote one back later.
 * Needs personalization ON. If this game version has no chat event, the feature quietly does nothing.
 */
const MSGS = new Map();

try {
  world.afterEvents.chatSend?.subscribe?.((ev) => {
    const m = ev.message;
    if (!m || m.startsWith("/") || m.length < 4 || m.length > 80) return;
    const arr = MSGS.get(ev.sender.id) ?? [];
    arr.push({ m, t: system.currentTick });
    while (arr.length > 8) arr.shift();
    MSGS.set(ev.sender.id, arr);
  });
} catch (e) {}

export function canQuote(p) {
  const arr = MSGS.get(p.id);
  return personal(p) && can.spooks(p) && !!arr && arr.some((x) => system.currentTick - x.t > 3600);
}

export async function quoteBack(p) {
  if (!canQuote(p)) return false;
  const id = p.id;
  const old = MSGS.get(id).filter((x) => system.currentTick - x.t > 3600);
  const msg = pick(old).m;
  p.sendMessage(`<${p.name}> ${msg}`);
  await sleep(90);
  let q = getPlayer(id);
  if (!q || isDead(q)) return true;
  q.sendMessage("§8you said that. i kept it.");
  await sleep(70);
  q = getPlayer(id);
  if (q) q.sendMessage("§8why did you say that");
  return true;
}
