import * as React from "react"
import { X } from "lucide-react"
import { motion } from "motion/react"

import { useTheme } from "@/components/theme-provider"
import { useI18n } from "@/lib/i18n/useI18n"
import { bindAttributionToTheme } from "@/lib/macro-fill"
import { FadeSwap } from "./FadeSwap"

// The AI's half of the add card's response zone (spec § Add flow: one zone
// below the P/F/C pills hosts everything reactive). Every state the AI can be
// in surfaces here — thinking, interpretation + flag help + attribution,
// the one clarifying question with its answer chips, hints — swapped through
// FadeSwap so the card makes space and content fades, never jumps (§ Motion).

/** What the zone is showing. Surfaces derive this from their AI state. */
export type AiZoneState =
  | { kind: "empty" }
  | { kind: "thinking" }
  /**
   * An applied fill: the AI's interpretation, with flag help while Flagged
   * values remain. `dismissible` on surfaces with no other way to retire the
   * note (the 0-kcal row fill — the add card clears through the label).
   */
  | {
      kind: "filled"
      interpretation: string
      anyFlagged: boolean
      dismissible?: boolean
    }
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
  const { t } = useI18n()
  switch (state.kind) {
    case "empty":
      return null
    case "thinking":
      return <InfoRow>{t.aiZone.estimating}</InfoRow>
    case "filled":
      return (
        <InfoRow>
          <span className="truncate">{state.interpretation}</span>
          {state.anyFlagged && <span>{t.aiZone.bestGuess}</span>}
          {state.dismissible && (
            <span className="ml-auto">
              <DismissButton
                label={t.aiZone.dismissNote}
                onDismiss={onDismiss}
              />
            </span>
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
              <DismissButton
                label={t.aiZone.dismissQuestion}
                onDismiss={onDismiss}
              />
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
            <DismissButton label={t.aiZone.dismissHint} onDismiss={onDismiss} />
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
// .renderedContent) — Google's terms require displaying it when a response is
// grounded, in Google's own styling (colors, fonts, logo stay theirs). It
// arrives from the AI Logic proxy, not from user content. Two departures from
// verbatim: the scheme media queries are pinned to the app theme (Google's
// CSS tracks the OS, but Yaffle's theme is a user setting — under "system"
// the two agree and the HTML passes through live), and the container is
// rounded to a pill to sit with the inputs around it. No overflow wrapper:
// Google's .carousel scrolls its chips itself, and an outer scrollport would
// clip the container's hairline box-shadow on whichever edges it touches.
// The px/pb hairline padding exists for the same clip: the container's ring
// is a 1px box-shadow OUTSIDE its box, and FadeSwap's overflow-hidden would
// slice it off wherever the container sits flush against the zone's edges.
function GoogleSearchSuggestions({ html }: { html: string }) {
  const { theme } = useTheme()
  const bound = theme === "system" ? html : bindAttributionToTheme(html, theme)
  return (
    <div
      // rounded-full needs the ! — Tailwind utilities sit in a cascade layer,
      // and Google's unlayered inline <style> would win the radius otherwise.
      className="px-px pt-2 pb-px [&_.container]:overflow-hidden [&_.container]:rounded-full!"
      dangerouslySetInnerHTML={{ __html: bound }}
    />
  )
}
