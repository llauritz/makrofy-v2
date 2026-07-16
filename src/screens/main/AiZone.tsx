import * as React from "react"
import { X } from "lucide-react"
import { motion } from "motion/react"

import { FadeSwap } from "./FadeSwap"

// The AI's half of the add card's response zone (spec § Add flow: one zone
// below the P/F/C pills hosts everything reactive). Every state the AI can be
// in surfaces here — thinking, interpretation + flag help + attribution,
// the one clarifying question with its answer chips, hints — swapped through
// FadeSwap so the card makes space and content fades, never jumps (§ Motion).

/** What the zone is showing. AddCard derives this from its AI state. */
export type AiZoneState =
  | { kind: "empty" }
  | { kind: "thinking" }
  /** An applied fill: the AI's interpretation, with flag help while Flagged values remain. */
  | { kind: "filled"; interpretation: string; anyFlagged: boolean }
  /** The ambiguous tier: exactly one question; a chip answer is the final round trip. */
  | { kind: "question"; question: string; chips: string[] }
  /** Hopeless refusals, offline / quota / failed-call notes — one quiet line. */
  | { kind: "hint"; hint: string }

export function AiZone({
  state,
  attribution,
  onAnswer,
  onDismiss,
}: {
  state: AiZoneState
  /** Google Search Suggestions HTML — rendered whenever present (compliance). */
  attribution: string | null
  onAnswer: (chip: string) => void
  onDismiss: () => void
}) {
  return (
    <FadeSwap swapKey={swapKeyOf(state)}>
      <div aria-live="polite">
        <ZoneContent state={state} onAnswer={onAnswer} onDismiss={onDismiss} />
        {state.kind !== "empty" && attribution && (
          <GoogleSearchSuggestions html={attribution} />
        )}
      </div>
    </FadeSwap>
  )
}

// Content-aware swap key: same-kind states with different words (an offline
// note replaced by a quota note, a fresh interpretation) still fade-through
// (spec § Motion) instead of the text snapping in place.
function swapKeyOf(state: AiZoneState): string {
  switch (state.kind) {
    case "filled":
      return `filled:${state.anyFlagged}:${state.interpretation}`
    case "question":
      return `question:${state.question}`
    case "hint":
      return `hint:${state.hint}`
    default:
      return state.kind
  }
}

function ZoneContent({
  state,
  onAnswer,
  onDismiss,
}: {
  state: AiZoneState
  onAnswer: (chip: string) => void
  onDismiss: () => void
}) {
  switch (state.kind) {
    case "empty":
      return null
    case "thinking":
      return <InfoRow>Estimating…</InfoRow>
    case "filled":
      return (
        <InfoRow>
          <span className="truncate">{state.interpretation}</span>
          {state.anyFlagged && (
            <span>Best guess — tap a dashed value to adjust.</span>
          )}
        </InfoRow>
      )
    case "question":
      return (
        // pt-2 padding, never margin: FadeSwap measures its children's box,
        // and a margin would collapse out of it and clip the zone.
        <div className="pt-2">
          <div className="rounded-2xl bg-input px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm">{state.question}</span>
              <DismissButton label="Dismiss question" onDismiss={onDismiss} />
            </div>
            {state.chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {state.chips.map((chip) => (
                  <motion.button
                    key={chip}
                    type="button"
                    onClick={() => onAnswer(chip)}
                    whileTap={{ scale: 0.95 }}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium"
                  >
                    {chip}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    case "hint":
      return (
        <div className="pt-2">
          <div className="flex items-start justify-between gap-2 rounded-2xl bg-input px-4 py-3">
            <span className="text-sm text-muted-foreground">{state.hint}</span>
            <DismissButton label="Dismiss hint" onDismiss={onDismiss} />
          </div>
        </div>
      )
  }
}

// The quiet one-liner under the pills (thinking, interpretation, flag help).
// pt-2 padding, never margin — margins would collapse out of FadeSwap's
// measured box and clip the zone.
function InfoRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 pt-2 text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}

function DismissButton({
  label,
  onDismiss,
}: {
  label: string
  onDismiss: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onDismiss}
      className="mt-0.5 shrink-0 text-[#a5988a]"
    >
      <X className="h-4 w-4" />
    </button>
  )
}

// The Google Search Suggestions payload (groundingMetadata.searchEntryPoint
// .renderedContent) — Google's terms require displaying it as provided when a
// response is grounded, so it lands verbatim: Google-authored HTML+CSS, no
// restyling. It arrives from the AI Logic proxy, not from user content.
function GoogleSearchSuggestions({ html }: { html: string }) {
  return (
    <div
      className="overflow-x-auto pt-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
