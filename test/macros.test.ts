import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMacros, matchFood, resolveQuantity, splitSegments } from "../src/tools/macros.js";

test("splits a realistic sentence on commas, 'and' and 'with'", () => {
  const segs = splitSegments("2 eggs, toast with butter, a banana and a glass of milk");
  assert.deepEqual(segs, ["2 eggs", "toast", "butter", "a banana", "a glass of milk"]);
});

test("parses the realistic sentence into sensible per-item macros", () => {
  const result = analyzeMacros("2 eggs, toast with butter, a banana and a glass of milk");
  assert.equal(result.items.length, 5);
  assert.equal(result.unmatched.length, 0);

  const byFood = Object.fromEntries(result.items.map((i) => [i.matched_food, i]));

  // 2 eggs = 2 x 50 g = 100 g -> ~155 kcal
  assert.match(byFood["egg"].quantity_assumed, /2/);
  assert.ok(byFood["egg"].calories > 140 && byFood["egg"].calories < 170, `egg kcal ${byFood["egg"].calories}`);

  // toast -> white bread, default one slice (30 g)
  assert.equal(byFood["white bread"].quantity_assumed, "default portion (30 g)");

  // a banana -> 1 piece (118 g), ~105 kcal
  assert.ok(byFood["banana"].calories > 90 && byFood["banana"].calories < 120);

  // a glass of milk -> 240 g of whole milk, ~146 kcal
  assert.match(byFood["whole milk"].quantity_assumed, /glass/);
  assert.ok(byFood["whole milk"].calories > 130 && byFood["whole milk"].calories < 160);

  // whole-breakfast total lands in a plausible range
  assert.ok(
    result.totals.calories > 450 && result.totals.calories < 650,
    `total kcal ${result.totals.calories}`,
  );
  assert.ok(result.totals.protein_g > 20, "breakfast has meaningful protein");
  assert.ok(result.suggestions.length > 0);
});

test("quantity heuristics: grams, slices, tbsp, cups, number words", () => {
  const rice = matchFood("150g rice")!;
  assert.equal(rice.name, "white rice (cooked)");
  assert.equal(resolveQuantity("150g rice", rice).grams, 150);

  const bread = matchFood("3 slices of bread")!;
  assert.equal(resolveQuantity("3 slices of bread", bread).grams, 90);

  const pb = matchFood("two tbsp of peanut butter")!;
  assert.equal(pb.name, "peanut butter");
  assert.equal(resolveQuantity("two tbsp of peanut butter", pb).grams, 32);

  const oats = matchFood("half a cup of oats")!;
  assert.equal(resolveQuantity("half a cup of oats", oats).grams, 40);
});

test("longest alias wins: skim milk and peanut butter beat milk and peanut", () => {
  assert.equal(matchFood("a glass of skim milk")!.name, "skim milk");
  assert.equal(matchFood("peanut butter on toast")!.name, "peanut butter");
  assert.equal(matchFood("a serving of fries")!.name, "french fries");
  assert.equal(matchFood("a handful of potato chips")!.name, "potato chips");
});

test("unknown foods are reported, not silently dropped", () => {
  const result = analyzeMacros("a bowl of xyzzy stew, 2 eggs");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.unmatched, ["a bowl of xyzzy stew"]);
  assert.ok(result.suggestions.some((s) => s.includes("Not recognized")));
});

test("suggestions flag low protein and low fiber", () => {
  const result = analyzeMacros("a can of cola and a slice of cake");
  assert.ok(result.suggestions.some((s) => /protein is low/i.test(s)));
  assert.ok(result.suggestions.some((s) => /fiber/i.test(s)));
});
