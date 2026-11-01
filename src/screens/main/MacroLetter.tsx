import type { Macro } from "./macros"

// The P/F/C mark on macro chips and input pills: the letter itself, colored,
// in Nunito Black — an icon you can read. `text-box` trims the line box to
// the cap height so `items-center` centres the glyph itself, not Nunito's
// tall ascender/descender box (which sits caps visibly high).
//
// Beside grams (`withGrams`), the letter is set 3px larger than the digits —
// Nunito's caps and Public Sans' digits are both ~0.72em, so that makes it
// ~2px taller — and sits on their baseline nudged 1px down: it overhangs the
// digits by 1px top and bottom, sharing their centre. A whole-pixel offset
// keeps that exact after the browser rounds each baseline, which centring
// the two boxes separately doesn't (they round apart by up to a pixel). The
// row must be `items-baseline`. Layout snaps text to whole pixels, so the
// final trim is a transform: 1/3px up (one device pixel on 3x phones) puts
// the letter's ink back on the digits' optical centre — without it the
// letters read a hair low. The caller sets the size.
export function MacroLetter({
  macro,
  withGrams = false,
  className = "",
  "aria-hidden": ariaHidden,
}: {
  macro: Macro
  withGrams?: boolean
  className?: string
  "aria-hidden"?: boolean
}) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={`font-macro leading-none font-black [text-box:trim-both_cap_alphabetic] ${withGrams ? "relative top-px -translate-y-[0.33px]" : ""} ${className}`}
      style={{ color: macro.text }}
    >
      {macro.letter}
    </span>
  )
}
