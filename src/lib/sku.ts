const COLOR_CODES: Record<string, string> = {
  black: "BLK", white: "WHT", olive: "OLV", "olive green": "OLV", tan: "TAN", "tan leather": "TAN",
  red: "RED", blue: "BLU", navy: "NVY", green: "GRN", grey: "GRY", gray: "GRY", brown: "BRN",
  beige: "BEG", pink: "PNK", purple: "PRP", yellow: "YLW", orange: "ORG", khaki: "KHK", camo: "CMO",
  // Arabic colour names
  "أسود": "BLK", "اسود": "BLK", "أبيض": "WHT", "ابيض": "WHT", "زيتي": "OLV", "أخضر": "GRN", "اخضر": "GRN",
  "أحمر": "RED", "احمر": "RED", "أزرق": "BLU", "ازرق": "BLU", "رمادي": "GRY", "بني": "BRN", "بيج": "BEG", "كحلي": "NVY",
};

const ascii = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

/** Deterministic SKU base, e.g. ("Wrist Wraps","Black") → TRN-WWRAP-BLK, ("Lifting Straps","Tan") → TRN-LSTRAP-TAN. */
export function suggestSkuBase(name: string, variant: string): string {
  const words = ascii(name).filter((w) => !["THE", "AND", "OF", "FOR", "TRN", "FIT"].includes(w));
  let core = "ITEM";
  if (words.length) {
    const last = words[words.length - 1].replace(/S$/, "").slice(0, 5);
    // Use the last two meaningful words, e.g. "Cowhide Leather Lifting Straps" → L + STRAP
    const prefix = words.length > 1 ? words[words.length - 2][0] : "";
    core = (prefix + last).slice(0, 8) || "ITEM";
  }
  const key = variant.trim().toLowerCase();
  let suffix = COLOR_CODES[key] ?? "";
  if (!suffix && key) {
    const first = Object.keys(COLOR_CODES).find((c) => key.startsWith(c + " ") || key.endsWith(" " + c));
    suffix = first ? COLOR_CODES[first] : ascii(variant).join("").slice(0, 3);
  }
  return ["TRN", core, suffix].filter(Boolean).join("-");
}
