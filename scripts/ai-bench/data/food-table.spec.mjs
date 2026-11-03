// The foods in the bench's own food table (the "table-jev" variant), each
// tied to one USDA SR Legacy food by its exact description. build-food-table.mjs
// reads the USDA download and writes food-table.json with per-100 g values
// and the USDA portion weights. Names are what people type, in English,
// Spanish and German; the matcher uses them, Jev sees them.
//
// `density` (g per ml) converts "250 ml" to grams for liquids.
// `portions` overrides USDA's portions when theirs are missing or only in
// cups and spoons (the app is metric).

export const TABLE_SPEC = [
  // Fruit
  { id: "banana", usda: "Bananas, raw", names: { en: ["banana"], es: ["banana", "plátano"], de: ["Banane"] } },
  { id: "apple", usda: "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)", names: { en: ["apple"], es: ["manzana"], de: ["Apfel"] } },
  { id: "orange", usda: "Oranges, raw, all commercial varieties", names: { en: ["orange"], es: ["naranja"], de: ["Orange", "Apfelsine"] } },
  { id: "pear", usda: "Pears, raw", names: { en: ["pear"], es: ["pera"], de: ["Birne"] } },
  { id: "strawberries", usda: "Strawberries, raw", names: { en: ["strawberries", "strawberry"], es: ["frutillas", "fresas"], de: ["Erdbeeren"] } },
  { id: "grapes", usda: "Grapes, red or green (European type, such as Thompson seedless), raw", names: { en: ["grapes"], es: ["uvas"], de: ["Weintrauben", "Trauben"] } },
  { id: "kiwi", usda: "Kiwifruit, green, raw", names: { en: ["kiwi", "kiwifruit"], es: ["kiwi"], de: ["Kiwi"] } },
  { id: "mango", usda: "Mangos, raw", names: { en: ["mango"], es: ["mango"], de: ["Mango"] } },
  { id: "blueberries", usda: "Blueberries, raw", names: { en: ["blueberries"], es: ["arándanos"], de: ["Heidelbeeren", "Blaubeeren"] } },
  { id: "avocado", usda: "Avocados, raw, all commercial varieties", names: { en: ["avocado"], es: ["palta", "aguacate"], de: ["Avocado"] } },
  // Vegetables
  { id: "tomato", usda: "Tomatoes, red, ripe, raw, year round average", names: { en: ["tomato"], es: ["tomate"], de: ["Tomate"] } },
  { id: "carrot", usda: "Carrots, raw", names: { en: ["carrot"], es: ["zanahoria"], de: ["Karotte", "Möhre"] } },
  { id: "cucumber", usda: "Cucumber, with peel, raw", names: { en: ["cucumber"], es: ["pepino"], de: ["Gurke"] } },
  { id: "broccoli-boiled", usda: "Broccoli, cooked, boiled, drained, without salt", names: { en: ["cooked broccoli", "boiled broccoli", "broccoli"], es: ["brócoli hervido", "brócoli"], de: ["Brokkoli gekocht", "Brokkoli"] } },
  { id: "potato-boiled", usda: "Potatoes, boiled, cooked in skin, flesh, without salt", names: { en: ["boiled potatoes", "boiled potato", "potatoes"], es: ["papas hervidas", "papa hervida", "patatas cocidas"], de: ["Salzkartoffeln", "Pellkartoffeln", "gekochte Kartoffeln", "Kartoffeln"] } },
  { id: "sweet-potato-baked", usda: "Sweet potato, cooked, baked in skin, flesh, without salt", names: { en: ["baked sweet potato", "sweet potato"], es: ["batata al horno", "batata"], de: ["Süßkartoffel"] } },
  { id: "spinach", usda: "Spinach, raw", names: { en: ["spinach"], es: ["espinaca"], de: ["Spinat"] } },
  { id: "onion", usda: "Onions, raw", names: { en: ["onion"], es: ["cebolla"], de: ["Zwiebel"] } },
  // Eggs and dairy
  { id: "egg-raw", usda: "Egg, whole, raw, fresh", names: { en: ["egg", "raw egg"], es: ["huevo"], de: ["Ei", "Eier"] } },
  { id: "egg-boiled", usda: "Egg, whole, cooked, hard-boiled", names: { en: ["boiled egg", "hard-boiled egg"], es: ["huevo duro", "huevo hervido"], de: ["gekochtes Ei", "Eier gekocht", "hartgekochtes Ei"] } },
  { id: "egg-fried", usda: "Egg, whole, cooked, fried", names: { en: ["fried egg"], es: ["huevo frito"], de: ["Spiegelei"] } },
  { id: "egg-scrambled", usda: "Egg, whole, cooked, scrambled", names: { en: ["scrambled eggs", "scrambled egg"], es: ["huevos revueltos"], de: ["Rührei"] } },
  { id: "butter", usda: "Butter, salted", names: { en: ["butter"], es: ["manteca", "mantequilla"], de: ["Butter"] }, portions: [{ label: "1 pat", grams: 5 }] },
  { id: "olive-oil", usda: "Oil, olive, salad or cooking", density: 0.92, names: { en: ["olive oil"], es: ["aceite de oliva"], de: ["Olivenöl"] }, portions: [{ label: "1 drizzle", grams: 5 }] },
  { id: "milk-whole", usda: "Milk, whole, 3.25% milkfat, with added vitamin D", density: 1.03, names: { en: ["whole milk", "milk"], es: ["leche entera", "leche"], de: ["Vollmilch", "Milch"] }, portions: [{ label: "1 glass (250 ml)", grams: 258 }] },
  { id: "milk-skim", usda: "Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)", density: 1.03, names: { en: ["skimmed milk", "skim milk"], es: ["leche descremada"], de: ["Magermilch"] }, portions: [{ label: "1 glass (250 ml)", grams: 258 }] },
  { id: "greek-yogurt-nonfat", usda: "Yogurt, Greek, plain, nonfat (Includes foods for USDA's Food Distribution Program)", names: { en: ["plain nonfat Greek yogurt", "Greek yogurt"], es: ["yogur griego natural descremado", "yogur griego"], de: ["griechischer Joghurt"] } },
  { id: "cheddar", usda: "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)", names: { en: ["cheddar"], es: ["queso cheddar"], de: ["Cheddar"] } },
  { id: "mozzarella", usda: "Cheese, mozzarella, whole milk", names: { en: ["mozzarella"], es: ["mozzarella", "muzzarella"], de: ["Mozzarella"] } },
  // Grains
  { id: "rice-white-cooked", usda: "Rice, white, long-grain, regular, enriched, cooked", names: { en: ["cooked white rice", "white rice", "rice"], es: ["arroz blanco cocido", "arroz blanco", "arroz"], de: ["gekochter Reis", "weißer Reis", "Reis"] } },
  { id: "rice-brown-cooked", usda: "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)", names: { en: ["cooked brown rice", "brown rice"], es: ["arroz integral"], de: ["Naturreis", "Vollkornreis"] } },
  { id: "pasta-cooked", usda: "Pasta, cooked, enriched, without added salt", names: { en: ["cooked pasta", "cooked spaghetti", "pasta", "spaghetti"], es: ["fideos cocidos", "pasta cocida", "fideos", "espaguetis"], de: ["gekochte Nudeln", "Nudeln", "Spaghetti"] } },
  { id: "oats", usda: "Cereals, oats, regular and quick, not fortified, dry", names: { en: ["oats", "rolled oats", "porridge oats"], es: ["avena"], de: ["Haferflocken"] } },
  { id: "bread-white", usda: "Bread, white, commercially prepared (includes soft bread crumbs)", names: { en: ["white bread", "bread"], es: ["pan blanco", "pan de molde"], de: ["Weißbrot", "Toastbrot"] } },
  { id: "bread-wholewheat", usda: "Bread, whole-wheat, commercially prepared", names: { en: ["wholemeal bread", "whole wheat bread"], es: ["pan integral"], de: ["Vollkornbrot"] } },
  // Meat, fish, legumes, nuts
  { id: "chicken-breast-cooked", usda: "Chicken, broilers or fryers, breast, meat only, cooked, roasted", names: { en: ["chicken breast", "grilled chicken breast", "roast chicken breast"], es: ["pechuga de pollo"], de: ["Hähnchenbrust", "Hühnerbrust"] } },
  { id: "salmon-raw", usda: "Fish, salmon, Atlantic, farmed, raw", names: { en: ["salmon", "raw salmon"], es: ["salmón"], de: ["Lachs"] } },
  { id: "tuna-canned-water", usda: "Fish, tuna, light, canned in water, without salt, drained solids", names: { en: ["tuna in water", "canned tuna"], es: ["atún al natural", "atún en lata"], de: ["Thunfisch im eigenen Saft", "Thunfisch"] } },
  { id: "tofu-firm", usda: "Tofu, raw, firm, prepared with calcium sulfate", names: { en: ["tofu", "firm tofu"], es: ["tofu"], de: ["Tofu"] } },
  { id: "lentils-cooked", usda: "Lentils, mature seeds, cooked, boiled, without salt", names: { en: ["cooked lentils", "lentils"], es: ["lentejas cocidas", "lentejas"], de: ["gekochte Linsen", "Linsen"] } },
  { id: "chickpeas-cooked", usda: "Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt", names: { en: ["cooked chickpeas", "chickpeas"], es: ["garbanzos cocidos", "garbanzos"], de: ["Kichererbsen"] } },
  { id: "black-beans-cooked", usda: "Beans, black, mature seeds, cooked, boiled, without salt", names: { en: ["black beans"], es: ["porotos negros", "frijoles negros"], de: ["schwarze Bohnen"] } },
  { id: "almonds", usda: "Nuts, almonds", names: { en: ["almonds"], es: ["almendras"], de: ["Mandeln"] } },
  { id: "walnuts", usda: "Nuts, walnuts, english", names: { en: ["walnuts"], es: ["nueces"], de: ["Walnüsse"] } },
  { id: "peanuts", usda: "Peanuts, all types, raw", names: { en: ["peanuts"], es: ["maní", "cacahuetes"], de: ["Erdnüsse"] } },
  { id: "peanut-butter", usda: "Peanut butter, smooth style, without salt", names: { en: ["peanut butter"], es: ["mantequilla de maní", "manteca de maní"], de: ["Erdnussbutter"] } },
  // Sugar, drinks
  { id: "sugar", usda: "Sugars, granulated", names: { en: ["sugar"], es: ["azúcar"], de: ["Zucker"] } },
  { id: "honey", usda: "Honey", density: 1.42, names: { en: ["honey"], es: ["miel"], de: ["Honig"] } },
  { id: "coffee-black", usda: "Beverages, coffee, brewed, prepared with tap water", density: 1, names: { en: ["black coffee", "filter coffee", "coffee"], es: ["café negro", "café de filtro"], de: ["Kaffee schwarz", "Filterkaffee", "Kaffee"] }, portions: [{ label: "1 mug (240 ml)", grams: 240 }] },
  { id: "espresso", usda: "Beverages, coffee, brewed, espresso, restaurant-prepared", density: 1, names: { en: ["espresso"], es: ["espresso", "café expreso", "café"], de: ["Espresso"] }, portions: [{ label: "1 shot (30 ml)", grams: 30 }] },
]
