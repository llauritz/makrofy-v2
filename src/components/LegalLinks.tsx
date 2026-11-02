import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"

// The pricing and legal pages are static documents outside the app
// (public/*.html), so Paddle's domain review and signed-out visitors can reach
// them. The row sits at the foot of Settings and of the welcome screen, the
// first thing a visitor to goyaffle.web.app sees. The links open in a new tab
// so an installed PWA keeps its own window.
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useI18n()
  const links = [
    { href: "/pricing", label: t.settings.pricing },
    { href: "/terms", label: t.settings.terms },
    { href: "/privacy", label: t.settings.privacy },
    { href: "/refunds", label: t.settings.refunds },
  ]
  return (
    <nav
      aria-label={t.settings.legalLinks}
      className={cn(
        "flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className
      )}
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}
