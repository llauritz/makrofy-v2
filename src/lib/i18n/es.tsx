import type { Dictionary } from "./en"

// The display-basis word per Quantity kind ("cada uno" reads as "unidad" here),
// shared by the three glossary rate helpers so a unit reads the same everywhere.
const BASIS = {
  mass: "100 g",
  volume: "100 ml",
  count: "unidad",
} as const

// The Spanish dictionary. Mirrors en.tsx exactly — the `: Dictionary` annotation
// makes any missing key, extra key or wrong function signature a compile error,
// so the two languages can never drift. English is the source of truth; this is
// a full pass over every user-facing string (spec § i18n, issue #25).

export const es: Dictionary = {
  app: {
    name: "Yaffle",
  },

  units: {
    kcal: "kcal",
    g: "g",
  },

  common: {
    undo: "Deshacer",
    delete: "Eliminar",
    cancel: "Cancelar",
    save: "Guardar",
    close: "Cerrar",
    back: "Atrás",
    soon: "Pronto",
  },

  header: {
    settings: "Ajustes",
  },

  summary: {
    remaining: (kcal) => `Restante: ${kcal}`,
    over: (kcal) => `Excedido: ${kcal}`,
    pctOfGoal: (pct, goal) => `${pct} % del objetivo de ${goal}`,
    openSettings: "Abrir ajustes",
    statistics: "Estadísticas",
  },

  entryList: {
    emptyTitle: "Nada registrado aún",
    emptyBody: "Lo que registres para este día aparece aquí.",
    edit: (label) => `Editar ${label}`,
    aiAssisted: "Con ayuda de IA",
  },

  entryEditor: {
    deleteEntry: "Eliminar entrada",
    cancel: "Cancelar",
    saveChanges: "Guardar cambios",
  },

  undoBar: {
    entryDeleted: "Entrada eliminada",
  },

  addCard: {
    placeholder: "¿Qué comiste?",
    food: "Comida",
    fillWithAi: "Rellenar con IA",
    calories: "Calorías",
    addEntry: "Añadir entrada",
    use: (label) => `Usar ${label}`,
    aiOffline: "El relleno con IA necesita conexión.",
    aiLimit: "Límite diario de IA alcanzado — más mañana.",
    aiError: "No se pudo contactar con la IA — inténtalo de nuevo en un momento.",
    aiNoEstimate: "No se pudo estimar eso — prueba a reformularlo.",
    aiHopeless: (hint) => `No se puede estimar esto. ${hint}`,
  },

  aiZone: {
    estimating: "Estimando…",
    bestGuess: "Mejor estimación — toca un valor punteado para ajustarlo.",
    dismissQuestion: "Descartar pregunta",
    dismissHint: "Descartar sugerencia",
    dismissNote: "Descartar nota",
  },

  macros: {
    protein: "Proteínas",
    fat: "Grasas",
    carbs: "Carbohidratos",
    grams: (macro) => `Gramos de ${macro.toLowerCase()}`,
  },

  sync: {
    attention: "Necesitas iniciar sesión para sincronizar tus cambios",
    pending: "Sin sincronizar — los cambios se guardan en este dispositivo",
    savedTitle: "Guardado en este dispositivo",
    savedBody:
      "Tus cambios se guardan en este dispositivo y se sincronizan automáticamente en cuanto vuelvas a estar en línea — no se pierde nada mientras estás sin conexión.",
  },

  settings: {
    title: "Ajustes",
    foodGlossary: "Glosario de alimentos",
    exportImport: "Exportar / importar",
    dailyGoal: "Objetivo diario",
    dailyGoalAria: "Objetivo diario de calorías",
    theme: "Tema",
    themeSystem: "Sistema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    language: "Idioma",
    languageEnglish: "English",
    languageSpanish: "Español",
  },

  signIn: {
    signedInFallback: "Sesión iniciada",
    signOut: "Cerrar sesión",
    signInWithGoogle: "Iniciar sesión con Google",
    signInSubtitle: "Haz copia de seguridad y sincroniza entre dispositivos",
  },

  install: {
    installApp: "Instalar app",
    howTo: "Cómo",
    addToHomeScreen: "Añadir a inicio",
    iosTitle: "Instala Yaffle",
    iosBody:
      "Añade Yaffle a tu pantalla de inicio para una app a pantalla completa y lista sin conexión.",
    iosStep1: (
      <>
        Toca el botón{" "}
        <span className="font-medium text-foreground">Compartir</span> en la
        barra de herramientas de Safari.
      </>
    ),
    iosStep2: (
      <>
        Elige{" "}
        <span className="font-medium text-foreground">
          Añadir a pantalla de inicio
        </span>
        .
      </>
    ),
  },

  onboarding: {
    intro:
      "Fija un objetivo diario de calorías para empezar. Puedes cambiarlo cuando quieras en Ajustes.",
    dailyGoal: "Objetivo diario",
    dailyGoalAria: "Objetivo diario de calorías",
    getStarted: "Empezar",
  },

  glossary: {
    title: "Glosario de alimentos",
    search: "Buscar alimentos",
    emptyTitle: "Aún no hay alimentos",
    emptyBody: "Los alimentos que registres aparecen aquí cuando añadas algunos.",
    noMatchesTitle: "Sin coincidencias",
    noMatchesBody: "Ningún alimento coincide con esa búsqueda.",
    mergedInto: (label) => `Fusionado en ${label}`,
    fallbackFood: "alimento",
    curate: (label) => `Editar ${label}`,
    basis: (kind) => BASIS[kind],
    rateNone: "—",
    rateLine: (kcal, kind) =>
      kind === "count" ? `${kcal} kcal por unidad` : `${kcal} kcal / ${BASIS[kind]}`,
    kcalBasis: (kind) =>
      kind === "count" ? "kcal por unidad" : `kcal / ${BASIS[kind]}`,
  },

  productDetail: {
    readings: "Lecturas",
    noCalories: "Sin calorías aún — introduce un valor",
    alsoKnownAs: "También conocido como",
    unmerge: (label) => `Separar ${label}`,
    mergeIn: "Fusionar…",
    deleteProduct: "Eliminar producto",
    mergePrompt: (product) => (
      <>
        Elige un alimento para fusionar en <b>{product}</b>. Sus entradas y usos
        se suman a este.
      </>
    ),
    unpin: "Desfijar",
    pinAsRate: "Fijar como tasa",
    editReading: "Editar lectura",
    deleteReading: "Eliminar lectura",
    caloriesPer: (basis) => `Calorías por ${basis}`,
    gramsPer: (macro, basis) => `Gramos de ${macro.toLowerCase()} por ${basis}`,
    saveReading: "Guardar lectura",
  },

  day: {
    today: "Hoy",
    yesterday: "Ayer",
    tomorrow: "Mañana",
  },

  calendar: {
    openCalendar: "Abrir calendario",
    openCalendarOn: (date) => `Abrir calendario, ${date}`,
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
  },
}
