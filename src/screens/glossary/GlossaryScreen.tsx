import * as React from "react"
import { ArrowLeft, Search } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { useIdentity, useProductIndex } from "@/data/hooks"
import { useProductCuration } from "@/data/useProductCuration"
import { useI18n } from "@/lib/i18n/useI18n"
import { sameKindOthers, searchGlossary } from "@/lib/glossary"
import type { Alias, Product } from "@/lib/suggestions"
import { SPRING } from "@/screens/main/anim"
import { FadeSwap } from "@/screens/main/FadeSwap"
import { ProductDetail } from "./ProductDetail"
import { productRateLine } from "./rate"

// How long the "merged — undo" bar stays up before the merge is left to stand.
const MERGE_UNDO_MS = 6000

// The Glossary: the browsable, alphabetical index of every Product, and the
// home of all curation (CONTEXT.md "Glossary", issue #40). A full screen reached
// from Settings; a search field narrows the list; a row fade-throughs inline to
// its curation editor. Every action writes the synced overlay through the
// products module — never a logged Entry — so the derived index (and this list)
// simply re-renders as the correction lands.
export function GlossaryScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const uid = useIdentity()
  const index = useProductIndex(uid)
  const [query, setQuery] = React.useState("")
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null)
  // The merge just made, offered for undo; the timer leaves it to stand.
  const [pendingMerge, setPendingMerge] = React.useState<{
    survivorKey: string
    alias: Alias
  } | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const clearTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }
  React.useEffect(() => clearTimer, [])

  const products = searchGlossary(index, query)
  const hasAny = index.products.length > 0

  // The overlay writes themselves live in useProductCuration (shared with the
  // add card's long-press surface, #73); this screen adds only its own chrome —
  // the merge-undo bar and collapsing a deleted Product's editor.
  const curation = useProductCuration(uid)
  const merge = (survivor: Product, absorbed: Product) => {
    const alias = curation.merge(survivor, absorbed)
    if (!alias) return
    clearTimer()
    setPendingMerge({ survivorKey: survivor.key, alias })
    timer.current = setTimeout(() => {
      setPendingMerge(null)
      timer.current = undefined
    }, MERGE_UNDO_MS)
  }
  const undoMerge = () => {
    if (pendingMerge) {
      curation.unmerge(pendingMerge.survivorKey, pendingMerge.alias)
    }
    clearTimer()
    setPendingMerge(null)
  }
  const removeProduct = (product: Product) => {
    curation.removeProduct(product)
    setExpandedKey(null)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col">
      <header className="flex items-center gap-1 px-4 pt-7 pb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.common.back}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-semibold">{t.glossary.title}</h1>
      </header>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-input px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-[#a5988a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.glossary.search}
            aria-label={t.glossary.search}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a5988a]"
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col px-4 pb-3">
        {!hasAny ? (
          <Empty title={t.glossary.emptyTitle} body={t.glossary.emptyBody} />
        ) : products.length === 0 ? (
          <Empty
            title={t.glossary.noMatchesTitle}
            body={t.glossary.noMatchesBody}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {products.map((product) => {
                const expanded = product.key === expandedKey
                return (
                  <motion.li
                    key={product.key}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={SPRING}
                  >
                    <FadeSwap
                      swapKey={expanded ? "detail" : "row"}
                      className="rounded-2xl border bg-card"
                    >
                      {expanded ? (
                        <ProductDetail
                          product={product}
                          mergeCandidates={sameKindOthers(
                            index.products,
                            product
                          )}
                          onClose={() => setExpandedKey(null)}
                          onEditReading={(reading, value) =>
                            curation.editReading(product, reading, value)
                          }
                          onAddReading={(value) =>
                            curation.addReading(product, value)
                          }
                          onDeleteReading={(reading) =>
                            curation.deleteReading(product, reading)
                          }
                          onTogglePin={(reading) =>
                            curation.togglePin(product, reading)
                          }
                          onMerge={(absorbed) => merge(product, absorbed)}
                          onUnmerge={(alias) =>
                            curation.unmerge(product.key, alias)
                          }
                          onDeleteProduct={() => removeProduct(product)}
                        />
                      ) : (
                        <GlossaryRow
                          product={product}
                          onOpen={() => setExpandedKey(product.key)}
                        />
                      )}
                    </FadeSwap>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
        <div className="flex-1" />
      </main>

      <div className="sticky bottom-0 px-3 pb-3">
        <AnimatePresence initial={false}>
          {pendingMerge && (
            <motion.div
              key="merge-undo"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={SPRING}
              className="flex items-center justify-between gap-3 rounded-full bg-foreground py-2.5 pr-2.5 pl-4 text-background shadow-[0_8px_30px_rgba(43,32,21,0.2)]"
            >
              <span className="truncate text-sm font-medium">
                {t.glossary.mergedInto(
                  survivorLabel(
                    index.products,
                    pendingMerge.survivorKey,
                    t.glossary.fallbackFood
                  )
                )}
              </span>
              <button
                type="button"
                onClick={undoMerge}
                className="shrink-0 rounded-full bg-background/15 px-3 py-1 text-sm font-semibold"
              >
                {t.common.undo}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// A collapsed row: label · kcal-rate · ×lifetime-count (raw use count, not
// frecency). Tapping opens the curation editor.
function GlossaryRow({
  product,
  onOpen,
}: {
  product: Product
  onOpen: () => void
}) {
  const { t, n } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.glossary.curate(product.label)}
      className="w-full rounded-2xl px-4 py-3 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">
            {product.label}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {productRateLine(product, t, n)}
          </div>
        </div>
        <div className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          ×{n(product.useCount)}
        </div>
      </div>
    </button>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbbfa4] px-4 py-8 text-center dark:border-[#4a3e2e]">
      <div className="text-[15px] font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{body}</div>
    </div>
  )
}

// The survivor's current label for the undo bar; falls back to a generic word
// if it has already scrolled out of the derived index.
function survivorLabel(
  products: Product[],
  key: string,
  fallback: string
): string {
  return products.find((p) => p.key === key)?.label ?? fallback
}
