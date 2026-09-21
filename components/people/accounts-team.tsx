"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardLink } from "@/components/people/people-parts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { ACCOUNTS_TEAM_GROUP_NAME, addGroupMember, getGroup, isAccountsTeam, listGroups, removeGroupMember } from "@/lib/api/checklists-groups";
import type { ManagedUser } from "@/lib/api/users";
import { fullName } from "@/lib/format";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/**
 * The ACCOUNTS TEAM group decides who receives live payment alerts. The API
 * finds it by name, so it's located the same way here. Invited staff aren't
 * added automatically.
 */
export function useAccountsTeam(enabled = true) {
  const filters = { searchTerm: ACCOUNTS_TEAM_GROUP_NAME, page: 1, page_size: 20 };
  const list = useQuery({
    queryKey: queryKeys.groups.list(filters),
    queryFn: ({ signal }) => listGroups(filters, signal),
    enabled,
    ...CACHE.list,
  });
  const summary = list.data?.items.find((group) => isAccountsTeam(group.name));
  const detail = useQuery({
    queryKey: queryKeys.groups.detail(summary?.id ?? ""),
    queryFn: ({ signal }) => getGroup(summary!.id, signal),
    enabled: enabled && Boolean(summary),
    ...CACHE.list,
  });
  return {
    groupId: summary?.id ?? null,
    members: detail.data?.members ?? null,
    isLoading: list.isLoading || (Boolean(summary) && detail.isLoading),
    isError: list.isError || detail.isError,
    /** The list loaded but there is no group with that name. */
    isMissing: list.isSuccess && !summary,
    refetch: () => {
      list.refetch();
      detail.refetch();
    },
  };
}

export function useSetAccountsTeamMembership(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, member }: { userId: string; member: boolean }) => (member ? addGroupMember(groupId!, userId) : removeGroupMember(groupId!, userId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.groups.all }),
  });
}

/** Staff detail card: is this person on the payment-alert list, and add or remove them. */
export function AccountsTeamCard({ user }: { user: ManagedUser }) {
  const toast = useToast();
  const team = useAccountsTeam();
  const setMembership = useSetAccountsTeamMembership(team.groupId);
  const isMember = team.members?.some((member) => member.id === user.id) ?? false;

  const toggle = () =>
    setMembership.mutate(
      { userId: user.id, member: !isMember },
      {
        onSuccess: () => toast.success(isMember ? `${fullName(user)} was removed from the Accounts Team.` : `${fullName(user)} was added to the Accounts Team.`),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't update the Accounts Team."),
      },
    );

  return (
    <Card title="Accounts Team" icon="bell" action={team.groupId ? <CardLink href={`/configurations/groups/${team.groupId}`}>Open group</CardLink> : undefined}>
      <div className="space-y-3 p-4 text-sm sm:p-5">
        {team.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-subtle/50" />
        ) : team.isError ? (
          <Alert tone="error">Couldn&apos;t load the Accounts Team. <button type="button" onClick={team.refetch} className="font-medium underline">Try again</button></Alert>
        ) : team.isMissing ? (
          <p className="text-muted">
            There is no group named &ldquo;{ACCOUNTS_TEAM_GROUP_NAME}&rdquo; yet. Create it under <Link href="/configurations/groups" className="font-medium text-brand hover:underline">Configurations → Groups</Link> to send live payment alerts.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={isMember ? "success" : "neutral"} dot={isMember}>{isMember ? "Receives payment alerts" : "Not on the team"}</Badge>
            </div>
            <p className="text-muted">
              {isMember
                ? "They get live wallet and bank-transfer alerts, in the app and by email."
                : "Add them to get live wallet and bank-transfer alerts, in the app and by email."}
            </p>
            {!user.is_active && isMember && <p className="text-xs text-danger">This account is deactivated but still on the team, so alert emails are still sent to it.</p>}
            <Button variant={isMember ? "secondary" : "primary"} onClick={toggle} loading={setMembership.isPending} fullWidth>
              {isMember ? "Remove from Accounts Team" : "Add to Accounts Team"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
