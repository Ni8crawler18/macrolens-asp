/**
 * MacroLens food database: ~85 common foods with per-100g macros,
 * keyword aliases for free-text matching, and portion heuristics.
 *
 * Values are approximate, sourced from USDA FoodData Central style
 * references. `per100g` is always per 100 g of the food as eaten
 * (cooked where relevant). `pieceGrams` is the weight of one natural
 * unit ("2 eggs", "a banana"); `unitGrams` overrides generic unit
 * weights (slice/cup/glass/tbsp...) for that food.
 */

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface FoodEntry {
  name: string;
  aliases: string[];
  per100g: Macros;
  /** Grams assumed when no quantity/unit is given. */
  defaultPortionG: number;
  /** Grams of one natural piece/unit, used for bare counts ("2 eggs"). */
  pieceGrams?: number;
  /** Food-specific unit weights that override the generic table. */
  unitGrams?: Record<string, number>;
}

/** Generic unit weights (grams) used when a food has no specific override. */
export const GENERIC_UNIT_GRAMS: Record<string, number> = {
  slice: 30,
  cup: 240,
  glass: 240,
  bowl: 250,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  scoop: 30,
  handful: 30,
  can: 330,
};

function food(
  name: string,
  aliases: string[],
  [calories, protein_g, carbs_g, fat_g, fiber_g]: [number, number, number, number, number],
  defaultPortionG: number,
  pieceGrams?: number,
  unitGrams?: Record<string, number>,
): FoodEntry {
  return { name, aliases, per100g: { calories, protein_g, carbs_g, fat_g, fiber_g }, defaultPortionG, pieceGrams, unitGrams };
}

