import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeMacros,
  analyzeMacrosWithAi,
  type EnrichedMacroAnalysis,
} from "../src/tools/macros.js";
import { enrichmentEnabled, type AiEstimatedItem } from "../src/enrich.js";

const MEAL = "a bowl of xyzzy stew, 2 eggs";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ENRICH_ENABLED;
});

test("disabled: enriched analyzer output is identical to the deterministic one", async () => {
  assert.equal(enrichmentEnabled(), false);
  const enriched = await analyzeMacrosWithAi(MEAL);
  assert.deepEqual(enriched, analyzeMacros(MEAL));
  // No source tags leak into the disabled response.
  assert.ok(enriched.items.every((i) => !("source" in i)));
});

test("disabled: injected estimator is never called", async () => {
  let called = 0;
  await analyzeMacrosWithAi(MEAL, async () => {
    called++;
    return [];
  });
  assert.equal(called, 0);
});

test("enabled + mocked success: AI estimates merge into items, totals and suggestions", async () => {
  process.env.ENRICH_ENABLED = "true";
  const estimate: AiEstimatedItem = {
    item: "a bowl of xyzzy stew",
    quantity_assumed: "1 bowl (~300 g)",
    calories: 320,
    protein_g: 14.2,
    carbs_g: 30.1,
    fat_g: 15.5,
    fiber_g: 4.3,
  };
  const mock = async (unmatched: string[]) => {
    assert.deepEqual(unmatched, ["a bowl of xyzzy stew"]);
    return [estimate];
  };

  const result = (await analyzeMacrosWithAi(MEAL, mock)) as EnrichedMacroAnalysis;
  const base = analyzeMacros(MEAL);

  assert.equal(result.items.length, base.items.length + 1);
  const aiItem = result.items.find((i) => i.source === "ai_estimate")!;
  assert.equal(aiItem.item, "a bowl of xyzzy stew");
  assert.equal(aiItem.calories, 320);
  assert.equal(aiItem.quantity_assumed, "1 bowl (~300 g)");
  assert.ok(result.items.filter((i) => i.source === "database").length === base.items.length);

  // Totals include both DB-matched and AI-estimated items.
  assert.equal(result.totals.calories, base.totals.calories + 320);
  // The stew is accounted for now, so it's no longer flagged as unmatched.
  assert.deepEqual(result.unmatched, []);
  assert.ok(!result.suggestions.some((s) => s.includes("Not recognized")));
});

test("enabled + mocked failure: clean fallback to the deterministic result", async () => {
  process.env.ENRICH_ENABLED = "true";
  const failing = async () => {
    throw new Error("simulated API timeout");
  };
  const result = await analyzeMacrosWithAi(MEAL, failing);
  assert.deepEqual(result, analyzeMacros(MEAL));
});

test("enabled but nothing unmatched: no LLM call, deterministic result", async () => {
  process.env.ENRICH_ENABLED = "true";
  let called = 0;
  const result = await analyzeMacrosWithAi("2 eggs and a banana", async () => {
    called++;
    return [];
  });
  assert.equal(called, 0);
  assert.deepEqual(result, analyzeMacros("2 eggs and a banana"));
});
