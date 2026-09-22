"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/dashboard/screen-kit";
import { naira } from "@/lib/format";
import { LIST_PAGE_SIZE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
import { useCurrentUser } from "@/lib/query/user";

interface Stat {
  label: string;
  value: string | undefined;
}

function ConfigCard({
  href,
  icon,
  title,
  description,
  stats,
  badge,
  onWarm,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  stats: Stat[];
  badge?: string;
  /** Called on hover/focus/touch so a card can warm data the hub doesn't load itself. */
  onWarm?: () => void;
}) {
  return (
    <Link
      href={href}
      onMouseEnter={onWarm}
      onFocus={onWarm}
      onTouchStart={onWarm}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-6"
    >
      {/* Soft brand wash that brightens on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-soft opacity-70 blur-2xl transition duration-300 group-hover:scale-125 group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/15 transition group-hover:bg-brand group-hover:text-brand-foreground">
          <Icon name={icon} className="size-6" />
        </span>
        {badge && <Badge tone="neutral">{badge}</Badge>}
      </div>

      <h2 className="relative mt-5 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="relative mt-1.5 flex-1 text-sm leading-relaxed text-muted">{description}</p>

      <dl className="relative mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">
              {stat.value ?? <span aria-hidden className="inline-block h-5 w-10 animate-pulse rounded bg-subtle align-middle" />}
            </dd>
          </div>
        ))}
      </dl>

      <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        Open
        <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

const total = (data: { pagination: { total_items: number } } | undefined) =>
  data ? data.pagination.total_items.toLocaleString("en-NG") : undefined;

export function ConfigurationsHub() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";

  // Same options the screens use, so these requests double as prefetches: opening a card reads warm cache.
  const first = { page: 1, page_size: LIST_PAGE_SIZE };
  const types = useQuery({ ...configQueries.types(first), enabled: isStaff });
  const makes = useQuery({ ...configQueries.makes(first), enabled: isStaff });
  const models = useQuery({ ...configQueries.models(first), enabled: isStaff });
  const rate = useQuery({ ...configQueries.energyRate(), enabled: isStaff });
  const countries = useQuery({ ...configQueries.countries(first), enabled: isStaff });
  const checklist = useQuery({ ...configQueries.checklistSettings(), enabled: isStaff });
  const groups = useQuery({ ...configQueries.groups(first), enabled: isStaff });
  const states = useQuery({ ...configQueries.states(first), enabled: isStaff });

  // Data only admins can read is warmed when a card is hovered or focused.
  const queryClient = useQueryClient();
  const warmEnergyHistory = () => {
    if (isAdmin) queryClient.prefetchQuery(configQueries.energyHistory(1, 15));
  };

  if (!isStaff) return <AccessDenied />;

  return (
    <div>
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configurations</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
          Everything that shapes how the platform runs: the vehicle catalogue drivers pick from, what a kilowatt-hour
          costs, how daily checklists run, who gets payment alerts, and the countries you operate in.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
        <ConfigCard
          href="/configurations/vehicle-catalogue"
          icon="tag"
          title="Vehicle catalogue"
          description="Manage the vehicle types, makes and models offered when you add a fleet vehicle. Keep names tidy and consistent."
          stats={[
            { label: "Types", value: total(types.data) },
            { label: "Makes", value: total(makes.data) },
            { label: "Models", value: total(models.data) },
          ]}
        />
        <ConfigCard
          href="/configurations/checklist-settings"
          icon="clipboard"
          title="Checklist settings"
          description="Set when drivers can start their daily pick-up and drop-off checklists, where they must be, and which AI reads the photos."
          stats={[
            { label: "Pick-up", value: checklist.data ? `${checklist.data.pick_up.start_time.slice(0, 5)}–${checklist.data.pick_up.end_time.slice(0, 5)}` : undefined },
            { label: "Drop-off", value: checklist.data ? `${checklist.data.drop_off.start_time.slice(0, 5)}–${checklist.data.drop_off.end_time.slice(0, 5)}` : undefined },
          ]}
        />
        <ConfigCard
          href="/configurations/groups"
          icon="users"
          title="Groups"
          description="Named lists of people, including the Accounts Team that receives live payment alerts. Create groups and manage who is in them."
          stats={[{ label: "Groups", value: total(groups.data) }]}
        />
        <ConfigCard
          onWarm={warmEnergyHistory}
          href="/configurations/energy-rate"
          icon="bolt"
          title="Energy rate"
          description={
            isAdmin
              ? "Set the price per kilowatt-hour that converts wallet top-ups and free grants into energy, and review every past change."
              : "See the current price per kilowatt-hour used for wallet top-ups and free grants."
          }
          badge={isAdmin ? undefined : "View only"}
          stats={[{ label: "Current rate", value: rate.data ? `${naira(rate.data.rate_per_kwh)} / kWh` : undefined }]}
        />
        <ConfigCard
          href="/configurations/countries"
          icon="globe"
          title="Countries"
          description="The reference list of countries with their continent, code and currency. Switch a country on or off as you expand."
          badge={isAdmin ? undefined : "View only"}
          stats={[{ label: "Countries", value: total(countries.data) }]}
        />
        <ConfigCard
          href="/configurations/states"
          icon="mapPin"
          title="States"
          description="States under a country. Link a vehicle to one so its driver follows that state's own pick-up/drop-off schedule instead of the global default."
          badge={isAdmin ? undefined : "View only"}
          stats={[{ label: "States", value: total(states.data) }]}
        />
      </div>
    </div>
  );
}
