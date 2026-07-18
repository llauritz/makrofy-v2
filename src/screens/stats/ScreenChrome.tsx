import * as React from "react"
import { ArrowLeft } from "lucide-react"

import { useI18n } from "@/lib/i18n/useI18n"

// The stats screens' shared chrome (issue #22): back button, title, a
// max-w-md column. Its own module so the dashboard and the week report can
// both wear it without importing each other.
export function ScreenChrome({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col px-4 pb-8">
      <header className="flex items-center gap-1 pt-7 pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.common.back}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-semibold">{title}</h1>
      </header>
      {children}
    </div>
  )
}
