import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";

const K_ASKED = "hs:asked";
const K_PERS = "hs:personalize";
const K_LEVEL = "hs:level";
const K_QUIET = "hs:quiet";

export const LEVEL_NAMES = [
  "Classroom-safe: atmosphere only, no scares or harm",
  "Low: subtle scares and text, no jumpscares",
  "Medium: jumpscares and strange events, nothing that hurts you",
  "High: full horror, events can hurt or kill you",
];

/** story.js sets hooks.onAnswered so settings.js does not need to import it. */
export const hooks = { onAnswered: null };

export const hasAnswered = (p) => p.getDynamicProperty(K_ASKED) === true;
export function level(p) {
  const v = p.getDynamicProperty(K_LEVEL);
  return typeof v === "number" ? Math.max(0, Math.min(3, v)) : 0;
}
export const quiet = (p) => p.getDynamicProperty(K_QUIET) === true;
/** Personalization only ever applies above classroom-safe. */
export const personal = (p) => p.getDynamicProperty(K_PERS) === true && level(p) >= 1;

/** What a player has agreed to. Every scripted scare checks one of these first. */
export const can = {
  textual: (p) => level(p) >= 1,
  spooks: (p) => level(p) >= 2,
  jumps: (p) => level(p) >= 2 && !quiet(p),
  shake: (p) => level(p) >= 2 && !quiet(p),
  harm: (p) => level(p) >= 2 && !quiet(p),
  heavy: (p) => level(p) >= 3 && !quiet(p),
  lethal: (p) => level(p) >= 3 && !quiet(p),
  edits: (p) => level(p) >= 3 && !quiet(p),
};

function save(p, pers, lvl, q) {
  p.setDynamicProperty(K_ASKED, true);
  p.setDynamicProperty(K_PERS, pers);
  p.setDynamicProperty(K_LEVEL, lvl);
  p.setDynamicProperty(K_QUIET, q);
}

const DISCLAIMER =
  "§lHOLLOW SIGNAL§r\n\n" +
  "This add-on is a psychological horror story with unsettling text and sounds, dark places, jumpscares and scripted events. Do not play it if that is not for you.\n\n" +
  "§lYOU CHOOSE HOW FAR IT GOES§r\n" +
  "Classroom-safe: atmosphere only.\nLow: subtle scares.\nMedium: jumpscares and strange events.\nHigh: events can hurt or kill you and may change blocks near you (keep-inventory is switched on).\n" +
  "§lQuiet mode§r removes jumpscares, camera shake and anything that harms you, at any level.\n\n" +
  "§lPERSONALIZATION (optional)§r\n" +
  "If enabled, some lines use things the game already knows: your player name, the in-game day, the item you hold, and the last few things you typed in chat (kept only in memory, never saved).\n\n" +
  "It §lcannot§r read your computer, files or accounts. Nothing leaves Minecraft.\n\n" +
  "Submitting the next screen without changing anything gives the safest setting. Reopen it any time from the Worn Journal or /scriptevent hs:settings";

export async function showDisclaimer(player, attempt = 0) {
  const res = await new ActionFormData()
    .title("Before you begin")
    .body(DISCLAIMER)
    .button("Continue to settings")
    .button("Skip (safest settings)")
    .show(player);
  if (res.canceled) {
    if (res.cancelationReason === FormCancelationReason.UserBusy && attempt < 12) {
      system.runTimeout(() => showDisclaimer(player, attempt + 1), 100);
      return;
    }
    save(player, false, 0, true);
    player.sendMessage("§7Safest settings applied. Open the journal to change them.");
    hooks.onAnswered?.(player);
    return;
  }
  if (res.selection === 1) {
    save(player, false, 0, true);
    player.sendMessage("§7Safest settings applied: classroom-safe, quiet mode on, personalization off.");
    hooks.onAnswered?.(player);
    return;
  }
  await showSettings(player, true);
}

export async function showSettings(player, first = false, attempt = 0) {
  const res = await new ModalFormData()
    .title("Hollow Signal - Settings")
    .toggle(`Personalization (now ${personal(player) ? "ON" : "OFF"})\nUses your player name and in-game info only`)
    .dropdown(`Intensity (now: ${LEVEL_NAMES[level(player)]})`, LEVEL_NAMES)
    .toggle(`Quiet mode (now ${quiet(player) ? "ON" : "OFF"})\nNo jumpscares, shaking or harm at any intensity`)
    .show(player);
  if (res.canceled) {
    if (res.cancelationReason === FormCancelationReason.UserBusy && attempt < 12) {
      system.runTimeout(() => showSettings(player, first, attempt + 1), 100);
      return;
    }
    if (first) {
      save(player, false, 0, true);
      hooks.onAnswered?.(player);
    }
    return;
  }
  const [pers, lvl, q] = res.formValues;
  const L = typeof lvl === "number" ? lvl : 0;
  save(player, pers === true && L >= 1, L, q === true);
  player.sendMessage(`§7Saved. Intensity: ${LEVEL_NAMES[L]}. Personalization: ${personal(player) ? "ON" : "OFF"}. Quiet mode: ${q ? "ON" : "OFF"}.`);
  if (first) hooks.onAnswered?.(player);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn && !hasAnswered(player)) system.runTimeout(() => showDisclaimer(player), 120);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "hs:settings" && ev.sourceEntity?.typeId === "minecraft:player") showSettings(ev.sourceEntity);
});
