// PROTOTYPE — issue #5, Variant B "Review sheet".
// Contract: the AI never touches the form. Tapping ✨ opens a bottom sheet
// that thinks, then proposes a complete entry to review — editable numbers,
// flagged values marked, Google attribution in the sheet footer. "Add to
// today" commits from the sheet; the form is left exactly as typed, so a
// failed AI run costs nothing.
import * as React from "react"

import { GoogleChip, MACROS, Shell, type Entry } from "./Shell"
import { mockMacroFill, type AiReply, type Food } from "./engine"
import {
  AddButton,
  AiButton,
  FoodInput,
  KcalInput,
  MacroPillInput,
  TypeaheadPanel,
  flagsFromUncertain,
  useAddForm,
  type FlagKey,
} from "./fields"
import type { VariantProps } from "./index"

type SheetState =
  | { kind: "closed" }
  | { kind: "thinking" }
  | { kind: "review"; food: Food; flags: Set<FlagKey>; reply: AiReply }
  | { kind: "question"; question: string; chips: string[] }
  | { kind: "hint"; hint: string }

let sheetEntryId = 1

export function VariantSheet({ entries, addEntry, seed }: VariantProps) {
  const { values, set, reset, buildEntry } = useAddForm()
  const [sheet, setSheet] = React.useState<SheetState>({ kind: "closed" })
  // review-stage edits live in their own mini-form
  const [edit, setEdit] = React.useState({ kcal: "", p: "", f: "", c: "" })
  const inputRef = React.useRef<HTMLInputElement>(null)
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])

  React.useEffect(() => {
    if (seed) {
      set({ label: seed.text })
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce])

  const runAi = (text: string) => {
    if (!text.trim()) return
    setSheet({ kind: "thinking" })
    mockMacroFill(text).then((reply) => {
      if (!alive.current) return
      const r = reply.result
      if (r.status === "confident" || r.status === "unsure") {
        const fmt = (n: number) => String(Math.round(n * 10) / 10)
        setEdit({
          kcal: String(Math.round(r.food.calories)),
          p: fmt(r.food.protein_g),
          f: fmt(r.food.fat_g),
          c: fmt(r.food.carbs_g),
        })
        setSheet({
          kind: "review",
          food: r.food,
          flags: r.status === "unsure" ? flagsFromUncertain(r.uncertainFields) : new Set(),
          reply,
        })
      } else if (r.status === "ambiguous") {
        setSheet({ kind: "question", question: r.question, chips: r.chips })
      } else {
        setSheet({ kind: "hint", hint: r.hint })
      }
    })
  }

  const commitManual = () => {
    const entry = buildEntry()
    if (!entry) return
    addEntry(entry)
    reset()
  }

  const commitFromSheet = () => {
    if (sheet.kind !== "review") return
    const entry: Entry = {
      id: `b${sheetEntryId++}`,
      label: sheet.food.label,
      kcal: Math.round(parseFloat(edit.kcal) || 0),
      p: parseFloat(edit.p) || 0,
      f: parseFloat(edit.f) || 0,
      c: parseFloat(edit.c) || 0,
      ai: { flagged: [], grounded: false },
    }
    addEntry(entry)
    reset()
    setSheet({ kind: "closed" })
  }

  const addCard = (
    <div className="mx-4 mt-1 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)] dark:border-[#3a2f22] dark:bg-[#2a211a]">
      <div className="flex items-center gap-2">
        <FoodInput
          inputRef={inputRef}
          value={values.label}
          onChange={(v) => set({ label: v })}
          onEnter={commitManual}
          trailing={
            <AiButton
              onClick={() => runAi(values.label)}
              busy={sheet.kind === "thinking"}
              disabled={!values.label.trim()}
            />
          }
        />
        <KcalInput value={values.kcal} onChange={(v) => set({ kcal: v })} />
      </div>
      <TypeaheadPanel
        query={values.label}
        onPick={(s) => {
          addEntry({
            id: `n${Date.now()}`,
            label: s.label,
            kcal: s.kcal,
            p: s.p,
            f: s.f,
            c: s.c,
          })
          reset()
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <MacroPillInput
            key={m.key}
            macro={m}
            value={values[m.key]}
            onChange={(v) => set({ [m.key]: v })}
          />
        ))}
        <AddButton onClick={commitManual} />
      </div>
    </div>
  )

  const overlay =
    sheet.kind === "closed" ? null : (
      <>
        <button
          aria-label="Dismiss"
          onClick={() => setSheet({ kind: "closed" })}
          className="fixed inset-0 z-30 bg-[#2b2015]/30 dark:bg-black/50"
        />
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md">
          <div className="animate-in slide-in-from-bottom-8 fade-in rounded-t-[28px] border border-b-0 border-[#eee5d2] bg-[#fffdf7] p-5 pb-7 shadow-[0_-8px_30px_rgba(43,32,21,0.15)] duration-300 dark:border-[#3a2f22] dark:bg-[#2a211a] dark:text-[#f3ece2]">
            {sheet.kind === "thinking" && (
              <div>
                <div className="text-xs text-[#7d7060] dark:text-[#a5988a]">
                  Estimating “{values.label.trim()}”…
                </div>
                <div className="mt-3 flex animate-pulse flex-col gap-2.5">
                  <div className="h-5 w-2/3 rounded-full bg-[#f3ecdd] dark:bg-[#211a12]" />
                  <div className="h-9 w-full rounded-2xl bg-[#f3ecdd] dark:bg-[#211a12]" />
                  <div className="h-9 w-full rounded-2xl bg-[#f3ecdd] dark:bg-[#211a12]" />
                </div>
              </div>
            )}

            {sheet.kind === "review" && (
              <div className="text-[#2b2015] dark:text-[#f3ece2]">
                <div className="text-[17px] font-semibold">{sheet.food.label}</div>
                <div className="mt-0.5 text-xs text-[#7d7060] dark:text-[#a5988a]">
                  {sheet.food.servingText}
                  {sheet.flags.size > 0 && " · estimates — check the dashed values"}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <KcalInput
                    value={edit.kcal}
                    onChange={(v) => setEdit((e) => ({ ...e, kcal: v }))}
                    flagged={sheet.flags.has("kcal")}
                    onClearFlag={() =>
                      setSheet({ ...sheet, flags: new Set([...sheet.flags].filter((f) => f !== "kcal")) })
                    }
                  />
                  {MACROS.map((m) => (
                    <MacroPillInput
                      key={m.key}
                      macro={m}
                      value={edit[m.key]}
                      onChange={(v) => setEdit((e) => ({ ...e, [m.key]: v }))}
                      flagged={sheet.flags.has(m.key)}
                      onClearFlag={() =>
                        setSheet({ ...sheet, flags: new Set([...sheet.flags].filter((f) => f !== m.key)) })
                      }
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={commitFromSheet}
                    className="flex-1 rounded-full bg-[#2b2015] py-3 text-sm font-semibold text-[#f6f1e6] dark:bg-[#f3ece2] dark:text-[#17110c]"
                  >
                    Add to today
                  </button>
                  <button
                    onClick={() => setSheet({ kind: "closed" })}
                    className="rounded-full border border-[#e6dcc8] px-5 py-3 text-sm font-medium text-[#7d7060] dark:border-[#3a2f22] dark:text-[#a5988a]"
                  >
                    Discard
                  </button>
                </div>
                {sheet.reply.grounded && sheet.reply.searchQuery && (
                  <div className="mt-3">
                    <GoogleChip query={sheet.reply.searchQuery} />
                  </div>
                )}
              </div>
            )}

            {sheet.kind === "question" && (
              <div className="text-[#2b2015] dark:text-[#f3ece2]">
                <div className="text-[15px] font-medium">{sheet.question}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sheet.chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => runAi(chip)}
                      className="rounded-full border border-[#e6dcc8] bg-[#fffdf7] px-3 py-1.5 text-xs font-medium dark:border-[#3a2f22] dark:bg-[#211a12]"
                    >
                      {chip}
                    </button>
                  ))}
                  <button
                    onClick={() => setSheet({ kind: "closed" })}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#a5988a]"
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}

            {sheet.kind === "hint" && (
              <div className="text-[#2b2015] dark:text-[#f3ece2]">
                <div className="text-[15px] font-medium">Can’t estimate this one</div>
                <div className="mt-1 text-sm text-[#7d7060] dark:text-[#a5988a]">
                  {sheet.hint}
                </div>
                <button
                  onClick={() => {
                    setSheet({ kind: "closed" })
                    inputRef.current?.focus()
                  }}
                  className="mt-4 w-full rounded-full border border-[#e6dcc8] py-3 text-sm font-medium dark:border-[#3a2f22]"
                >
                  Edit description
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    )

  return <Shell entries={entries} addCard={addCard} overlay={overlay} />
}
