"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { InviteStaffDialog } from "@/components/people/invite-staff-dialog";
import { ActiveBadge, Avatar, RoleBadge } from "@/components/people/people-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { STAFF_ROLES, type ManagedUser, type StaffRole } from "@/lib/api/users";
import { fullName } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { paginate } from "@/lib/paginate";
import { useCurrentUser } from "@/lib/query/user";
import { useRoster } from "@/lib/query/users";

const PAGE_SIZE = 20;
const ROW_GRID = "md:grid-cols-[minmax(0,1.3fr)_9.5rem_minmax(0,1.2fr)_7rem_6rem]";
const ROLE_PLURAL: Record<StaffRole, string> = { ADMIN: "Admins", ACCOUNT_OFFICER: "Account officers", RELATIONSHIP_OFFICER: "Relationship officers" };

function matches(person: ManagedUser, term: string) {
  const haystack = [fullName(person), person.username, person.email, person.phone_number].filter(Boolean).join(" ").toLowerCase();
  return term.toLowerCase().split(/\s+/).every((part) => haystack.includes(part));
}

export function StaffPage() {
  const me = useCurrentUser();
  const isAdmin = me.user_type === "ADMIN";
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const roster = useRoster("STAFF", isAdmin);
  const [inviting, setInviting] = useState(false);

  const role = (STAFF_ROLES.includes(url.get("role") as StaffRole) ? url.get("role") : "") as StaffRole | "";
  const status = ["active", "inactive"].includes(url.get("status")) ? url.get("status") : "";

  const staff = useMemo(() => roster.data ?? [], [roster.data]);
  const roleCounts = useMemo(() => Object.fromEntries(STAFF_ROLES.map((item) => [item, staff.filter((person) => person.user_type === item).length])) as Record<StaffRole, number>, [staff]);

  const filtered = useMemo(() => {
    const term = search.committed.trim();
    return staff
      .filter((person) => !role || person.user_type === role)
      .filter((person) => !status || person.is_active === (status === "active"))
      .filter((person) => !term || matches(person, term));
  }, [role, search.committed, staff, status]);
  const { slice, pagination } = paginate(filtered, url.page, PAGE_SIZE);

  useEffect(() => {
    if (roster.data && url.page > pagination.total_pages) url.set({ page: 1 });
  }, [pagination.total_pages, roster.data, url]);

  if (!isAdmin) return <AccessDenied />;

  const isFiltered = Boolean(search.text || role || status);
  const clear = () => {
    search.setText("");
    url.set({ q: "", role: "", status: "", page: 1 });
  };
  const tabs: Array<{ value: StaffRole | ""; label: string; count: number }> = [
    { value: "", label: "All staff", count: staff.length },
    ...STAFF_ROLES.map((item) => ({ value: item, label: ROLE_PLURAL[item], count: roleCounts[item] })),
  ];

  return (
    <div className="space-y-5">
      <ConfigPageHeader
        icon="idCard"
        showBackLink={false}
        title="Staff"
        description="Admins and officers who run the dashboard. Invite colleagues, change roles and control access."
        actions={<Button onClick={() => setInviting(true)}><Icon name="userPlus" className="size-4" />Invite staff</Button>}
      />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div role="tablist" aria-label="Filter by role" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {tabs.map((tab) => {
            const active = role === tab.value;
            return (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => url.set({ role: tab.value, page: 1 })}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition pointer-coarse:py-2.5 ${active ? "bg-brand text-brand-foreground" : "bg-subtle text-muted hover:text-foreground"}`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${active ? "bg-brand-foreground/20" : "bg-background/60"}`}>{roster.isLoading ? "…" : tab.count}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_auto]">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search name, username, email or phone" label="Search staff" />
          <Select label="Status" hideLabel value={status} onChange={(event) => url.set({ status: event.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Button variant="secondary" onClick={clear} disabled={!isFiltered}>Clear</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {roster.isLoading ? (
          <SkeletonRows rows={6} columns={4} />
        ) : roster.isError ? (
          <ErrorState message={roster.error.message} onRetry={() => roster.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="idCard" title={staff.length === 0 ? "No staff yet" : "No staff match"} action={isFiltered ? <Button variant="secondary" onClick={clear}>Reset filters</Button> : undefined}>
            {staff.length === 0 ? "Invite a colleague to give them access to the dashboard." : "Try another search or remove a filter."}
          </EmptyState>
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Person</span>
              <span>Role</span>
              <span>Contact</span>
              <span>Security</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-border">
              {slice.map((person) => {
                const secured = person.two_factor_enabled || person.totp_enabled;
                return (
                  <li key={person.id}>
                    <Link href={`/staff/${person.id}`} className={`grid items-center gap-x-4 gap-y-2.5 px-4 py-4 transition hover:bg-subtle/50 focus-visible:bg-subtle/50 focus-visible:outline-none sm:px-6 ${ROW_GRID}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar person={person} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {fullName(person)}
                            {person.id === me.id && <span className="ml-2 align-middle"><Badge tone="brand">You</Badge></span>}
                          </p>
                          <p className="truncate text-xs text-muted">@{person.username}</p>
                        </div>
                      </div>
                      <div><RoleBadge role={person.user_type} /></div>
                      <div className="min-w-0 text-sm">
                        <p className="truncate">{person.email ?? "-"}</p>
                        {person.phone_number && <p className="truncate text-xs text-muted">{person.phone_number}</p>}
                      </div>
                      <div><Badge tone={secured ? "success" : "neutral"}>{secured ? "2FA on" : "2FA off"}</Badge></div>
                      <div><ActiveBadge active={person.is_active} /></div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination pagination={pagination} onPage={(page) => url.set({ page })} noun="staff" />
          </>
        )}
      </section>

      <InviteStaffDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
