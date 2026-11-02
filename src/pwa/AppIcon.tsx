import { Squircle } from "@/components/ui/squircle"
import { cn } from "@/lib/utils"

// The app icon as it sits on a home screen: a hairline edge and, where it
// floats on a card, a soft shadow. The image is the squircle's own
// background rather than an <img> inside it — a replaced element is snapped
// to device pixels while the clip is not, which left slivers in the corners.
// The shadow hangs on a wrapper as a drop-shadow, since the clip would erase
// a box-shadow.
export function AppIcon({
  size = 36,
  shadow = false,
  className,
}: {
  /** Edge length in px; the corner radius scales with it (9 at 36). */
  size?: number
  shadow?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "shrink-0",
        shadow &&
          "drop-shadow-[0_1px_2px_rgba(43,32,21,0.18)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      <Squircle
        radius={size / 4}
        outline="solid"
        outlineClassName="text-black/10 dark:text-white/15"
        aria-hidden
        className="bg-[url(/icons/icon-192.png)] bg-cover bg-center bg-origin-border"
        style={{ width: size, height: size }}
      />
    </div>
  )
}
