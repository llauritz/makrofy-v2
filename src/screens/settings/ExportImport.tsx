import { Download, Upload } from "lucide-react"
import * as React from "react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import {
  exportBackup,
  importBackup,
  previewImport,
  type ImportPreview,
} from "@/data/backup"
import { useIdentity } from "@/data/hooks"
import {
  BackupParseError,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from "@/lib/backup"
import { localDay } from "@/lib/day"
import { db } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"

// The export/import settings surface (spec § Export / import, #24). Export
// downloads the whole profile as one yaffle/2 file; import picks a file,
// previews the new-vs-duplicate Entry split, and on confirm restores it. All the
// weight lives in src/data/backup.ts — this only wires the file picker, the
// download and the confirm sheet, so the live listeners reflect the restore.

// The import flow is a small machine: nothing open, then either the wrong file,
// the preview to confirm, the brief write, or the result.
type ImportState =
  | { phase: "idle" }
  | { phase: "invalid" }
  | { phase: "preview"; file: BackupFile; preview: ImportPreview }
  | { phase: "importing" }
  | { phase: "done"; added: number }

export function ExportImport() {
  const { t } = useI18n()
  const uid = useIdentity()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<ImportState>({ phase: "idle" })

  const onExport = async () => {
    if (!uid) return
    try {
      const file = await exportBackup(db, uid, Date.now())
      downloadJson(serializeBackup(file), `yaffle-backup-${localDay(new Date())}.json`)
    } catch (err) {
      console.error("Export failed", err)
    }
  }

  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = "" // let the same file be re-picked after a cancel
    if (!picked || !uid) return
    let file: BackupFile
    try {
      file = parseBackup(await picked.text())
    } catch (err) {
      if (err instanceof BackupParseError) {
        setState({ phase: "invalid" })
        return
      }
      throw err
    }
    setState({ phase: "preview", file, preview: await previewImport(db, uid, file) })
  }

  const onConfirm = async () => {
    if (state.phase !== "preview" || !uid) return
    const { file } = state
    setState({ phase: "importing" })
    try {
      const result = await importBackup(db, uid, file)
      setState({ phase: "done", added: result.importedEntries })
    } catch (err) {
      console.error("Import failed", err)
      setState({ phase: "idle" })
    }
  }

  return (
    <>
      <Row
        icon={<Download className="h-[18px] w-[18px]" />}
        label={t.backup.export}
        hint={t.backup.exportHint}
        onClick={onExport}
        disabled={!uid}
      />
      <Row
        icon={<Upload className="h-[18px] w-[18px]" />}
        label={t.backup.import}
        hint={t.backup.importHint}
        onClick={() => fileInput.current?.click()}
        disabled={!uid}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFileChosen}
      />
      <ImportSheet
        state={state}
        onConfirm={onConfirm}
        onClose={() => setState({ phase: "idle" })}
      />
    </>
  )
}

// A settings row that runs an action, styled like the install entry alongside it.
function Row({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-45"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <span className="text-[13px] text-muted-foreground">{hint}</span>
    </button>
  )
}

// The confirm/result sheet, open whenever the import flow isn't idle.
function ImportSheet({
  state,
  onConfirm,
  onClose,
}: {
  state: ImportState
  onConfirm: () => void
  onClose: () => void
}) {
  const { t, n } = useI18n()
  return (
    <BottomSheet
      open={state.phase !== "idle"}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <BottomSheetContent className="gap-5">
        <div className="flex items-start justify-between gap-3">
          <BottomSheetTitle className="text-lg font-semibold">
            {state.phase === "done" ? t.backup.doneTitle : t.backup.previewTitle}
          </BottomSheetTitle>
          <BottomSheetClose />
        </div>

        {state.phase === "invalid" && (
          <BottomSheetDescription className="text-[15px] text-muted-foreground">
            {t.backup.invalidFile}
          </BottomSheetDescription>
        )}

        {state.phase === "preview" && (
          <>
            <BottomSheetDescription className="text-[15px] text-muted-foreground">
              {t.backup.previewBody}
            </BottomSheetDescription>
            <div className="flex flex-col gap-1 text-[15px]">
              <span className="font-medium">
                {t.backup.newEntries(n(state.preview.newEntries))}
              </span>
              {state.preview.duplicateEntries > 0 && (
                <span className="text-muted-foreground">
                  {t.backup.duplicatesSkipped(n(state.preview.duplicateEntries))}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                {t.backup.cancel}
              </Button>
              <Button className="flex-1" onClick={onConfirm}>
                {t.backup.confirm}
              </Button>
            </div>
          </>
        )}

        {state.phase === "importing" && (
          <BottomSheetDescription className="text-[15px] text-muted-foreground">
            {t.backup.importing}
          </BottomSheetDescription>
        )}

        {state.phase === "done" && (
          <>
            <BottomSheetDescription className="text-[15px] text-muted-foreground">
              {t.backup.doneBody(n(state.added))}
            </BottomSheetDescription>
            <Button className="w-full" onClick={onClose}>
              {t.backup.done}
            </Button>
          </>
        )}
      </BottomSheetContent>
    </BottomSheet>
  )
}

// Trigger a client-side download of a text file — no server round-trip.
function downloadJson(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
