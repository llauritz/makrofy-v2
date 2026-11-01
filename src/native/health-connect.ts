import { registerPlugin } from "@capacitor/core"

import type { NutritionRecordInput } from "@/lib/health-sync"
import type { WeightSample } from "@/lib/weight"
import { isNativeApp } from "@/native/platform"

// The typed seam over the native Health Connect plugin (ADR 0014). Kotlin
// lives in android/ (HealthConnectPlugin.kt); screens and data code reach it
// only through this module, which is a no-op off Android — every call there
// resolves to "unavailable" or nothing, so the web app never needs to know.

/** Health Connect's state on this device. */
export type HealthAvailability =
  /** Installed (or built into Android 14+) and ready. */
  | "available"
  /** The Health Connect app is missing or too old; the user can install it. */
  | "needs-install"
  /** Not supported here at all: the web, or an Android too old for it. */
  | "unavailable"

/** The two Health Connect permissions Yaffle asks for, one per toggle. */
export type HealthPermission = "writeNutrition" | "readWeight"

export type HealthPermissions = Record<HealthPermission, boolean>

/** Why a native call failed — "permission" means the user revoked access. */
export class HealthConnectError extends Error {
  readonly kind: "permission" | "failed"
  constructor(kind: "permission" | "failed", message: string) {
    super(message)
    this.kind = kind
  }
}

interface HealthConnectPlugin {
  getStatus(): Promise<{ availability: HealthAvailability }>
  getGrantedPermissions(): Promise<HealthPermissions>
  requestPermission(options: {
    permission: HealthPermission
  }): Promise<{ granted: boolean }>
  upsertNutrition(options: { records: NutritionRecordInput[] }): Promise<void>
  deleteNutrition(options: { clientRecordIds: string[] }): Promise<void>
  readWeight(options: {
    startMs: number
    endMs: number
  }): Promise<{ samples: WeightSample[] }>
  openSettings(): Promise<void>
  openInstall(): Promise<void>
}

const NativeHealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnect")

const NONE: HealthPermissions = { writeNutrition: false, readWeight: false }

/** Whether this build can ever reach Health Connect (the Android app). */
export function isHealthConnectPlatform(): boolean {
  return isNativeApp()
}

export async function getHealthAvailability(): Promise<HealthAvailability> {
  if (!isHealthConnectPlatform()) return "unavailable"
  try {
    return (await NativeHealthConnect.getStatus()).availability
  } catch {
    return "unavailable"
  }
}

export async function getGrantedHealthPermissions(): Promise<HealthPermissions> {
  if (!isHealthConnectPlatform()) return NONE
  try {
    return await NativeHealthConnect.getGrantedPermissions()
  } catch {
    return NONE
  }
}

/** Show Health Connect's own permission screen for one permission. */
export async function requestHealthPermission(
  permission: HealthPermission
): Promise<boolean> {
  if (!isHealthConnectPlatform()) return false
  try {
    return (await NativeHealthConnect.requestPermission({ permission })).granted
  } catch {
    return false
  }
}

/** Write or update one NutritionRecord per input, keyed by client record id. */
export async function upsertNutrition(
  records: NutritionRecordInput[]
): Promise<void> {
  if (!isHealthConnectPlatform() || records.length === 0) return
  await call(() => NativeHealthConnect.upsertNutrition({ records }))
}

/** Remove the NutritionRecords Yaffle wrote under these client record ids. */
export async function deleteNutrition(
  clientRecordIds: string[]
): Promise<void> {
  if (!isHealthConnectPlatform() || clientRecordIds.length === 0) return
  await call(() => NativeHealthConnect.deleteNutrition({ clientRecordIds }))
}

/** Every weigh-in between two moments, from any app that writes weight. */
export async function readWeight(
  startMs: number,
  endMs: number
): Promise<WeightSample[]> {
  if (!isHealthConnectPlatform()) return []
  const { samples } = await call(() =>
    NativeHealthConnect.readWeight({ startMs, endMs })
  )
  return samples
}

/** Open Health Connect's screen for managing Yaffle's access. */
export async function openHealthConnectSettings(): Promise<void> {
  if (!isHealthConnectPlatform()) return
  await NativeHealthConnect.openSettings().catch(() => {})
}

/** Open the Play Store page to install or update Health Connect. */
export async function openHealthConnectInstall(): Promise<void> {
  if (!isHealthConnectPlatform()) return
  await NativeHealthConnect.openInstall().catch(() => {})
}

// Capacitor rejects with { code, message }; the plugin uses PERMISSION_DENIED
// for a revoked permission so the caller can switch its toggle off.
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const code = (err as { code?: string }).code
    const message =
      (err as { message?: string }).message ?? "Health Connect call failed"
    throw new HealthConnectError(
      code === "PERMISSION_DENIED" ? "permission" : "failed",
      message
    )
  }
}
