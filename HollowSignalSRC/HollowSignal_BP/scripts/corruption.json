/** A 0-100 meter per player. It rises with scares, sleep and strange places, and falls with Ward Charms. */
const K = "hs:corruption";
export const getC = (p) => {
  const v = p.getDynamicProperty(K);
  return typeof v === "number" ? v : 0;
};
export const setC = (p, n) => p.setDynamicProperty(K, Math.max(0, Math.min(100, n)));
export const addC = (p, n) => setC(p, getC(p) + n);
/** 0 quiet, 1 uneasy, 2 wrong, 3 failing */
export function tier(p) {
  const c = getC(p);
  return c < 20 ? 0 : c < 45 ? 1 : c < 70 ? 2 : 3;
}
export const TIER_NAMES = ["quiet", "uneasy", "wrong", "failing"];
