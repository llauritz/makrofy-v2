// Shared motion tokens, so the app's transitions feel like one system. This
// snappy spring drives the list add/remove/reflow, the week strip's selection
// ring, and the undo snackbar — tune the feel here, not in each component. (The
// summary ring uses its own slower spring; it is a different gesture.)
export const SPRING = { type: "spring", stiffness: 500, damping: 40 } as const
