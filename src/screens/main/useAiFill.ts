import * as React from "react"

import { AI_DAILY_LIMIT, consumeAiUse, readAiUsage } from "@/data/ai-quota"
import { fillMacros, type AiFillReply } from "@/lib/ai"
import { localDay } from "@/lib/day"
import { db } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  capFinalRoundTrip,
  flagsFromUncertain,
  followUpPrompt,
  interpretationOf,
  type AiFood,
  type FormFlag,
} from "@/lib/macro-fill"
import { useOnline } from "@/lib/useOnline"
import type { AiZoneState } from "./AiZone"

// The AI fill choreography every ✨ surface shares (spec § AI macro-fill,
// #21/#53): the offline note, the daily quota gate, the serial guard against
// stale replies, and the four-tier reply handling with its one-question cap.
// What differs per surface — where a fill's numbers land and which flags stay
// standing — arrives through the `apply` callback; the add card overwrites
// its whole form, the editor and the row fill only what's missing.

/**
 * Where the AI interaction stands. A fill returns the phase to idle — its
 * results live on in the surface's fields and the flags/interpretation state.
 */
export type AiPhase =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "question"; question: string; chips: string[]; description: string }
  | { kind: "hint"; hint: string }

const AI_IDLE: AiPhase = { kind: "idle" }

export const NO_FLAGS: ReadonlySet<FormFlag> = new Set()

/**
 * Flagged values: the contract's clearly visible 2px dashed outline (#5 —
 * no "~" characters); tapping the field selects the value and clears it.
 */
export const FLAGGED_OUTLINE =
  "outline-2 outline-dashed outline-[#8f7c5e] -outline-offset-2 dark:outline-[#8a775c]"

export function useAiFill({
  uid,
  apply,
}: {
  /** The identity behind the surface (Guests count, spec § AI macro-fill). */
  uid: string | null
  /** Land a fill on the surface: write its values and stand up its flags. */
  apply: (food: AiFood, flags: ReadonlySet<FormFlag>) => void
}) {
  const { t } = useI18n()
  const online = useOnline()
  const [phase, setPhase] = React.useState<AiPhase>(AI_IDLE)
  const [interpretation, setInterpretation] = React.useState<string | null>(
    null
  )
  const [attribution, setAttribution] = React.useState<string | null>(null)
  // Serial of the latest AI request: every AI-state reset bumps it, so a
  // stale in-flight reply can never write into a surface the user has moved
  // on from — manual entry never waits on the AI.
  const run = React.useRef(0)

  /** Drop every AI trace and invalidate any reply still in flight. */
  const clear = () => {
    run.current++
    setPhase(AI_IDLE)
    setInterpretation(null)
    setAttribution(null)
  }

  /**
   * One AI round trip: the offline note, the quota gate, the call, then the
   * tier choreography. `description` is the user's food text (kept for a
   * question's follow-up turn, even when `prompt` wraps it); `final` marks
   * the answer to a clarifying question — the second and FINAL trip, where
   * another question is capped into a hint.
   */
  const runFill = async ({
    prompt,
    description,
    final,
  }: {
    prompt: string
    description: string
    final: boolean
  }) => {
    if (uid === null) return
    const runId = ++run.current
    setInterpretation(null)
    setAttribution(null)
    if (!online) {
      // The offline contract: the dimmed button stays tappable and answers
      // with this quiet note in the zone (spec § AI macro-fill).
      setPhase({ kind: "hint", hint: t.addCard.aiOffline })
      return
    }
    setPhase({ kind: "thinking" })
    try {
      const day = localDay(new Date())
      const used = await readAiUsage(db, uid, day)
      if (runId !== run.current) return
      if (used >= AI_DAILY_LIMIT) {
        setPhase({ kind: "hint", hint: t.addCard.aiLimit })
        return
      }
      consumeAiUse(db, uid, day)
      const reply = await fillMacros(prompt)
      if (runId !== run.current) return
      applyReply(reply, description, final)
    } catch {
      if (runId !== run.current) return
      setPhase({ kind: "hint", hint: t.addCard.aiError })
    }
  }

  const applyReply = (
    reply: AiFillReply | null,
    description: string,
    final: boolean
  ) => {
    if (reply === null) {
      setPhase({ kind: "hint", hint: t.addCard.aiNoEstimate })
      return
    }
    // Display duty first: whenever Google Search informed the answer, the
    // Suggestions chip shows at response time, whatever the tier (compliance,
    // spec § AI macro-fill).
    setAttribution(reply.attribution)
    const result = final ? capFinalRoundTrip(reply.result) : reply.result
    switch (result.status) {
      case "confident":
      case "unsure": {
        apply(
          result.food,
          result.status === "unsure"
            ? flagsFromUncertain(result.uncertainFields)
            : NO_FLAGS
        )
        setInterpretation(interpretationOf(result.food))
        setPhase(AI_IDLE)
        break
      }
      case "ambiguous":
        setPhase({
          kind: "question",
          question: result.question,
          chips: result.answerChips,
          description,
        })
        break
      case "hopeless":
        setPhase({ kind: "hint", hint: t.addCard.aiHopeless(result.hint) })
        break
    }
  }

  /** The ✨ tap. The description doubles as the first trip's whole prompt. */
  const start = (description: string) => {
    if (phase.kind === "thinking" || description.trim() === "") return
    void runFill({ prompt: description, description, final: false })
  }

  /** A chip answer triggers the second and final round trip (#5, #21). */
  const answer = (chip: string) => {
    if (phase.kind !== "question") return
    void runFill({
      prompt: followUpPrompt(phase.description, phase.question, chip),
      description: phase.description,
      final: true,
    })
  }

  return {
    phase,
    interpretation,
    attribution,
    thinking: phase.kind === "thinking",
    start,
    answer,
    clear,
  }
}

/**
 * The dashed Flagged values on a surface's fields — caller-owned so each
 * surface decides what "standing" means (the add card replaces them per fill,
 * the editor seeds them from the Entry's persisted flags). Tapping a Flagged
 * field selects the value and clears its flag (#5): selected text is one
 * keystroke from fixed, and an untouched tap means "accepted".
 */
export function useFormFlags(initial?: ReadonlySet<FormFlag>) {
  const [flags, setFlags] = React.useState<ReadonlySet<FormFlag>>(
    initial ?? NO_FLAGS
  )

  const acceptFlag =
    (key: FormFlag) => (e: React.FocusEvent<HTMLInputElement>) => {
      if (!flags.has(key)) return
      e.target.select()
      setFlags((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }

  return { flags, setFlags, acceptFlag }
}

/**
 * What the response zone shows for a hook's state: reactive phases win; an
 * applied fill's interpretation (with flag help while Flagged values remain)
 * holds the zone after the phase returns to idle.
 */
export function aiZoneStateOf(
  ai: { phase: AiPhase; interpretation: string | null },
  anyFlagged: boolean,
  opts?: { dismissibleFill?: boolean }
): AiZoneState {
  if (ai.phase.kind === "idle") {
    return ai.interpretation
      ? {
          kind: "filled",
          interpretation: ai.interpretation,
          anyFlagged,
          dismissible: opts?.dismissibleFill,
        }
      : { kind: "empty" }
  }
  if (ai.phase.kind === "question") {
    return {
      kind: "question",
      question: ai.phase.question,
      chips: ai.phase.chips,
    }
  }
  return ai.phase
}
