// The held-out staple set: common foods that are NOT in the food table
// (food-table.spec.mjs). It answers two questions the main set can't:
//
// 1. Does the table answer foods it doesn't hold? Many entries are traps
//    that share words with a table food but differ in calories: full-fat
//    against nonfat Greek yogurt, dry against cooked pasta, almond milk
//    against almonds and milk. Any table answer on this set is a false
//    match (`trap` names the table food it is likely to be confused with).
// 2. How good is Gemini on staples outside the table, without search?
//
// References are USDA SR Legacy, built by build-heldout.mjs into
// heldout.json. That is independent here, because none of these foods is
// in the table. Each part is a USDA description and a weight in grams;
// liquids give ml × density. Counted foods use USDA's portion weight, noted
// in `note`.

export const HELDOUT_VERSION = "2026-11-03"

export const HELDOUT_SPEC = [
  // Traps: a table food shares words but not calories.
  { text: "250 g full-fat Greek yogurt", trap: "greek-yogurt-nonfat", tol: 0.1,
    parts: [["Yogurt, Greek, plain, whole milk", 250]] },
  { text: "80 g dry spaghetti", trap: "pasta-cooked", tol: 0.1,
    parts: [["Pasta, dry, enriched", 80]] },
  { text: "70 g uncooked white rice", trap: "rice-white-cooked", tol: 0.1,
    parts: [["Rice, white, long-grain, regular, raw, enriched", 70]] },
  { text: "50 g dry lentils", trap: "lentils-cooked", tol: 0.1,
    parts: [["Lentils, raw", 50]] },
  { text: "250 ml unsweetened almond milk", trap: "almonds, milk-whole", tol: 0.25,
    parts: [["Beverages, almond milk, unsweetened, shelf stable", 250 * 1.02]] },
  { text: "10 g peanut oil", trap: "peanuts, olive-oil", tol: 0.08,
    parts: [["Oil, peanut, salad or cooking", 10]] },
  { text: "100 g egg whites", trap: "egg-raw", tol: 0.12,
    parts: [["Egg, white, raw, fresh", 100]] },
  { text: "2 rice cakes", trap: "rice-white-cooked", tol: 0.2, note: "USDA 1 cake 9 g",
    parts: [["Snacks, rice cakes, brown rice, plain, unsalted", 18]] },
  { text: "1 butter croissant", trap: "butter", tol: 0.2, note: "USDA medium 57 g",
    parts: [["Croissants, butter", 57]] },
  { text: "60 g rye bread", trap: "bread-white, bread-wholewheat", tol: 0.1,
    parts: [["Bread, rye", 60]] },
  { text: "150 g roast turkey breast", trap: "chicken-breast-cooked", tol: 0.12,
    parts: [["Turkey, whole, breast, meat only, cooked, roasted", 150]] },
  { text: "200 g de pechuga de pollo asada con piel", trap: "chicken-breast-cooked", tol: 0.1,
    parts: [["Chicken, broilers or fryers, breast, meat and skin, cooked, roasted", 200]] },
  { text: "100 g Räucherlachs", trap: "salmon-raw", tol: 0.15,
    parts: [["Fish, salmon, chinook, smoked", 100]] },
  { text: "200 ml de jugo de naranja", trap: "orange", tol: 0.15,
    parts: [["Orange juice, raw (Includes foods for USDA's Food Distribution Program)", 200 * 1.04]] },
  { text: "50 g hummus", trap: "chickpeas-cooked", tol: 0.2,
    parts: [["Hummus, commercial", 50]] },
  { text: "30 g cream cheese", trap: "cheddar, mozzarella", tol: 0.12,
    parts: [["Cheese, cream", 30]] },
  { text: "150 g cottage cheese", trap: "cheddar, mozzarella", tol: 0.15,
    parts: [["Cheese, cottage, creamed, large or small curd", 150]] },

  // Plain staples the table doesn't hold.
  { text: "200 g grilled sirloin steak", tol: 0.15,
    parts: [["Beef, top sirloin, steak, separable lean only, trimmed to 1/8\" fat, all grades, cooked, broiled", 200]] },
  { text: "150 g cooked shrimp", tol: 0.12,
    parts: [["Crustaceans, shrimp, mixed species, cooked, moist heat (may contain additives to retain moisture)", 150]] },
  { text: "150 g baked cod", tol: 0.12,
    parts: [["Fish, cod, Atlantic, cooked, dry heat", 150]] },
  { text: "185 g cooked quinoa", tol: 0.1,
    parts: [["Quinoa, cooked", 185]] },
  { text: "150 g cooked couscous", tol: 0.1,
    parts: [["Couscous, cooked", 150]] },
  { text: "30 g feta", tol: 0.1,
    parts: [["Cheese, feta", 30]] },
  { text: "20 g grated parmesan", tol: 0.12,
    parts: [["Cheese, parmesan, grated", 20]] },
  { text: "30 g cashews", tol: 0.08,
    parts: [["Nuts, cashew nuts, raw", 30]] },
  { text: "20 g sunflower seeds", tol: 0.08,
    parts: [["Seeds, sunflower seed kernels, dried", 20]] },
  { text: "20 g dark chocolate, 70–85%", tol: 0.1,
    parts: [["Chocolate, dark, 70-85% cacao solids", 20]] },
  { text: "30 g raisins", tol: 0.08,
    parts: [["Raisins, dark, seedless (Includes foods for USDA's Food Distribution Program)", 30]] },
  { text: "150 g pineapple", tol: 0.15,
    parts: [["Pineapple, raw, all varieties", 150]] },
  { text: "300 g watermelon", tol: 0.2,
    parts: [["Watermelon, raw", 300]] },
  { text: "100 g champiñones", tol: 0.3,
    parts: [["Mushrooms, white, raw", 100]] },
  { text: "150 g Erbsen, gekocht", tol: 0.12,
    parts: [["Peas, green, frozen, cooked, boiled, drained, without salt", 150]] },
  { text: "1 Brezel", tol: 0.25, note: "USDA soft pretzel, medium 115 g",
    parts: [["Pretzels, soft", 115]] },
  { text: "2 cucharadas de dulce de leche", tol: 0.3, note: "USDA 1 tbsp 19 g",
    parts: [["Dulce de Leche", 38]] },
]
