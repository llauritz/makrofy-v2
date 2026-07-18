// @vitest-environment jsdom
// Seam: the add card's long-press curation surface (#73) — a held Suggestion
// row swaps inline to the Glossary's ProductDetail card and edits write the
// overlay, while a short tap keeps filling the form. The products module (the
// overlay writer) and the Firebase singleton are stubbed at their module
// boundaries; everything below AddCard renders for real.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"
import { buildProductIndex, type ProductIndex } from "@/lib/suggestions"

vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, auth: {} }))
vi.mock("@/data/products", () => ({
  appendReadingEdit: vi.fn(),
  appendReadingDeletion: vi.fn(),
  setPin: vi.fn(),
  mergeProducts: vi.fn(() => ({ key: "k", label: "l", atMs: 1 })),
  unmergeAlias: vi.fn(),
  deleteProduct: vi.fn(),
}))

import { appendReadingEdit } from "@/data/products"
import { AddCard } from "@/screens/main/AddCard"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 14, 12, 0, 0)
const entry = (label: string, kcal: number, ageDays: number) => ({
  label,
  kcal,
  protein: undefined,
  fat: undefined,
  carbs: undefined,
  createdAtMs: NOW - ageDays * DAY,
})

// "banana" is one count Product with two competing Readings (50 the fresher),
// so typing "ban" surfaces two banana rows plus the unrelated bandana loaf.
function makeIndex(): ProductIndex {
  return buildProductIndex(
    [
      entry("banana", 200, 2),
      entry("banana", 50, 1),
      entry("bandana bread", 100, 0),
    ],
    NOW
  )
}

function renderCard(index = makeIndex()) {
  const onAdd = vi.fn()
  const view = render(
    <LanguageProvider>
      <AddCard onAdd={onAdd} index={index} uid="test-uid" />
    </LanguageProvider>
  )
  fireEvent.change(screen.getByLabelText("Food"), { target: { value: "ban" } })
  return { onAdd, index, view }
}

// Hold past the threshold under fake timers, then hand the clock back to the
// real world so motion's enter/exit animations can run for the assertions.
function longPress(el: Element) {
  vi.useFakeTimers()
  fireEvent.pointerDown(el, { clientX: 50, clientY: 50 })
  act(() => {
    vi.advanceTimersByTime(500)
  })
  vi.useRealTimers()
  fireEvent.pointerUp(el)
  fireEvent.click(el)
}

const kcalField = () => screen.getByLabelText("Calories") as HTMLInputElement

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  cleanup()
})

