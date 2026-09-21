import { AuthSync } from "@/components/auth/auth-sync";
import { AppShell } from "@/components/dashboard/app-shell";
import { requireUser } from "@/lib/auth/dal";
import { navigationFor, ROLE_LABELS } from "@/lib/navigation";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // Layouts don't re-render on navigation, so this only feeds the chrome.
  // Pages that show protected data check for themselves.
  const user = await requireUser();

  return (
    <>
      <AuthSync />
      <AppShell
        sections={navigationFor(user.user_type)}
        user={{
          name: `${user.first_name} ${user.last_name}`.trim() || user.username,
          email: user.email,
          roleLabel: ROLE_LABELS[user.user_type],
        }}
      >
        {children}
      </AppShell>
    </>
  );
}
