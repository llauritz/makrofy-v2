import type { Dictionary } from "./en"

// The display-basis word per Quantity kind ("each" reads as "Stück" here),
// shared by the three glossary rate helpers so a unit reads the same everywhere.
const BASIS = {
  mass: "100 g",
  volume: "100 ml",
  count: "Stück",
} as const

// German typesetting puts a (non-breaking) space between a number and "%".
const PCT = " %"

// The German dictionary. Mirrors en.tsx exactly — the `: Dictionary` annotation
// makes any missing key, extra key or wrong function signature a compile error.
// English is the source of truth; this is a full pass over every user-facing
// string.
//
// Register: informal "du" (lowercase, as most consumer apps write it), plain and
// factual. "AI fill" is "KI-Abfrage" as the counted unit and feature name; the
// button that runs one reads "Mit KI ausfüllen". "Plan" is "Tarif". Spaced en
// dashes (" – ") stand where English uses em dashes.

export const de: Dictionary = {
  app: {
    name: "Yaffle",
  },

  units: {
    kcal: "kcal",
    g: "g",
  },

  common: {
    undo: "Rückgängig",
    delete: "Löschen",
    cancel: "Abbrechen",
    save: "Speichern",
    close: "Schließen",
    back: "Zurück",
    soon: "Bald",
  },

  header: {
    settings: "Einstellungen",
  },

  summary: {
    remaining: (kcal) => `Übrig: ${kcal}`,
    over: (kcal) => `Überschritten: ${kcal}`,
    pctOfGoal: (pct, goal) => `${pct}${PCT} von ${goal} kcal`,
    openSettings: "Einstellungen öffnen",
    statistics: "Statistik",
  },

  entryList: {
    emptyTitle: "Noch nichts eingetragen",
    edit: (label) => `${label} bearbeiten`,
    aiAssisted: "Mit KI",
  },

  coverage: {
    question: "Wie viel von dem, was du gegessen hast, steht im Tagebuch?",
    some: "Etwas",
    most: "Das meiste",
    everything: "Alles",
  },

  stats: {
    title: "Statistik",
    thisWeek: "Diese Woche",
    thisWeekSub: "Kalorien pro Tag · tippen für den Wochenbericht",
    weekReport: "Wochenbericht",
    goalLine: (goal) => `Ziel ${goal}`,
    now: "jetzt",
    sevenDayAverage: "7-Tage-Schnitt",
    kcalPerDay: "kcal / Tag",
    trackedDaysOnly: "nur erfasste Tage",
    vsWeekBefore: (pct) => `${pct}${PCT} ggü. Vorwoche`,
    upOnWeekBefore: (pct) => `${pct}${PCT} mehr als in der Vorwoche`,
    downOnWeekBefore: (pct) => `${pct}${PCT} weniger als in der Vorwoche`,
    inRange: "Im Zielbereich",
    daysUnit: "Tage",
    ofCount: (a, b) => `${a} von ${b}`,
    rangeBand: (lo, hi) => `${lo}–${hi} kcal (80–110${PCT} des Ziels)`,
    rangeGateNote: "erscheint nach einer Woche fast täglicher Einträge",
    rangeGateBody: (assessable) =>
      `Erscheint nach einer Woche fast täglicher Einträge – ${assessable} von 7 Tagen in diesem Zeitraum auswertbar.`,
    daysInRange: (a, b) => `${a} von ${b} Tagen im Zielbereich`,
    trend: "Verlauf",
    last30Days: "Letzte 30 Tage",
    legendDaily: "täglich",
    legendAverage: "7-Tage-Schnitt",
    macros: "Makros",
    macrosSub: "Kalorienanteil pro Tag",
    untrackedNote: "Tage ohne Einträge zählen nicht zum Schnitt.",
    olderWeek: "Frühere Woche",
    newerWeek: "Spätere Woche",
    kTick: (value) => `${value}k`,
    last7Days: "Letzte 7 Tage",
    inRangeShort: (a, b) => `${a} von ${b} im Zielbereich`,
    kcalAvg: "kcal im Schnitt",
    stripDeltaUp: (pct) => `↑ ${pct}${PCT} ggü. Vorwoche`,
    stripDeltaDown: (pct) => `↓ ${pct}${PCT} ggü. Vorwoche`,
    dismissStrip: "Bis morgen ausblenden",
    nudgeQuestion: (day) => `${day} – wie viel steht im Tagebuch?`,
    chartDay: "Tag",
    chartKcal: "kcal",
    chartValueGap: "nicht erfasst",
    chartValueApprox: (kcal) => `etwa ${kcal}`,
    chartValueExcluded: "nicht gezählt (im Tagebuch: Etwas)",
    chartValueToday: (kcal) => `${kcal} bisher heute`,
    macroShareRow: (p, f, c) =>
      `Eiweiß ${p}${PCT}, Fett ${f}${PCT}, Kohlenhydrate ${c}${PCT}`,
    dotIn: "im Zielbereich",
    dotOut: "außerhalb des Zielbereichs",
  },

  entryEditor: {
    deleteEntry: "Eintrag löschen",
    cancel: "Abbrechen",
    saveChanges: "Änderungen speichern",
  },

  undoBar: {
    entryDeleted: "Eintrag gelöscht",
  },

  addCard: {
    placeholder: "Was hast du gegessen?",
    food: "Lebensmittel",
    fillWithAi: "Mit KI ausfüllen",
    calories: "Kalorien",
    addEntry: "Eintrag hinzufügen",
    use: (label) => `${label} übernehmen`,
    aiOffline: "Für die KI-Abfrage brauchst du eine Verbindung.",
    aiLimit: "Tageslimit für KI erreicht – morgen geht es weiter.",
    aiError: "Die KI ist gerade nicht erreichbar – versuch es gleich noch einmal.",
    aiNoEstimate: "Dafür gibt es keine Schätzung – versuch es anders zu formulieren.",
    aiHopeless: (hint) => `Das lässt sich nicht schätzen. ${hint}`,
  },

  aiZone: {
    estimating: "Wird geschätzt…",
    bestGuess: "Beste Schätzung – tippe auf einen gestrichelten Wert, um ihn anzupassen.",
    dismissQuestion: "Frage ausblenden",
    dismissHint: "Hinweis ausblenden",
    dismissNote: "Notiz ausblenden",
  },

  macros: {
    protein: "Eiweiß",
    fat: "Fett",
    carbs: "Kohlenhydrate",
    grams: (macro) => `${macro} in Gramm`,
  },

  cloud: {
    syncData: "Synchronisieren",
    loginAgain: "Neu anmelden",
    offAria: "Synchronisierung aus. Einstellungen öffnen",
    offlineAria:
      "Offline, Änderungen sind auf diesem Gerät gespeichert. Einstellungen öffnen",
  },

  settings: {
    title: "Einstellungen",
    foodGlossary: "Lebensmittelliste",
    exportImport: "Export / Import",
    dailyGoal: "Tagesziel",
    dailyGoalAria: "Tägliches Kalorienziel",
    theme: "Design",
    themeSystem: "System",
    themeLight: "Hell",
    themeDark: "Dunkel",
    language: "Sprache",
    languageEnglish: "English",
    languageSpanish: "Español",
    languageGerman: "Deutsch",
    legalLinks: "Rechtliches",
    pricing: "Preise",
    terms: "AGB",
    privacy: "Datenschutz",
    refunds: "Erstattung",
  },

  signIn: {
    signedInFallback: "Angemeldet",
    signOut: "Abmelden",
    signInWithGoogle: "Mit Google anmelden",
    signInSubtitle: "Sichern und auf allen Geräten synchronisieren",
  },

  install: {
    iosTitle: "Yaffle installieren",
    iosBody:
      "Leg Yaffle auf deinen Home-Bildschirm. Dann öffnet es im Vollbild und funktioniert auch offline.",
    iosStep1: (
      <>
        Tippe in der Symbolleiste des Browsers auf{" "}
        <span className="font-medium text-foreground">Teilen</span>. In Safari
        unter iOS 26 öffnest du vorher das Menü{" "}
        <span className="font-medium text-foreground">&middot;&middot;&middot;</span>.
      </>
    ),
    iosStep2: (
      <>
        Scrolle nach unten und wähle{" "}
        <span className="font-medium text-foreground">Zum Home-Bildschirm</span>.
      </>
    ),
    iosStep3: (
      <>
        Tippe auf{" "}
        <span className="font-medium text-foreground">Hinzufügen</span>.
      </>
    ),
    cardTitle: "Zum Home-Bildschirm",
    cardBody: "Öffnet im Vollbild.",
    cardInstall: "Installieren",
    cardShowHow: "Anleitung",
    cardDismiss: "Ausblenden",
  },

  backup: {
    export: "Daten exportieren",
    exportHint: "Herunterladen",
    import: "Daten importieren",
    importHint: "Wiederherstellen",
    previewTitle: "Sicherung importieren",
    previewBody:
      "Stellt dein Ziel, die Angaben pro Tag und die Lebensmittelliste wieder her und fügt alle Einträge hinzu, die noch nicht im Tagebuch stehen.",
    newEntries: (count: string) => `${count} Einträge kommen hinzu`,
    duplicatesSkipped: (count: string) =>
      `${count} schon eingetragen – übersprungen`,
    confirm: "Importieren",
    cancel: "Abbrechen",
    invalidFile: "Diese Datei ist keine Yaffle-Sicherung.",
    importing: "Wird importiert…",
    doneTitle: "Import abgeschlossen",
    doneBody: (count: string) =>
      `${count} Einträge zu deinem Tagebuch hinzugefügt.`,
    done: "Fertig",
  },

  onboarding: {
    headline: "Kalorien zählen, wie es dir passt",
    points: [
      {
        title: "Schreib, was du weißt",
        body: "Lebensmittel und Menge, in jeder Einheit. Keine Datenbank, die du durchsuchen oder pflegen musst.",
      },
      {
        title: "Die KI ergänzt den Rest",
        body: "Lass die KI Kalorien und Makros nachschlagen oder schätzen.",
      },
      {
        title: "Merkt sich deine Lebensmittel",
        body: "Bei einer neuen Menge rechnet Yaffle die Werte aus deinen früheren Einträgen um.",
      },
    ],
    exampleLabel: "100g joghurt aldi",
    exampleAria:
      "Beispiel: 100 g Joghurt, 120 kcal, von Yaffle ausgefüllt",
    getStarted: "Loslegen",

    back: "Zurück",
    goalTitle: "Tagesziel",
    goalSubtitle: "Du kannst es später in den Einstellungen ändern.",
    dailyGoalAria: "Tägliches Kalorienziel",
    decrease: (step: number) => `Ziel um ${step} kcal senken`,
    increase: (step: number) => `Ziel um ${step} kcal erhöhen`,
    calculate: "Tagesbedarf berechnen",
    startTracking: "Starten",

    needTitle: "Dein Tagesbedarf",
    detailsNote: "Deine Angaben werden nicht gespeichert.",
    sex: "Geschlecht",
    female: "Weiblich",
    male: "Männlich",
    otherSex: "Divers",
    age: "Alter",
    years: "Jahre",
    height: "Größe",
    weight: "Gewicht",
    cm: "cm",
    kg: "kg",
    activity: "Aktivität",
    activityLow: "Wenig aktiv",
    activityModerate: "Aktiv",
    activityHigh: "Sehr aktiv",
    activityHintLow: "Bürojob und wenig Sport.",
    activityHintModerate: "Viel auf den Beinen oder zwei- bis dreimal pro Woche Sport.",
    activityHintHigh: "Körperliche Arbeit oder an den meisten Tagen Sport.",
    aim: "Ziel",
    lose: "Abnehmen",
    maintain: "Halten",
    gain: "Zunehmen",
    calculateButton: "Berechnen",
    maintenance: (kcal: string) =>
      `Mit etwa ${kcal} kcal am Tag hältst du dein Gewicht.`,
    howFast: "Wie schnell?",
    losePace: (kg: string) => `${kg} kg weniger pro Woche`,
    gainPace: (kg: string) => `${kg} kg mehr pro Woche`,
    useGoal: (kcal: string) => `${kcal} kcal übernehmen`,
    changeDetails: "Angaben ändern",
    estimateNote: "Eine grobe Schätzung, keine medizinische Beratung.",
  },

  glossary: {
    title: "Lebensmittelliste",
    search: "Lebensmittel suchen",
    emptyTitle: "Noch keine Lebensmittel",
    emptyBody:
      "Was du einträgst, erscheint hier, sobald ein paar Lebensmittel zusammengekommen sind.",
    noMatchesTitle: "Keine Treffer",
    noMatchesBody: "Kein Lebensmittel passt zu dieser Suche.",
    mergedInto: (label) => `Zusammengeführt mit ${label}`,
    fallbackFood: "Lebensmittel",
    curate: (label) => `${label} bearbeiten`,
    basis: (kind) => BASIS[kind],
    rateNone: "—",
    rateLine: (kcal, kind) =>
      kind === "count"
        ? `${kcal} kcal pro Stück`
        : `${kcal} kcal / ${BASIS[kind]}`,
    kcalBasis: (kind) =>
      kind === "count" ? "kcal pro Stück" : `kcal / ${BASIS[kind]}`,
  },

  productDetail: {
    readings: "Werte",
    noCalories: "Noch keine Kalorien – gib einen Wert ein",
    alsoKnownAs: "Auch eingetragen als",
    unmerge: (label) => `${label} wieder trennen`,
    mergeIn: "Zusammenführen…",
    deleteProduct: "Lebensmittel löschen",
    mergePrompt: (product) => (
      <>
        Wähle ein Lebensmittel, das in <b>{product}</b> aufgehen soll. Seine
        Einträge und Zähler kommen hier dazu.
      </>
    ),
    unpin: "Nicht mehr festlegen",
    pinAsRate: "Als Standardwert festlegen",
    editReading: "Wert bearbeiten",
    deleteReading: "Wert löschen",
    caloriesPer: (basis) => `Kalorien pro ${basis}`,
    gramsPer: (macro, basis) => `${macro} in Gramm pro ${basis}`,
    saveReading: "Wert speichern",
  },

  paywall: {
    planFree: "Kostenlos",
    planPro: "Pro",
    planUnlimited: "Unbegrenzt",
    titleExhaustedFree: "Das war deine letzte kostenlose KI-Abfrage",
    bodyExhaustedFree:
      "Die KI-Abfrage sucht mit der Google-Suche nach dem, was du gegessen hast, und trägt die Werte ein. Pro und Unbegrenzt enthalten mehr Abfragen.",
    titleExhaustedPro: "Die Abfragen für diesen Zeitraum sind aufgebraucht",
    bodyExhaustedPro: (date) =>
      `Pro wird am ${date} wieder aufgefüllt. Unbegrenzt enthält mehr Abfragen.`,
    titleBrowseFree: "Mehr KI-Abfragen",
    bodyBrowseFree: (left, limit) =>
      `Die KI-Abfrage sucht mit der Google-Suche nach dem, was du gegessen hast, und trägt die Werte ein. Noch ${left} von ${limit} kostenlosen Abfragen übrig.`,
    titleBrowsePaid: "Dein Tarif",
    bodyBrowsePaid: (date) =>
      `Deine KI-Abfragen werden am ${date} wieder aufgefüllt.`,
    billing: "Abrechnung",
    billingAnnual: "Jährlich",
    billingMonthly: "Monatlich",
    save: (pct) => `bis −${pct}${PCT}`,
    freeLine: (limit) => `${limit} kostenlose KI-Abfragen`,
    paidLine: (limit) => `${limit} Abfragen / 30\u00a0Tage`,
    supportsDev: "Unterstützt Yaffle",
    bestValue: "Empfohlen",
    currentPlan: "Dein Tarif",
    perMonth: (price) => `${price}/Monat`,
    billedYearly: (price) => `${price} pro Jahr`,
    billedMonthly: "monatlich abgerechnet",
    continueWith: (plan) => `Weiter mit ${plan}`,
    switchTo: (plan) => `Zu ${plan} wechseln`,
    chargeNow: (amount) =>
      `Du zahlst jetzt ${amount} für den Rest dieses Zeitraums.`,
    creditNow: (amount) =>
      `${amount} für die ungenutzte Zeit werden mit deinen nächsten Zahlungen verrechnet.`,
    manageBilling: "Zahlung und Kündigung",
    checkoutStub: "Die Bezahlung ist noch nicht eingerichtet.",
    billingError:
      "Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.",
    footnote: "Inkl. MwSt. · Jederzeit kündbar",
    usageMeter: (used, limit) =>
      `${used}/${limit} kostenlose KI-Abfragen genutzt`,
    exhaustedFree: (limit) =>
      `Du hast alle ${limit} kostenlosen KI-Abfragen genutzt.`,
    exhaustedPro: (limit, date) =>
      `Du hast die ${limit} KI-Abfragen dieses Zeitraums genutzt. Neue gibt es am ${date}.`,
    exhaustedUnlimited: (limit, date) =>
      `Du hast die Fair-Use-Grenze von ${limit} KI-Abfragen erreicht. Neue gibt es am ${date}.`,
    seePlans: "Tarife ansehen",
    getUnlimited: "Unbegrenzt wählen",
    aiFill: "KI-Abfragen",
    freeStatus: (left, limit) => `${left} von ${limit} kostenlos übrig`,
    proStatus: (left, limit, date) =>
      `${left} von ${limit} übrig · neue am ${date}`,
    unlimitedStatus: (used, date) =>
      `${used} in diesem Zeitraum · neue am ${date}`,
    pastDueStatus:
      "Zahlung fehlgeschlagen. Aktualisiere deine Karte unter Verwalten.",
    endingStatus: (left, date) => `${left} übrig · endet am ${date}`,
    upgrade: "Upgrade",
    manage: "Verwalten",
    noticeTitle: "Für KI-Abfragen gibt es jetzt Tarife",
    noticeBody: (limit) =>
      `Alle bekommen ${limit} kostenlose KI-Abfragen. Pro und Unbegrenzt enthalten mehr und unterstützen die Entwicklung von Yaffle. Alles andere in Yaffle bleibt kostenlos.`,
    noticeDismiss: "Verstanden",
  },

  day: {
    today: "Heute",
    yesterday: "Gestern",
    tomorrow: "Morgen",
  },

  calendar: {
    openCalendar: "Kalender öffnen",
    openCalendarOn: (date) => `Kalender öffnen, ${date}`,
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
  },
}
