import { ExternalLink, HeartPulse } from "lucide-react"
import * as React from "react"

import { Squircle } from "@/components/ui/squircle"
import {
  disableHealthToggle,
  enableHealthToggle,
  useHealthPrefs,
} from "@/data/health-connect"
import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"
import {
  getGrantedHealthPermissions,
  getHealthAvailability,
  isHealthConnectPlatform,
  openHealthConnectInstall,
  openHealthConnectSettings,
  requestHealthPermission,
  type HealthAvailability,
  type HealthPermission,
} from "@/native/health-connect"

// The Health Connect section of Settings (ADR 0014) — Android only, so it
// renders nothing on the web. Two independent toggles, each asking for only
// its own permission when switched on: "Send food" (write nutrition) and
// "Show weight" (read weight). Where Health Connect isn't installed yet it
// offers the Play Store instead; where it can't exist at all it stays hidden.
export function HealthConnectSetting() {
  const availability = useHealthAvailability()
  if (availability === null || availability === "unavailable") return null
  return <HealthConnectSection availability={availability} />
}

function HealthConnectSection({
  availability,
}: {
  availability: Exclude<HealthAvailability, "unavailable">
}) {
  const { t } = useI18n()
  const prefs = useHealthPrefs()
  const [denied, setDenied] = React.useState<HealthPermission | null>(null)
  useRevocationCheck(availability === "available")

  const toggle = async (permission: HealthPermission, on: boolean) => {
    setDenied(null)
    if (!on) {
      disableHealthToggle(permission)
      return
    }
    if (await requestHealthPermission(permission)) {
      enableHealthToggle(permission)
    } else {
      setDenied(permission)
    }
  }

  const noteFor = (permission: HealthPermission) =>
    denied === permission
      ? t.healthConnect.denied
      : prefs.revoked.includes(permission)
        ? t.healthConnect.revoked
        : null

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t.healthConnect.title}
      </div>
      {availability === "needs-install" ? (
        <Squircle asChild radius="2xl">
          <button
            type="button"
            onClick={() => void openHealthConnectInstall()}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
          >
            <HeartPulse className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">
                {t.healthConnect.install}
              </span>
              <span className="block text-[13px] text-muted-foreground">
                {t.healthConnect.installSub}
              </span>
            </span>
            <ExternalLink className="h-[18px] w-[18px] text-muted-foreground" />
          </button>
        </Squircle>
      ) : (
        <div className="flex flex-col gap-1">
          <ToggleRow
            label={t.healthConnect.sendFood}
            sub={t.healthConnect.sendFoodSub}
            checked={prefs.writeFood}
            note={noteFor("writeNutrition")}
            onChange={(on) => void toggle("writeNutrition", on)}
          />
          <ToggleRow
            label={t.healthConnect.showWeight}
            sub={t.healthConnect.showWeightSub}
            checked={prefs.readWeight}
            note={noteFor("readWeight")}
            onChange={(on) => void toggle("readWeight", on)}
          />
          <Squircle asChild radius="2xl">
            <button
              type="button"
              onClick={() => void openHealthConnectSettings()}
              className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex-1 text-[15px] font-medium">
                {t.healthConnect.manageAccess}
              </span>
              <ExternalLink className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          </Squircle>
        </div>
      )}
    </div>
  )
}

// A whole-row switch: the row is the control, so the hit target is the full
// width, and the pill on the right only shows its state. Filled ink when on,
// the input tone when off — no slide animation, the knob simply sits at its
// end (spec § Motion keeps settings still).
function ToggleRow({
  label,
  sub,
  checked,
  note,
  onChange,
}: {
  label: string
  sub: string
  checked: boolean
  note: string | null
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex flex-col">
      <Squircle asChild radius="2xl">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{label}</span>
            <span className="block text-[13px] text-muted-foreground">
              {sub}
            </span>
          </span>
          <Squircle
            pill
            aria-hidden="true"
            className={cn(
              "flex h-6 w-10 shrink-0 items-center rounded-full p-0.5",
              checked
                ? "justify-end bg-foreground"
                : "justify-start bg-muted-foreground/25"
            )}
          >
            <span className="h-5 w-5 rounded-full bg-card" />
          </Squircle>
        </button>
      </Squircle>
      {note && (
        <p
          role="status"
          className="px-4 pb-1 text-[13px] text-muted-foreground"
        >
          {note}
        </p>
      )}
    </div>
  )
}

/** Health Connect's availability, resolved once per mount; null while asking. */
function useHealthAvailability(): HealthAvailability | null {
  const [availability, setAvailability] =
    React.useState<HealthAvailability | null>(() =>
      isHealthConnectPlatform() ? null : "unavailable"
    )
  React.useEffect(() => {
    if (!isHealthConnectPlatform()) return
    let cancelled = false
    void getHealthAvailability().then((a) => {
      if (!cancelled) setAvailability(a)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return availability
}

/**
 * Switch a toggle off when its permission was removed in Health Connect —
 * checked when Settings opens and whenever the app comes back to the
 * foreground (the user may have just been to Health Connect's own screen).
 */
function useRevocationCheck(active: boolean) {
  const prefs = useHealthPrefs()
  const { writeFood, readWeight } = prefs
  React.useEffect(() => {
    if (!active || (!writeFood && !readWeight)) return
    const check = async () => {
      const granted = await getGrantedHealthPermissions()
      if (writeFood && !granted.writeNutrition) {
        disableHealthToggle("writeNutrition", "revoked")
      }
      if (readWeight && !granted.readWeight) {
        disableHealthToggle("readWeight", "revoked")
      }
    }
    void check()
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [active, writeFood, readWeight])
}
