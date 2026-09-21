import { AuthHero } from "@/components/auth/auth-hero";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Two halves from `lg` up: artwork on the left, the form on the right. Below
 * that it collapses to a single column. The form side scrolls on its own
 * content, so short landscape phones never clip the form.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-2 xl:grid-cols-[1.05fr_1fr] 2xl:grid-cols-[1.2fr_1fr]">
      <AuthHero />

      <div className="flex min-w-0 flex-col pb-[env(safe-area-inset-bottom)]">
        <header className="flex items-center justify-between gap-4 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.5rem,env(safe-area-inset-top))] lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="px-4 pb-6 text-center text-xs text-muted sm:px-8">
          © {new Date().getFullYear()} EV Muvment
        </footer>
      </div>
    </div>
  );
}
