import { FOOD_DB, GENERIC_UNIT_GRAMS, type FoodEntry, type Macros } from "../data/foodDb.js";
import {
  enrichmentEnabled,
  estimateUnmatchedItems,
  type UnmatchedEstimator,
} from "../enrich.js";

export interface MacroItem {
  item: string;
  matched_food: string;
  quantity_assumed: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/** A response item once AI enrichment is active: DB-matched or AI-estimated. */
export interface EnrichedMacroItem extends Omit<MacroItem, "matched_food"> {
  matched_food?: string;
  source: "database" | "ai_estimate";
}

export interface MacroAnalysis {
  items: MacroItem[];
  totals: Macros;
  macro_split: { protein_pct: number; carbs_pct: number; fat_pct: number };
  suggestions: string[];
  unmatched: string[];
}

export interface EnrichedMacroAnalysis extends Omit<MacroAnalysis, "items"> {
  items: EnrichedMacroItem[];
}

// Order matters: specific words ("half") must match before the article "a"
// so "half a cup" resolves to 0.5, not 1.
const NUMBER_WORDS: Record<string, number> = {
  half: 0.5, quarter: 0.25, couple: 2, few: 3, double: 2,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  some: 1, a: 1, an: 1,
};

const UNIT_RE =
  /\b(slices?|cups?|glass(?:es)?|bowls?|tbsps?|tablespoons?|tsps?|teaspoons?|scoops?|handfuls?|cans?|pieces?|servings?|grams?|gms?|g|ml|oz|ounces?)\b/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split a free-text meal description into food segments. */
export function splitSegments(description: string): string[] {
  return description
    .toLowerCase()
    .split(/,|;|\n|&|\band\b|\bwith\b|\bplus\b|\balong side\b|\balongside\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Find the food whose longest alias appears (word-bounded, plural-tolerant) in the segment. */
export function matchFood(segment: string): FoodEntry | undefined {
  let best: FoodEntry | undefined;
  let bestLen = 0;
  for (const entry of FOOD_DB) {
    for (const alias of entry.aliases) {
      if (alias.length <= bestLen) continue;
      const re = new RegExp(`\\b${escapeRe(alias)}(?:es|s)?\\b`);
      if (re.test(segment)) {
        best = entry;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

/** Extract a numeric quantity from a segment (digits, fractions, number words). */
function parseNumber(segment: string): number | undefined {
  const frac = segment.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const digits = segment.match(/(\d+(?:\.\d+)?)/); // no \b so "150g" still yields 150
  if (digits) return Number(digits[1]);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(segment)) return value;
  }
  return undefined;
}

/** Normalise a matched unit word to its canonical singular form. */
function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u.startsWith("tablespoon") || u.startsWith("tbsp")) return "tbsp";
  if (u.startsWith("teaspoon") || u.startsWith("tsp")) return "tsp";
  if (u.startsWith("glass")) return "glass";
  if (u.startsWith("slice")) return "slice";
  if (u.startsWith("cup")) return "cup";
  if (u.startsWith("bowl")) return "bowl";
  if (u.startsWith("scoop")) return "scoop";
  if (u.startsWith("handful")) return "handful";
  if (u.startsWith("can")) return "can";
  if (u.startsWith("piece")) return "piece";
  if (u.startsWith("serving")) return "serving";
  if (u === "g" || u.startsWith("gram") || u.startsWith("gm")) return "g";
  if (u === "ml") return "ml";
  if (u === "oz" || u.startsWith("ounce")) return "oz";
  return u;
}

export interface ResolvedQuantity {
  grams: number;
  label: string;
}

/**
 * Quantity heuristics:
 * - explicit weight/volume ("150g", "200 ml", "2 oz") wins
 * - unit words (slice/cup/glass/tbsp/...) use food-specific weights, falling
 *   back to a generic unit table
 * - a bare count uses the food's natural piece weight ("2 eggs" = 2 x 50 g)
 * - otherwise a sensible default portion for that food
 */
export function resolveQuantity(segment: string, entry: FoodEntry): ResolvedQuantity {
  // Attached weight units first ("150g", "200ml", "2oz") - these have no word
  // boundary between digits and unit, so UNIT_RE alone would miss them.
  const attached = segment.match(/(\d+(?:\.\d+)?)\s*(grams?|gms?|g|ml|oz|ounces?)\b/);
  if (attached) {
    const n = Number(attached[1]);
    const u = normalizeUnit(attached[2]);
    if (u === "oz") return { grams: n * 28.35, label: `${n} oz (${Math.round(n * 28.35)} g)` };
    return { grams: n, label: `${n} ${u === "ml" ? "ml" : "g"}` };
  }

  const count = parseNumber(segment);
  const unitMatch = segment.match(UNIT_RE);
  const unit = unitMatch ? normalizeUnit(unitMatch[0]) : undefined;

  if (unit === "g" || unit === "ml") {
    const grams = count ?? 100;
    return { grams, label: `${grams} ${unit === "ml" ? "ml" : "g"}` };
  }
  if (unit === "oz") {
    const n = count ?? 1;
    return { grams: n * 28.35, label: `${n} oz (${Math.round(n * 28.35)} g)` };
  }
  if (unit) {
    const perUnit =
      entry.unitGrams?.[unit] ??
      GENERIC_UNIT_GRAMS[unit] ??
      entry.pieceGrams ??
      entry.defaultPortionG;
    const n = count ?? 1;
    return { grams: n * perUnit, label: `${n} ${unit}${n === 1 ? "" : "s"} (${Math.round(n * perUnit)} g)` };
  }
  if (count !== undefined) {
    const perPiece = entry.pieceGrams ?? entry.defaultPortionG;
    return { grams: count * perPiece, label: `${count} x ${perPiece} g (${Math.round(count * perPiece)} g)` };
  }
  return { grams: entry.defaultPortionG, label: `default portion (${entry.defaultPortionG} g)` };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Compute totals, macro split and suggestions for a set of analyzed items. */
function summarize<T extends Omit<MacroItem, "matched_food">>(
  items: T[],
  unmatched: string[],
): Omit<MacroAnalysis, "items" | "unmatched"> {
  const totals: Macros = {
    calories: items.reduce((s, i) => s + i.calories, 0),
    protein_g: r1(items.reduce((s, i) => s + i.protein_g, 0)),
    carbs_g: r1(items.reduce((s, i) => s + i.carbs_g, 0)),
    fat_g: r1(items.reduce((s, i) => s + i.fat_g, 0)),
    fiber_g: r1(items.reduce((s, i) => s + i.fiber_g, 0)),
  };

  const calFromMacros =
    totals.protein_g * 4 + totals.carbs_g * 4 + totals.fat_g * 9 || 1;
  const macro_split = {
    protein_pct: Math.round((totals.protein_g * 4 * 100) / calFromMacros),
    carbs_pct: Math.round((totals.carbs_g * 4 * 100) / calFromMacros),
    fat_pct: Math.round((totals.fat_g * 9 * 100) / calFromMacros),
  };

  const suggestions: string[] = [];
  if (items.length === 0) {
    suggestions.push(
      "No foods were recognized in the description. Try listing items separated by commas, e.g. '2 eggs, toast with butter, a banana'.",
    );
  } else {
    if (macro_split.protein_pct < 15) {
      suggestions.push(
        `Protein is low (~${macro_split.protein_pct}% of calories). Add eggs, dairy, fish, chicken, tofu or legumes to reach 15-30%.`,
      );
    } else if (macro_split.protein_pct > 40) {
      suggestions.push(
        `Very protein-heavy (~${macro_split.protein_pct}% of calories). That is fine occasionally; add whole-grain carbs or fruit for balance and energy.`,
      );
    }
    if (macro_split.fat_pct > 45) {
      suggestions.push(
        `Fat contributes ~${macro_split.fat_pct}% of calories. Swap some added fats (butter, oils, fried items) for lean protein or whole grains.`,
      );
    }
    if (macro_split.carbs_pct > 60) {
      suggestions.push(
        `Carbohydrate-heavy meal (~${macro_split.carbs_pct}% of calories). Pair carbs with protein or healthy fat to slow the glucose spike.`,
      );
    }
    if (totals.fiber_g < 5) {
      suggestions.push(
        `Only ${totals.fiber_g} g fiber. Add vegetables, fruit, legumes or whole grains toward the ~30 g/day target.`,
      );
    } else if (totals.fiber_g >= 10) {
      suggestions.push(`Great fiber content (${totals.fiber_g} g) - good for satiety and gut health.`);
    }
    if (totals.calories > 900) {
      suggestions.push(`This is a large meal (~${totals.calories} kcal). Consider splitting it or lightening the energy-dense items.`);
    } else if (totals.calories < 250) {
      suggestions.push(`This is a light meal/snack (~${totals.calories} kcal).`);
    }
    if (suggestions.length === 0) {
      suggestions.push("Nicely balanced meal - protein, carbs and fat are all within sensible ranges.");
    }
  }
  if (unmatched.length > 0) {
    suggestions.push(`Not recognized (excluded from totals): ${unmatched.join("; ")}.`);
  }

  return { totals, macro_split, suggestions };
}

/** Analyze a free-text meal description into per-item macros, totals and advice. */
export function analyzeMacros(mealDescription: string): MacroAnalysis {
  const segments = splitSegments(mealDescription);
  const items: MacroItem[] = [];
  const unmatched: string[] = [];

  for (const segment of segments) {
    const entry = matchFood(segment);
    if (!entry) {
      unmatched.push(segment);
      continue;
    }
    const { grams, label } = resolveQuantity(segment, entry);
    const k = grams / 100;
    items.push({
      item: segment,
      matched_food: entry.name,
      quantity_assumed: label,
      calories: Math.round(entry.per100g.calories * k),
      protein_g: r1(entry.per100g.protein_g * k),
      carbs_g: r1(entry.per100g.carbs_g * k),
      fat_g: r1(entry.per100g.fat_g * k),
      fiber_g: r1(entry.per100g.fiber_g * k),
    });
  }

  return { items, ...summarize(items, unmatched), unmatched };
}

/**
 * Like analyzeMacros, but when AI enrichment is enabled and some items were
 * not matched by the food DB, makes ONE Claude call to estimate them and
 * merges the estimates in (source: "ai_estimate" vs "database"). Totals and
 * suggestions are recomputed over the combined items. On any enrichment
 * error/timeout the deterministic result is returned unchanged.
 */
export async function analyzeMacrosWithAi(
  mealDescription: string,
  estimate: UnmatchedEstimator = estimateUnmatchedItems,
): Promise<MacroAnalysis | EnrichedMacroAnalysis> {
  const base = analyzeMacros(mealDescription);
  if (!enrichmentEnabled() || base.unmatched.length === 0) return base;

  try {
    const estimated = await estimate(base.unmatched);
    if (!estimated || estimated.length === 0) return base;

    const items: EnrichedMacroItem[] = base.items.map((i) => ({ ...i, source: "database" }));
    const resolved = new Set<string>();
    for (const est of estimated) {
      // All-zero estimates mean "not a food" or a container/dish phrase whose
      // contents are itemized separately - drop them instead of listing 0-kcal rows.
      const isZero =
        est.calories === 0 && est.protein_g === 0 && est.carbs_g === 0 && est.fat_g === 0 && est.fiber_g === 0;
      if (isZero) {
        resolved.add(est.item.trim().toLowerCase());
        continue;
      }
      items.push({
        item: est.item,
        quantity_assumed: est.quantity_assumed,
        calories: Math.round(est.calories),
        protein_g: r1(est.protein_g),
        carbs_g: r1(est.carbs_g),
        fat_g: r1(est.fat_g),
        fiber_g: r1(est.fiber_g),
        source: "ai_estimate",
      });
      resolved.add(est.item.trim().toLowerCase());
    }
    const unmatched = base.unmatched.filter((u) => !resolved.has(u.trim().toLowerCase()));
    return { items, ...summarize(items, unmatched), unmatched };
  } catch (err) {
    console.warn(`[enrich] falling back to deterministic result: ${(err as Error).message}`);
    return base;
  }
}
