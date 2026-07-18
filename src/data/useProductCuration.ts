import { toRate, type PerBasis } from "@/lib/glossary"
import type { Alias, Product, Reading } from "@/lib/suggestions"
import { db } from "@/lib/firebase"
import {
  appendReadingDeletion,
  appendReadingEdit,
  deleteProduct,
  mergeProducts,
  setPin,
  unmergeAlias,
} from "@/data/products"

// The curation writes behind a ProductDetail card, shared by the Glossary
// screen and the add card's long-press surface (#73). Every write goes through
// the products module into the synced overlay — never a logged Entry — and
// guards on a resolved identity; the module stamps each correction with its
// own timeline (which gates the votes it reaches in buildProductIndex), the
// way addEntry stamps Entries.
export function useProductCuration(uid: string | null) {
  return {
    editReading(product: Product, reading: Reading, value: PerBasis) {
      if (!uid) return
      appendReadingEdit(
        db,
        uid,
        product.key,
        { from: reading.rate.kcal, rate: toRate(product.kind, value) },
        reading.pinned ?? false
      )
    },
    addReading(product: Product, value: PerBasis) {
      if (!uid) return
      appendReadingEdit(db, uid, product.key, {
        from: null,
        rate: toRate(product.kind, value),
      })
    },
    deleteReading(product: Product, reading: Reading) {
      if (!uid) return
      appendReadingDeletion(
        db,
        uid,
        product.key,
        reading.rate.kcal,
        reading.pinned ?? false
      )
    },
    togglePin(product: Product, reading: Reading) {
      if (!uid) return
      setPin(db, uid, product.key, reading.pinned ? null : reading.rate.kcal)
    },
    /** Returns the Alias the merge minted, for an undo affordance; null when
     * there is no identity to write under. */
    merge(survivor: Product, absorbed: Product): Alias | null {
      if (!uid) return null
      return mergeProducts(db, uid, survivor.key, {
        key: absorbed.key,
        label: absorbed.label,
      })
    },
    /** Keyed, not Product-typed: the merge-undo path holds only the survivor's
     * key (the Product may have re-derived since). */
    unmerge(productKey: string, alias: Alias) {
      if (!uid) return
      unmergeAlias(db, uid, productKey, alias)
    },
    removeProduct(product: Product) {
      if (!uid) return
      deleteProduct(db, uid, product.key)
    },
  }
}
