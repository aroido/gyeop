/** @typedef {"lime" | "blue" | "coral" | "ink" | "violet" | "cream"} OpeningTone */

export const OPENING_TONES = Object.freeze([
  "lime",
  "blue",
  "coral",
  "ink",
  "violet",
  "cream",
]);

const SOURCE_COLORS = Object.freeze({
  shell: "0.035,0.043,0.035,1",
  accent: "0.867,1,0,1",
  shellDark: "0.02,0.025,0.02,1",
  shellLight: "0.06,0.07,0.06,1",
  secondary: "0.192,0.361,1,1",
  card: "0.95,0.965,0.94,1",
  ink: "0.015,0.02,0.015,1",
});

/** @type {Readonly<Record<OpeningTone, Readonly<Record<keyof typeof SOURCE_COLORS, readonly number[]>>>>} */
const PALETTES = Object.freeze({
  lime: {
    shell: [0.035, 0.043, 0.035, 1],
    accent: [0.867, 1, 0, 1],
    shellDark: [0.02, 0.025, 0.02, 1],
    shellLight: [0.06, 0.07, 0.06, 1],
    secondary: [0.192, 0.361, 1, 1],
    card: [0.95, 0.965, 0.94, 1],
    ink: [0.015, 0.02, 0.015, 1],
  },
  blue: {
    shell: [0.192, 0.361, 1, 1],
    accent: [0.867, 1, 0, 1],
    shellDark: [0.035, 0.078, 0.29, 1],
    shellLight: [0.31, 0.43, 1, 1],
    secondary: [0.49, 0.58, 1, 1],
    card: [0.96, 0.97, 1, 1],
    ink: [0.012, 0.025, 0.09, 1],
  },
  coral: {
    shell: [1, 0.302, 0.259, 1],
    accent: [0.02, 0.02, 0.02, 1],
    shellDark: [0.39, 0.063, 0.047, 1],
    shellLight: [1, 0.47, 0.43, 1],
    secondary: [1, 0.91, 0.71, 1],
    card: [1, 0.965, 0.92, 1],
    ink: [0.11, 0.016, 0.012, 1],
  },
  ink: {
    shell: [0.039, 0.039, 0.039, 1],
    accent: [0.867, 1, 0, 1],
    shellDark: [0.01, 0.01, 0.01, 1],
    shellLight: [0.14, 0.14, 0.14, 1],
    secondary: [0.192, 0.361, 1, 1],
    card: [0.95, 0.965, 0.94, 1],
    ink: [0, 0, 0, 1],
  },
  violet: {
    shell: [0.463, 0.329, 1, 1],
    accent: [0.867, 1, 0, 1],
    shellDark: [0.12, 0.067, 0.34, 1],
    shellLight: [0.61, 0.5, 1, 1],
    secondary: [0.76, 0.7, 1, 1],
    card: [0.97, 0.95, 1, 1],
    ink: [0.045, 0.02, 0.15, 1],
  },
  cream: {
    shell: [1, 0.91, 0.71, 1],
    accent: [1, 0.302, 0.259, 1],
    shellDark: [0.43, 0.31, 0.14, 1],
    shellLight: [1, 0.96, 0.84, 1],
    secondary: [0.192, 0.361, 1, 1],
    card: [1, 0.985, 0.94, 1],
    ink: [0.13, 0.078, 0.027, 1],
  },
});

/**
 * @param {unknown} value
 * @returns {OpeningTone}
 */
export function normalizeOpeningTone(value) {
  return typeof value === "string" &&
    OPENING_TONES.includes(/** @type {OpeningTone} */ (value))
    ? /** @type {OpeningTone} */ (value)
    : "lime";
}

/**
 * @param {unknown} recipe
 * @returns {{ mark: string; pattern: "bars" | "grid" | "orbit" | "slash" }}
 */
export function openingPackIdentity(recipe) {
  const normalized =
    typeof recipe === "string" ? recipe.trim().toLowerCase() : "";
  const words = normalized
    .split(/[^a-z0-9]+/)
    .filter((word) => word && word !== "card" && !/^v\d+$/.test(word));
  const mark =
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "GY";
  const hash = [...normalized].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  const patterns = /** @type {const} */ (["bars", "grid", "orbit", "slash"]);
  return { mark, pattern: patterns[hash % patterns.length] };
}

/**
 * Clone the shared Lottie document and replace only its reviewed static fill tokens.
 * @param {unknown} animation
 * @param {unknown} tone
 * @returns {any}
 */
export function themePackOpeningAnimation(animation, tone) {
  const themed = structuredClone(animation);
  const palette = PALETTES[normalizeOpeningTone(tone)];
  const replacements = new Map(
    Object.entries(SOURCE_COLORS).map(([role, source]) => [
      source,
      palette[/** @type {keyof typeof SOURCE_COLORS} */ (role)],
    ]),
  );

  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value.nm === "front-details" && Array.isArray(value.shapes)) {
      value.shapes = value.shapes.filter(
        (shape) => shape.nm !== "brand bars" && shape.nm !== "brand pill",
      );
    }
    if (value.ty === "fl" && Array.isArray(value.c?.k)) {
      const replacement = replacements.get(value.c.k.join(","));
      if (replacement) value.c.k = [...replacement];
    }
    for (const child of Object.values(value)) walk(child);
  }

  walk(themed);
  return themed;
}
