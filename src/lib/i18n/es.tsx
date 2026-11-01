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
    edit: (label) => `Editar ${label}`,
    aiAssisted: "Con ayuda de IA",
  },

  coverage: {
    question: "¿Cuánto de lo que comiste quedó registrado?",
    some: "Algo",
    most: "La mayoría",
    everything: "Todo",
  },

  stats: {
    title: "Estadísticas",
    thisWeek: "Esta semana",
    thisWeekSub: "Calorías diarias · toca para el informe semanal",
    weekReport: "Informe semanal",
    goalLine: (goal) => `meta ${goal}`,
    now: "ahora",
    sevenDayAverage: "Media de 7 días",
    kcalPerDay: "kcal / día",
    trackedDaysOnly: "solo días registrados",
    vsWeekBefore: (pct) => `${pct}% vs semana anterior`,
    upOnWeekBefore: (pct) => `sube un ${pct}% respecto a la semana anterior`,
    downOnWeekBefore: (pct) => `baja un ${pct}% respecto a la semana anterior`,
    inRange: "En rango",
    daysUnit: "días",
    ofCount: (a, b) => `${a} de ${b}`,
    rangeBand: (lo, hi) => `${lo}–${hi} kcal (80–110% de la meta)`,
    rangeGateNote: "aparece tras una semana de registro casi diario",
    rangeGateBody: (assessable) =>
      `Aparece tras una semana de registro casi diario — ${assessable} de 7 días evaluables en esta ventana.`,
    daysInRange: (a, b) => `${a} de ${b} días en rango`,
    trend: "Tendencia",
    last30Days: "Últimos 30 días",
    legendDaily: "diario",
    legendAverage: "media de 7 días",
    macros: "Macros",
    macrosSub: "Reparto de calorías por día",
    untrackedNote: "Los días sin registro quedan fuera de las medias.",
    olderWeek: "Semana anterior",
    newerWeek: "Semana siguiente",
    kTick: (value) => `${value}k`,
    last7Days: "Últimos 7 días",
    inRangeShort: (a, b) => `${a} de ${b} en rango`,
    kcalAvg: "kcal de media",
    stripDeltaUp: (pct) => `↑ ${pct}% vs semana anterior`,
    stripDeltaDown: (pct) => `↓ ${pct}% vs semana anterior`,
    dismissStrip: "Ocultar hasta mañana",
    nudgeQuestion: (day) => `${day} — ¿cuánto quedó registrado?`,
    chartDay: "Día",
    chartKcal: "kcal",
    chartValueGap: "sin registro",
    chartValueApprox: (kcal) => `aproximadamente ${kcal}`,
    chartValueExcluded: "excluido (cobertura: Algo)",
    chartValueToday: (kcal) => `${kcal} hasta ahora hoy`,
    macroShareRow: (p, f, c) =>
      `proteína ${p}%, grasa ${f}%, carbohidratos ${c}%`,
    dotIn: "en rango",
    dotOut: "fuera de rango",
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
    aiError:
      "No se pudo contactar con la IA — inténtalo de nuevo en un momento.",
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

  cloud: {
    syncData: "Sincronizar",
    loginAgain: "Iniciar sesión",
    offAria: "Sincronización desactivada. Abrir ajustes",
    offlineAria:
      "Sin conexión, los cambios se guardan en este dispositivo. Abrir ajustes",
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
    legalLinks: "Legal",
    terms: "Términos",
    privacy: "Privacidad",
    refunds: "Reembolsos",
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

  backup: {
    export: "Exportar datos",
    exportHint: "Descargar",
    import: "Importar datos",
    importHint: "Restaurar",
    previewTitle: "Importar copia",
    previewBody:
      "Restaura tu objetivo, la cobertura de días y el glosario de alimentos, y añade las entradas que aún no estén en tu registro.",
    newEntries: (count: string) => `${count} entradas por añadir`,
    duplicatesSkipped: (count: string) =>
      `${count} ya en el registro — omitidas`,
    confirm: "Importar",
    cancel: "Cancelar",
    invalidFile: "Ese archivo no es una copia de Yaffle.",
    importing: "Importando…",
    doneTitle: "Importación completa",
    doneBody: (count: string) =>
      `Se añadieron ${count} entradas a tu registro.`,
    done: "Listo",
  },

  onboarding: {
    headline: "Cuenta calorías a tu manera",
    points: [
      {
        title: "Escribe lo que sabes",
        body: "Alimento y cantidad, en cualquier unidad. Sin buscar en una base de datos.",
      },
      {
        title: "La IA completa el resto",
        body: "Las calorías y macros que falten se estiman.",
      },
      {
        title: "Recuerda tus comidas",
        body: "Escribe otra cantidad y recalcula a partir de lo que ya apuntaste.",
      },
    ],
    exampleLabel: "100g yogur griego aldi",
    exampleAria: "Ejemplo: 100 g de yogur griego, 120 kcal, completado por Yaffle",
    getStarted: "Empezar",

    back: "Atrás",
    goalTitle: "Objetivo diario",
    goalSubtitle: "Puedes cambiarlo luego en Ajustes.",
    dailyGoalAria: "Objetivo diario de calorías",
    decrease: (step: number) => `Bajar el objetivo ${step} kcal`,
    increase: (step: number) => `Subir el objetivo ${step} kcal`,
    calculate: "Calcular cuánto necesito",
    startTracking: "Empezar a registrar",

    needTitle: "Lo que necesitas al día",
    detailsNote: "Tus datos no se guardan.",
    sex: "Sexo",
    female: "Mujer",
    male: "Hombre",
    otherSex: "Otro",
    age: "Edad",
    years: "años",
    height: "Altura",
    weight: "Peso",
    cm: "cm",
    kg: "kg",
    activity: "Actividad",
    activityLow: "Poco activa",
    activityModerate: "Activa",
    activityHigh: "Muy activa",
    activityHintLow: "Trabajo sentado y poco ejercicio.",
    activityHintModerate: "Mucho tiempo de pie, o ejercicio 2–3 veces por semana.",
    activityHintHigh: "Trabajo físico, o ejercicio casi todos los días.",
    aim: "Objetivo",
    lose: "Bajar",
    maintain: "Mantener",
    gain: "Subir",
    calculateButton: "Calcular",
    maintenance: (kcal: string) =>
      `Con unas ${kcal} kcal al día mantienes tu peso.`,
    howFast: "¿A qué ritmo?",
    losePace: (kg: string) => `${kg} kg menos por semana`,
    gainPace: (kg: string) => `${kg} kg más por semana`,
    useGoal: (kcal: string) => `Usar ${kcal} kcal`,
    changeDetails: "Cambiar datos",
    estimateNote: "Una estimación aproximada, no un consejo médico.",
  },

  glossary: {
    title: "Glosario de alimentos",
    search: "Buscar alimentos",
    emptyTitle: "Aún no hay alimentos",
    emptyBody:
      "Los alimentos que registres aparecen aquí cuando añadas algunos.",
    noMatchesTitle: "Sin coincidencias",
    noMatchesBody: "Ningún alimento coincide con esa búsqueda.",
    mergedInto: (label) => `Fusionado en ${label}`,
    fallbackFood: "alimento",
    curate: (label) => `Editar ${label}`,
    basis: (kind) => BASIS[kind],
    rateNone: "—",
    rateLine: (kcal, kind) =>
      kind === "count"
        ? `${kcal} kcal por unidad`
        : `${kcal} kcal / ${BASIS[kind]}`,
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

  paywall: {
    planFree: "Gratis",
    planPro: "Pro",
    planUnlimited: "Ilimitado",
    titleExhaustedFree: "Ese fue tu último relleno con IA gratis",
    bodyExhaustedFree:
      "El relleno con IA busca lo que comiste con la Búsqueda de Google y completa los números. Pro e Ilimitado incluyen más rellenos.",
    titleExhaustedPro: "Usaste los rellenos de este ciclo",
    bodyExhaustedPro: (date) =>
      `Pro se recarga el ${date}. Ilimitado incluye más rellenos.`,
    titleBrowseFree: "Más rellenos con IA",
    bodyBrowseFree: (left, limit) =>
      `El relleno con IA busca lo que comiste con la Búsqueda de Google y completa los números. Te quedan ${left} de ${limit} rellenos gratis.`,
    titleBrowsePaid: "Tu plan",
    bodyBrowsePaid: (date) => `Tus rellenos con IA se recargan el ${date}.`,
    billing: "Facturación",
    billingAnnual: "Anual",
    billingMonthly: "Mensual",
    save: (pct) => `Ahorra un ${pct}%`,
    freeLine: (limit) => `${limit} rellenos con IA gratis`,
    paidLine: (limit) => `${limit} rellenos / 30 días`,
    supportsDev: "Apoya el desarrollo",
    bestValue: "Mejor valor",
    currentPlan: "Tu plan",
    perMonth: (price) => `${price}/mes`,
    billedYearly: (price) => `${price} al año`,
    billedMonthly: "facturado cada mes",
    continueWith: (plan) => `Continuar con ${plan}`,
    checkoutStub: "El pago aún no está configurado.",
    billingError: "No funcionó. Revisa tu conexión y vuelve a intentarlo.",
    footnote: "Cancela cuando quieras",
    usageMeter: (used, limit) =>
      `${used}/${limit} rellenos con IA gratis usados`,
    exhaustedFree: (limit) => `Usaste los ${limit} rellenos con IA gratis.`,
    exhaustedPro: (limit, date) =>
      `Usaste los ${limit} rellenos con IA de este ciclo. Más el ${date}.`,
    exhaustedUnlimited: (limit, date) =>
      `Llegaste al límite de uso razonable de ${limit} rellenos con IA. Más el ${date}.`,
    seePlans: "Ver planes",
    getUnlimited: "Obtener Ilimitado",
    aiFill: "Relleno con IA",
    freeStatus: (left, limit) => `Te quedan ${left} de ${limit} gratis`,
    proStatus: (left, limit, date) =>
      `Te quedan ${left} de ${limit} · se recarga el ${date}`,
    unlimitedStatus: (used, date) =>
      `${used} rellenos este ciclo · se recarga el ${date}`,
    pastDueStatus: "El pago falló. Actualiza la tarjeta en Gestionar.",
    endingStatus: (left, date) => `Te quedan ${left} · termina el ${date}`,
    upgrade: "Mejorar",
    manage: "Gestionar",
    noticeTitle: "El relleno con IA ahora tiene planes",
    noticeBody: (limit) =>
      `Todos tienen ${limit} rellenos con IA gratis. Pro e Ilimitado incluyen más y apoyan el desarrollo de Yaffle. Todo lo demás en Yaffle sigue siendo gratis.`,
    noticeDismiss: "Entendido",
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