export const FOOD_DB: FoodEntry[] = [
  // --- dairy & eggs ---
  food("egg", ["egg"], [155, 13, 1.1, 11, 0], 50, 50),
  food("whole milk", ["whole milk", "milk"], [61, 3.2, 4.8, 3.3, 0], 240, undefined, { glass: 240, cup: 240 }),
  food("skim milk", ["skim milk", "skimmed milk", "fat free milk"], [35, 3.4, 5, 0.1, 0], 240, undefined, { glass: 240, cup: 240 }),
  food("butter", ["butter"], [717, 0.9, 0.1, 81, 0], 10, undefined, { tbsp: 14, tablespoon: 14, tsp: 5 }),
  food("cheddar cheese", ["cheddar", "cheese"], [403, 25, 1.3, 33, 0], 30, 20, { slice: 20 }),
  food("paneer", ["paneer", "cottage cheese"], [296, 18, 4, 22, 0], 80),
  food("yogurt", ["yogurt", "yoghurt", "curd", "dahi"], [61, 3.5, 4.7, 3.3, 0], 170, undefined, { cup: 245, bowl: 245 }),
  food("greek yogurt", ["greek yogurt", "greek yoghurt"], [97, 9, 3.9, 5, 0], 170, undefined, { cup: 245 }),
  food("ice cream", ["ice cream", "icecream"], [207, 3.5, 24, 11, 0.7], 100, undefined, { scoop: 66, cup: 132 }),

  // --- grains, breads & breakfast ---
  food("white bread", ["white bread", "bread", "toast"], [265, 9, 49, 3.2, 2.7], 30, 30, { slice: 30 }),
  food("whole wheat bread", ["whole wheat bread", "wholemeal bread", "brown bread", "rye"], [247, 13, 41, 3.4, 6], 33, 33, { slice: 33 }),
  food("white rice (cooked)", ["white rice", "rice"], [130, 2.7, 28, 0.3, 0.4], 150, undefined, { cup: 158, bowl: 200 }),
  food("brown rice (cooked)", ["brown rice"], [112, 2.3, 24, 0.8, 1.8], 150, undefined, { cup: 155, bowl: 200 }),
  food("pasta (cooked)", ["pasta", "spaghetti", "noodles", "macaroni"], [158, 5.8, 31, 0.9, 1.8], 150, undefined, { cup: 140, bowl: 220 }),
  food("oats (dry)", ["oats", "oatmeal", "porridge", "muesli"], [389, 17, 66, 7, 10.6], 40, undefined, { cup: 80, bowl: 50 }),
  food("cornflakes", ["cornflakes", "corn flakes", "cereal"], [357, 7.5, 84, 0.4, 3], 30, undefined, { cup: 25, bowl: 30 }),
  food("granola", ["granola"], [471, 10, 64, 20, 7], 45, undefined, { cup: 60 }),
  food("croissant", ["croissant"], [406, 8.2, 45, 21, 2.6], 57, 57),
  food("bagel", ["bagel"], [250, 10, 49, 1.5, 2.1], 98, 98),
  food("tortilla", ["tortilla", "wrap"], [310, 8.4, 52, 7.7, 3.5], 45, 45),
  food("quinoa (cooked)", ["quinoa"], [120, 4.4, 21, 1.9, 2.8], 150, undefined, { cup: 185 }),
  food("roti", ["roti", "chapati", "chapatti", "phulka"], [300, 10, 50, 7, 6.5], 40, 40),
  food("dosa", ["dosa"], [168, 3.9, 29, 3.7, 1.2], 86, 86),
  food("idli", ["idli"], [135, 4, 28, 0.4, 1.5], 39, 39),
  food("poha", ["poha", "flattened rice"], [130, 2.6, 27, 1.5, 1], 150, undefined, { bowl: 180 }),

  // --- fruit ---
  food("banana", ["banana"], [89, 1.1, 23, 0.3, 2.6], 118, 118),
  food("apple", ["apple"], [52, 0.3, 14, 0.2, 2.4], 182, 182),
  food("orange", ["orange"], [47, 0.9, 12, 0.1, 2.4], 131, 131),
  food("strawberries", ["strawberries", "strawberry", "berries"], [32, 0.7, 7.7, 0.3, 2], 100, undefined, { cup: 150 }),
  food("blueberries", ["blueberries", "blueberry"], [57, 0.7, 14, 0.3, 2.4], 100, undefined, { cup: 148 }),
  food("grapes", ["grapes", "grape"], [69, 0.7, 18, 0.2, 0.9], 100, undefined, { cup: 150 }),
  food("mango", ["mango"], [60, 0.8, 15, 0.4, 1.6], 165, 200, { cup: 165 }),
  food("avocado", ["avocado"], [160, 2, 9, 15, 6.7], 75, 150),

  // --- protein: meat, fish, plant ---
  food("chicken breast (cooked)", ["chicken breast", "grilled chicken", "chicken"], [165, 31, 0, 3.6, 0], 120, 120),
  food("chicken thigh (cooked)", ["chicken thigh"], [209, 26, 0, 10.9, 0], 100, 100),
  food("beef (cooked)", ["beef", "steak"], [250, 26, 0, 15, 0], 100),
  food("pork (cooked)", ["pork"], [242, 27, 0, 14, 0], 100),
  food("bacon", ["bacon"], [541, 37, 1.4, 42, 0], 24, 12, { slice: 12 }),
  food("salmon (cooked)", ["salmon"], [208, 20, 0, 13, 0], 120, 120),
  food("tuna (canned)", ["tuna"], [116, 26, 0, 1, 0], 100, undefined, { can: 120 }),
  food("shrimp (cooked)", ["shrimp", "prawns", "prawn"], [99, 24, 0.3, 0.3, 0], 85),
  food("tofu", ["tofu"], [76, 8, 1.9, 4.8, 0.3], 100),
  food("lentils (cooked)", ["lentils", "lentil", "dal", "daal", "dhal"], [116, 9, 20, 0.4, 7.9], 150, undefined, { cup: 198, bowl: 220 }),
  food("chickpeas (cooked)", ["chickpeas", "chickpea", "chana", "chole"], [164, 8.9, 27, 2.6, 7.6], 150, undefined, { cup: 164 }),
  food("black beans (cooked)", ["black beans", "beans", "kidney beans", "rajma"], [132, 8.9, 24, 0.5, 8.7], 150, undefined, { cup: 172 }),
  food("whey protein powder", ["whey protein", "protein powder", "protein shake", "whey"], [375, 75, 10, 5, 2], 30, undefined, { scoop: 30 }),
  food("hummus", ["hummus", "houmous"], [166, 8, 14, 9.6, 6], 45, undefined, { tbsp: 15, tablespoon: 15 }),

  // --- nuts, seeds & spreads ---
  food("peanut butter", ["peanut butter"], [588, 25, 20, 50, 6], 32, undefined, { tbsp: 16, tablespoon: 16 }),
  food("almonds", ["almonds", "almond"], [579, 21, 22, 50, 12.5], 28, 1.2, { handful: 28 }),
  food("walnuts", ["walnuts", "walnut"], [654, 15, 14, 65, 6.7], 28, undefined, { handful: 28 }),
  food("cashews", ["cashews", "cashew"], [553, 18, 30, 44, 3.3], 28, undefined, { handful: 28 }),
  food("peanuts", ["peanuts", "peanut"], [567, 26, 16, 49, 8.5], 28, undefined, { handful: 28 }),

  // --- fats, condiments & sweeteners ---
  food("olive oil", ["olive oil", "oil"], [884, 0, 0, 100, 0], 13.5, undefined, { tbsp: 13.5, tablespoon: 13.5, tsp: 4.5 }),
  food("coconut oil", ["coconut oil", "ghee"], [880, 0, 0, 99.5, 0], 13.6, undefined, { tbsp: 13.6, tablespoon: 13.6, tsp: 4.5 }),
  food("mayonnaise", ["mayonnaise", "mayo"], [680, 1, 0.6, 75, 0], 14, undefined, { tbsp: 14, tablespoon: 14 }),
  food("ketchup", ["ketchup"], [112, 1.3, 26, 0.1, 0.3], 17, undefined, { tbsp: 17, tablespoon: 17 }),
  food("honey", ["honey"], [304, 0.3, 82, 0, 0.2], 21, undefined, { tbsp: 21, tablespoon: 21, tsp: 7 }),
  food("sugar", ["sugar"], [387, 0, 100, 0, 0], 8, undefined, { tbsp: 12.5, tablespoon: 12.5, tsp: 4 }),
  food("jam", ["jam", "jelly", "marmalade"], [278, 0.4, 69, 0.1, 1], 20, undefined, { tbsp: 20, tablespoon: 20 }),

  // --- vegetables & sides ---
  food("potato (boiled)", ["potato", "potatoes", "aloo"], [87, 1.9, 20, 0.1, 1.8], 170, 170),
  food("sweet potato", ["sweet potato", "sweet potatoes"], [86, 1.6, 20, 0.1, 3], 130, 130),
  food("french fries", ["french fries", "fries"], [312, 3.4, 41, 15, 3.8], 117),
  food("broccoli", ["broccoli"], [34, 2.8, 7, 0.4, 2.6], 90, undefined, { cup: 91 }),
  food("spinach", ["spinach", "palak"], [23, 2.9, 3.6, 0.4, 2.2], 60, undefined, { cup: 30 }),
  food("carrot", ["carrot", "carrots"], [41, 0.9, 10, 0.2, 2.8], 61, 61),
  food("tomato", ["tomato", "tomatoes"], [18, 0.9, 3.9, 0.2, 1.2], 123, 123),
  food("cucumber", ["cucumber"], [15, 0.7, 3.6, 0.1, 0.5], 100),
  food("salad greens", ["salad", "lettuce", "greens"], [15, 1.4, 2.9, 0.2, 1.3], 80, undefined, { bowl: 100 }),
  food("onion", ["onion", "onions"], [40, 1.1, 9.3, 0.1, 1.7], 60, 110),
  food("bell pepper", ["bell pepper", "capsicum", "pepper"], [26, 1, 6, 0.3, 2.1], 90, 120),
  food("corn", ["corn", "sweetcorn"], [86, 3.3, 19, 1.4, 2], 100, undefined, { cup: 145 }),
  food("peas", ["peas", "green peas", "matar"], [81, 5.4, 14, 0.4, 5.7], 100, undefined, { cup: 145 }),
  food("mushrooms", ["mushrooms", "mushroom"], [22, 3.1, 3.3, 0.3, 1], 70, undefined, { cup: 70 }),

  // --- fast food & snacks ---
  food("pizza", ["pizza"], [266, 11, 33, 10, 2.3], 107, 107, { slice: 107 }),
  food("hamburger", ["hamburger", "burger", "cheeseburger"], [254, 13, 18, 14, 1.5], 220, 220),
  food("hot dog", ["hot dog", "hotdog"], [290, 10, 18, 26, 1], 100, 100),
  food("milk chocolate", ["milk chocolate", "chocolate"], [535, 7.7, 59, 30, 3.4], 40, undefined, { slice: 10 }),
  food("dark chocolate", ["dark chocolate"], [598, 7.8, 46, 43, 10.9], 20),
  food("cookie", ["cookie", "cookies", "biscuit", "biscuits"], [488, 5.6, 64, 24, 2], 16, 16),
  food("cake", ["cake", "pastry"], [367, 4.3, 55, 15, 0.8], 80, undefined, { slice: 80 }),
  food("potato chips", ["potato chips", "chips", "crisps"], [536, 7, 53, 35, 4.4], 30, undefined, { handful: 25 }),

  // --- drinks ---
  food("cola", ["cola", "coke", "soda", "soft drink", "pepsi"], [42, 0, 10.6, 0, 0], 330, undefined, { glass: 240, can: 330, cup: 240 }),
  food("orange juice", ["orange juice", "juice"], [45, 0.7, 10.4, 0.2, 0.2], 240, undefined, { glass: 240, cup: 240 }),
  food("black coffee", ["black coffee", "coffee", "espresso"], [1, 0.1, 0, 0, 0], 240, undefined, { cup: 240, glass: 240 }),
  food("latte", ["latte", "cappuccino", "flat white"], [42, 3.4, 4.5, 1.5, 0], 240, undefined, { cup: 240, glass: 240 }),
  food("tea (plain)", ["green tea", "black tea", "tea"], [1, 0, 0.3, 0, 0], 240, undefined, { cup: 240, glass: 240 }),
  food("milk tea (chai)", ["milk tea", "chai"], [44, 1.6, 6.4, 1.6, 0], 200, undefined, { cup: 200, glass: 200 }),
  food("beer", ["beer", "lager"], [43, 0.5, 3.6, 0, 0], 355, undefined, { glass: 355, can: 355, cup: 240 }),
  food("wine", ["wine", "red wine", "white wine"], [83, 0.1, 2.6, 0, 0], 150, undefined, { glass: 150 }),
];