describe("AddCard long-press curation (#73)", () => {
  it("swaps the held row for the Product's card and hides its siblings", async () => {
    renderCard()
    expect(screen.getAllByLabelText("Use banana")).toHaveLength(2)

    longPress(screen.getAllByLabelText("Use banana")[0])

    await screen.findByText("Readings")
    // Both banana rows collapse into the card (the sibling exits animated);
    // the loaf's row survives.
    await waitFor(() => expect(screen.queryByLabelText("Use banana")).toBeNull())
    expect(screen.getByLabelText("Use bandana bread")).toBeTruthy()
    // The hold never filled the form — the trailing click was swallowed.
    expect(kcalField().value).toBe("")
  })

  it("hosts the card at the held row, not the Product's first row", async () => {
    renderCard()
    const second = screen.getAllByLabelText("Use banana")[1]
    const li = second.closest("li")!

    longPress(second)

    await screen.findByText("Readings")
    // The held row's own box fade-swaps to the card (spec § UI); its sibling
    // above is the one that leaves.
    expect(li.textContent).toContain("Readings")
  })

  it("keeps the short tap filling the form, card shut", () => {
    renderCard()
    fireEvent.click(screen.getAllByLabelText("Use banana")[0])
    // The fresher 50-kcal Reading ranks first and fills.
    expect(kcalField().value).toBe("50")
    expect(screen.queryByText("Readings")).toBeNull()
  })

  it("writes a Reading edit to the overlay — the form stays untouched", async () => {
    const { index } = renderCard()
    longPress(screen.getAllByLabelText("Use banana")[0])
    await screen.findByText("Readings")

    fireEvent.click(screen.getAllByLabelText("Edit reading")[0])
    const editor = await screen.findByLabelText(/Calories per/)
    fireEvent.change(editor, { target: { value: "120" } })
    fireEvent.click(screen.getByLabelText("Save reading"))

    const banana = index.products.find((p) => p.label === "banana")!
    expect(appendReadingEdit).toHaveBeenCalledTimes(1)
    const [, uid, key, edit] = vi.mocked(appendReadingEdit).mock.calls[0]
    expect(uid).toBe("test-uid")
    expect(key).toBe(banana.key)
    expect(edit).toMatchObject({ from: 50, rate: { kcal: 120 } })
    expect(kcalField().value).toBe("")
  })

  it("closes the card when the user types on", async () => {
    renderCard()
    longPress(screen.getAllByLabelText("Use banana")[0])
    await screen.findByText("Readings")

    fireEvent.change(screen.getByLabelText("Food"), {
      target: { value: "bana" },
    })
    await waitFor(() => expect(screen.queryByText("Readings")).toBeNull())
    expect(screen.getAllByLabelText("Use banana")).toHaveLength(2)
  })

  it("restores the rows from the card's close button", async () => {
    renderCard()
    longPress(screen.getAllByLabelText("Use banana")[0])
    await screen.findByText("Readings")

    fireEvent.click(screen.getByLabelText("Close"))
    await waitFor(() =>
      expect(screen.getAllByLabelText("Use banana")).toHaveLength(2)
    )
    expect(screen.queryByText("Readings")).toBeNull()
  })

  it("refreshes the visible rows when the index re-derives", async () => {
    const { view } = renderCard()
    // The two banana rows are on screen showing 50 and 200. A curation edit
    // (or a remote device) re-derives the index: 50 became 120. The sticky
    // search must not sit on the stale numbers until the next keystroke.
    const corrected = buildProductIndex(
      [
        entry("banana", 200, 2),
        entry("banana", 120, 1),
        entry("bandana bread", 100, 0),
      ],
      NOW
    )
    view.rerender(
      <LanguageProvider>
        <AddCard onAdd={vi.fn()} index={corrected} uid="test-uid" />
      </LanguageProvider>
    )
    await waitFor(() => {
      const rows = screen.getAllByLabelText("Use banana")
      expect(rows.some((r) => r.textContent?.includes("120"))).toBe(true)
      expect(rows.some((r) => r.textContent?.includes("50"))).toBe(false)
    })
  })

  it("refreshes rows the sticky search is holding — trailing space", async () => {
    // The user's exact stale case: input ends in a space (the sticky state
    // where advanceSuggestions returns prev untouched), then a card edit
    // re-derives the index. The rows must still pick up the new value.
    const { view } = renderCard()
    fireEvent.change(screen.getByLabelText("Food"), {
      target: { value: "ban " },
    })
    expect(screen.getAllByLabelText("Use banana")).toHaveLength(2)

    const corrected = buildProductIndex(
      [
        entry("banana", 200, 2),
        entry("banana", 120, 1),
        entry("bandana bread", 100, 0),
      ],
      NOW
    )
    view.rerender(
      <LanguageProvider>
        <AddCard onAdd={vi.fn()} index={corrected} uid="test-uid" />
      </LanguageProvider>
    )
    await waitFor(() => {
      const rows = screen.getAllByLabelText("Use banana")
      expect(rows.some((r) => r.textContent?.includes("120"))).toBe(true)
      expect(rows.some((r) => r.textContent?.includes("50"))).toBe(false)
    })
  })

  it("falls back to the rows when the Product vanishes from the index", async () => {
    const { view } = renderCard()
    longPress(screen.getAllByLabelText("Use banana")[0])
    await screen.findByText("Readings")

    // The banana Product merged away on another device: the re-derived index
    // no longer holds its key. The card closes and the refreshed rows drop
    // the vanished Product too — no crash, no stale offer.
    const gone = buildProductIndex([entry("bandana bread", 100, 0)], NOW)
    view.rerender(
      <LanguageProvider>
        <AddCard onAdd={vi.fn()} index={gone} uid="test-uid" />
      </LanguageProvider>
    )
    await waitFor(() => expect(screen.queryByText("Readings")).toBeNull())
    expect(screen.queryByLabelText("Use banana")).toBeNull()
    expect(screen.getByLabelText("Use bandana bread")).toBeTruthy()
  })
})
