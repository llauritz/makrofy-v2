import * as React from "react"
import {
  Check,
  GitMerge,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { displayRate, productRate, type GlossaryRate } from "@/lib/glossary"
import { useI18n } from "@/lib/i18n/useI18n"
import type { QuantityKind } from "@/lib/quantity"
import type { Alias, Product, Reading } from "@/lib/suggestions"
import { productRateLine } from "./rate"
import { MACROS, macroTint } from "@/screens/main/macros"
import {
  EMPTY_MACROS,
  parseOptional,
  type MacroInputs,
} from "@/screens/main/fields"
import { FadeSwap } from "@/screens/main/FadeSwap"
import { SPRING } from "@/screens/main/anim"

// The value a Reading edit / new-Reading commits — kcal and any macros the user
// typed, all against the Product's display basis (per 100 g / 100 ml / piece).
// The screen converts it to the per-unit Rate the overlay stores.
export interface PerBasis {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

// The inline curation editor a Glossary row fade-throughs to (issue #40) — the
// same row → editor pattern as the home screen's EntryList. Chrome-less: the
// card border/background live on the row's FadeSwap box. Everything here edits
// the synced overlay, never a logged Entry: correcting, pinning, deleting and
// merging Readings and Products, none of which changes a past Day.
export function ProductDetail({
  product,
  mergeCandidates,
  onClose,
  onEditReading,
  onAddReading,
  onDeleteReading,
  onTogglePin,
  onMerge,
  onUnmerge,
  onDeleteProduct,
}: {
  product: Product
  mergeCandidates: Product[]
  onClose: () => void
  onEditReading: (reading: Reading, value: PerBasis) => void
  onAddReading: (value: PerBasis) => void
  onDeleteReading: (reading: Reading) => void
  onTogglePin: (reading: Reading) => void
  onMerge: (absorbed: Product) => void
  onUnmerge: (alias: Alias) => void
  onDeleteProduct: () => void
}) {
  const { t, n } = useI18n()
  const rate = productRate(product)
  const rateLess = product.readings.length === 0
  const [adding, setAdding] = React.useState(false)
  const [merging, setMerging] = React.useState(false)

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold">
            {product.label}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {productRateLine(product, t, n)} · ×{n(product.useCount)}
          </div>
          {/* The Rate's per-unit macros, per nutrition basis (spec § Detail). */}
          {rate && <BasisMacroChips value={rate} />}
        </div>
        <IconButton onClick={onClose} label={t.common.close}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <SectionLabel>{t.productDetail.readings}</SectionLabel>
      {rateLess ? (
        // A rate-less Product has no Reading to curate; entering a value seeds
        // its first, a fresh ×1 Reading (spec § Reading curation). Products that
        // already have Readings are curated by editing/pinning/deleting them,
        // never by adding curation-time votes.
        <FadeSwap swapKey={adding ? "editor" : "empty"} className="rounded-2xl">
          {adding ? (
            <ReadingEditor
              kind={product.kind}
              onSave={(value) => {
                onAddReading(value)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-1 py-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t.productDetail.noCalories}
            </button>
          )}
        </FadeSwap>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {product.readings.map((reading, i) => (
            <li key={`${reading.rate.kcal}#${i}`}>
              <ReadingRow
                reading={reading}
                kind={product.kind}
                onEdit={(value) => onEditReading(reading, value)}
                onDelete={() => onDeleteReading(reading)}
                onTogglePin={() => onTogglePin(reading)}
              />
            </li>
          ))}
        </ul>
      )}

      {product.aliases.length > 0 && (
        <>
          <SectionLabel>{t.productDetail.alsoKnownAs}</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {product.aliases.map((alias) => (
              <li
                key={alias.key}
                className="flex items-center justify-between gap-3 rounded-2xl bg-input px-3 py-2"
              >
                <span className="truncate text-sm">{alias.label}</span>
                <IconButton
                  onClick={() => onUnmerge(alias)}
                  label={t.productDetail.unmerge(alias.label)}
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
        {mergeCandidates.length > 0 ? (
          <button
            type="button"
            onClick={() => setMerging((m) => !m)}
            aria-expanded={merging}
            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <GitMerge className="h-4 w-4" />
            {t.productDetail.mergeIn}
          </button>
        ) : (
          <span />
        )}
        <motion.button
          type="button"
          onClick={onDeleteProduct}
          whileTap={{ scale: 0.9 }}
          aria-label={t.productDetail.deleteProduct}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          {t.common.delete}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {merging && (
          <motion.div
            key="merge-picker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <p className="mt-2 text-xs text-muted-foreground">
              {t.productDetail.mergePrompt(product.label)}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {mergeCandidates.map((candidate) => (
                <li key={candidate.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setMerging(false)
                      onMerge(candidate)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-input px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="truncate text-sm font-medium">
                      {candidate.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      ×{n(candidate.useCount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// One Reading: its value against the basis, ×votes and macro chips, with a pin
// toggle, an edit pencil and a delete. Editing fade-throughs the row to an
// inline value editor (spec § Motion).
function ReadingRow({
  reading,
  kind,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  reading: Reading
  kind: QuantityKind
  onEdit: (value: PerBasis) => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const { t, n } = useI18n()
  const [editing, setEditing] = React.useState(false)
  const shown = displayRate(kind, reading.rate)

  return (
    <FadeSwap
      swapKey={editing ? "editor" : "row"}
      className="rounded-2xl bg-input"
    >
      {editing ? (
        <ReadingEditor
          kind={kind}
          initial={shown}
          onSave={(value) => {
            onEdit(value)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={reading.pinned ? t.productDetail.unpin : t.productDetail.pinAsRate}
            aria-pressed={reading.pinned}
            className={
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
              (reading.pinned
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {reading.pinned ? (
              <Pin className="h-4 w-4" />
            ) : (
              <PinOff className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tabular-nums">
                {n(shown.kcal)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t.glossary.kcalBasis(kind)}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                ×{n(reading.votes)}
              </span>
            </div>
            <BasisMacroChips value={shown} />
          </div>
          <IconButton
            onClick={() => setEditing(true)}
            label={t.productDetail.editReading}
          >
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton onClick={onDelete} label={t.productDetail.deleteReading}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      )}
    </FadeSwap>
  )
}

// The compact kcal + P/F/C form a Reading edits through, mirroring the add
// card's field grammar. Numbers are entered against the Product's basis.
function ReadingEditor({
  kind,
  initial,
  onSave,
  onCancel,
}: {
  kind: QuantityKind
  initial?: PerBasis
  onSave: (value: PerBasis) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const basis = t.glossary.basis(kind)
  const [kcal, setKcal] = React.useState(initial ? String(initial.kcal) : "")
  const [macros, setMacros] = React.useState<MacroInputs>(() =>
    initial
      ? {
          p: initial.protein !== undefined ? String(initial.protein) : "",
          f: initial.fat !== undefined ? String(initial.fat) : "",
          c: initial.carbs !== undefined ? String(initial.carbs) : "",
        }
      : EMPTY_MACROS
  )

  const canSave = parseOptional(kcal) !== undefined

  const save = () => {
    const value = parseOptional(kcal)
    if (value === undefined) return
    onSave({
      kcal: value,
      protein: parseOptional(macros.p),
      fat: parseOptional(macros.f),
      carbs: parseOptional(macros.c),
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      save()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="p-2.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.target.select()}
          inputMode="decimal"
          aria-label={t.productDetail.caloriesPer(basis)}
          className="w-20 rounded-full bg-card px-3 py-2 text-center text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
          placeholder={t.units.kcal}
        />
        <span className="text-[11px] text-muted-foreground">
          {t.glossary.kcalBasis(kind)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <label
            key={m.key}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-2.5 py-1.5"
            style={{ backgroundColor: macroTint(m.mark, 11) }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: m.mark }}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {m.letter}
            </span>
            <input
              value={macros[m.key]}
              onChange={(e) =>
                setMacros((prev) => ({ ...prev, [m.key]: e.target.value }))
              }
              onKeyDown={onKeyDown}
              placeholder="0"
              inputMode="decimal"
              aria-label={t.productDetail.gramsPer(t.macros[m.field], basis)}
              className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
            />
            <span className="text-xs text-[#a5988a]">{t.units.g}</span>
          </label>
        ))}
        <IconButton onClick={onCancel} label={t.common.cancel}>
          <X className="h-4 w-4" />
        </IconButton>
        <motion.button
          type="button"
          onClick={save}
          disabled={!canSave}
          whileTap={{ scale: 0.9 }}
          aria-label={t.productDetail.saveReading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  )
}

// The per-basis macro chips (reusing the macro coding), shown under a Reading
// or beside the Product's Rate.
function BasisMacroChips({ value }: { value: GlossaryRate }) {
  const { t, n } = useI18n()
  const chips = MACROS.filter((m) => (value[m.field] ?? 0) > 0)
  if (chips.length === 0) return null
  return (
    <div className="mt-1 flex gap-1.5">
      {chips.map((m) => (
        <span
          key={m.key}
          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
          style={{ backgroundColor: macroTint(m.mark, 13) }}
        >
          <span
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: m.mark }}
          />
          {m.letter} {n(value[m.field] ?? 0)}
          {t.units.g}
        </span>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
    >
      {children}
    </motion.button>
  )
}
