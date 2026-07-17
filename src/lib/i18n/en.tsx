import type { ReactNode } from "react"

import type { QuantityKind } from "@/lib/quantity"

// The English dictionary — the source of truth for every user-facing string
// (spec § i18n, issue #25). `es.tsx` mirrors this shape exactly; the shared
// `Dictionary` type is `typeof en`, so a missing or mistyped key in another
// language is a compile error, and adding a language is adding one module.
//
// Entries are plain strings, or functions when a string interpolates a value
// (kept as `(x) => \`…${x}…\``, never string concatenation at the call site, so
// word order is the translation's to decide). A handful return React nodes
// where a phrase wraps an emphasised or dynamic fragment mid-sentence.
//
// Units that read the same in both languages (`kcal`, `g`, `%`) still live here
// so every rendered word comes from the dictionary and the hardcoded-string
// sweep (scripts/i18n-sweep.mjs) stays clean. Brand names (Yaffle, Google,
// Safari) are proper nouns, not translated, but are routed through here for the
// same reason. AI-generated text (the model's interpretation, questions and
// hints) is data, not UI copy, and is never in the dictionary.

export const en = {
  app: {
    name: "Yaffle",
  },

  units: {
    kcal: "kcal",
    g: "g",
  },

  common: {
    undo: "Undo",
    delete: "Delete",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    back: "Back",
    soon: "Soon",
  },

  header: {
    settings: "Settings",
  },

  summary: {
    remaining: (kcal: string) => `Remaining: ${kcal}`,
    over: (kcal: string) => `Over: ${kcal}`,
    pctOfGoal: (pct: string, goal: string) => `${pct}% of ${goal} goal`,
    openSettings: "Open settings",
    statistics: "Statistics",
  },

  entryList: {
    emptyTitle: "Nothing logged yet",
    emptyBody: "What you log for this day shows up here.",
    edit: (label: string) => `Edit ${label}`,
    aiAssisted: "AI-assisted",
  },

  entryEditor: {
    deleteEntry: "Delete entry",
    cancel: "Cancel",
    saveChanges: "Save changes",
  },

  undoBar: {
    entryDeleted: "Entry deleted",
  },

  addCard: {
    placeholder: "What did you eat?",
    food: "Food",
    fillWithAi: "Fill with AI",
    calories: "Calories",
    addEntry: "Add entry",
    use: (label: string) => `Use ${label}`,
    aiOffline: "AI fill needs a connection.",
    aiLimit: "Daily AI limit reached — more tomorrow.",
    aiError: "Couldn't reach the AI — try again in a moment.",
    aiNoEstimate: "Couldn't estimate that — try rewording it.",
    aiHopeless: (hint: string) => `Can't estimate this one. ${hint}`,
  },

  aiZone: {
    estimating: "Estimating…",
    bestGuess: "Best guess — tap a dashed value to adjust.",
    dismissQuestion: "Dismiss question",
    dismissHint: "Dismiss hint",
  },

  macros: {
    // The macro names, keyed by the Entry field (ADR 0003). Used to build the
    // per-input aria-labels ("Protein grams"); the P/F/C letters on chips are
    // language-neutral and stay in the macro table (screens/main/macros.ts).
    protein: "Protein",
    fat: "Fat",
    carbs: "Carbs",
    grams: (macro: string) => `${macro} grams`,
  },

  sync: {
    attention: "Sign-in needed to sync your changes",
    pending: "Not synced — changes saved on this device",
    savedTitle: "Saved on this device",
    savedBody:
      "Your changes are saved on this device and sync automatically as soon as you’re back online — nothing is lost while you’re offline.",
  },

  settings: {
    title: "Settings",
    foodGlossary: "Food glossary",
    exportImport: "Export / import",
    dailyGoal: "Daily goal",
    dailyGoalAria: "Daily calorie goal",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    language: "Language",
    // Language names are endonyms — each shown in its own language, the same in
    // both dictionaries by convention, so the toggle reads the same everywhere.
    languageEnglish: "English",
    languageSpanish: "Español",
  },

  signIn: {
    signedInFallback: "Signed in",
    signOut: "Sign out",
    signInWithGoogle: "Sign in with Google",
    signInSubtitle: "Back up and sync across devices",
  },

  install: {
    installApp: "Install app",
    howTo: "How to",
    addToHomeScreen: "Add to home screen",
    iosTitle: "Install Yaffle",
    iosBody: "Add Yaffle to your home screen for a full-screen, offline-ready app.",
    iosStep1: (
      <>
        Tap the{" "}
        <span className="font-medium text-foreground">Share</span> button in
        Safari&rsquo;s toolbar.
      </>
    ),
    iosStep2: (
      <>
        Choose{" "}
        <span className="font-medium text-foreground">Add to Home Screen</span>.
      </>
    ),
  },

  onboarding: {
    intro:
      "Set a daily calorie goal to get started. You can change it any time in Settings.",
    dailyGoal: "Daily goal",
    dailyGoalAria: "Daily calorie goal",
    getStarted: "Get started",
  },

  glossary: {
    title: "Food glossary",
    search: "Search foods",
    emptyTitle: "No foods yet",
    emptyBody: "Foods you log show up here once you’ve added a few.",
    noMatchesTitle: "No matches",
    noMatchesBody: "No food matches that search.",
    mergedInto: (label: string) => `Merged into ${label}`,
    fallbackFood: "food",
    curate: (label: string) => `Curate ${label}`,
    // The Rate's display basis word: mass per 100 g, volume per 100 ml, a count
    // per single piece.
    basis: (kind: QuantityKind): string =>
      kind === "mass" ? "100 g" : kind === "volume" ? "100 ml" : "each",
    rateNone: "—",
    // The Glossary row's one-line kcal string: "78 kcal each" for a piece,
    // "380 kcal / 100 g" otherwise.
    rateLine: (kcal: string, kind: QuantityKind): string =>
      kind === "count"
        ? `${kcal} kcal each`
        : `${kcal} kcal / ${kind === "mass" ? "100 g" : "100 ml"}`,
    // The unit caption beside a Reading's kcal.
    kcalBasis: (kind: QuantityKind): string =>
      kind === "count" ? "kcal each" : `kcal / ${kind === "mass" ? "100 g" : "100 ml"}`,
  },

  productDetail: {
    readings: "Readings",
    noCalories: "No calories yet — enter a value",
    alsoKnownAs: "Also known as",
    unmerge: (label: string) => `Unmerge ${label}`,
    mergeIn: "Merge in…",
    deleteProduct: "Delete product",
    mergePrompt: (product: ReactNode) => (
      <>
        Pick a food to merge into <b>{product}</b>. Its entries and counts join
        this one.
      </>
    ),
    unpin: "Unpin",
    pinAsRate: "Pin as rate",
    editReading: "Edit reading",
    deleteReading: "Delete reading",
    caloriesPer: (basis: string) => `Calories per ${basis}`,
    gramsPer: (macro: string, basis: string) => `${macro} grams per ${basis}`,
    saveReading: "Save reading",
  },

  day: {
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
  },
}

export type Dictionary = typeof en
