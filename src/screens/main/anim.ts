// Motion tokens for the "space and fade" vocabulary (spec § Motion, ADR
// 0007): motion means making space — boxes animate their real size and
// neighbors translate; appearing content fades in place. Nothing ever
// stretches, so `layout` is only ever used as `layout="position"`.

// The one spring behind all space-making: box resizes, sibling reflow, the
// Day strip's selection pill, the undo snackbar's entrance. Tune the feel
// here, not in each component. (The summary ring uses its own slower spring;
// it is a different gesture.)
export const SPRING = { type: "spring", stiffness: 500, damping: 40 } as const

// Fade-through halves: leaving content goes quickly, arriving content lands
// calmly while the box settles. Used wherever content swaps inside a
// persistent card (FadeSwap) — never together with movement on the same
// element.
export const FADE_OUT = { duration: 0.08, ease: "easeIn" } as const
export const FADE_IN = { duration: 0.15, ease: "easeOut" } as const
