import type { Macro } from "./macros"

// The P/F/C mark on macro chips and input pills: the letter itself, colored,
// in Nunito Black — an icon you can read. `text-box` trims the line box to
// the cap height so `items-center` centres the glyph itself, not Nunito's
// tall ascender/descender box (which sits caps visibly high). The caller
// sets the size.
export function MacroLetter({
  macro,
  className = "",
}: {
  macro: Macro
  className?: string
}) {
  return (
    <span
      className={`font-macro leading-none font-black [text-box:trim-both_cap_alphabetic] ${className}`}
      style={{ color: macro.text }}
    >
      {macro.letter}
    </span>
  )
}
