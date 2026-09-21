"use client";

import type { ManagedUser } from "@/lib/api/users";
import { useRoster } from "@/lib/query/users";
import { useCurrentUser } from "@/lib/query/user";

export interface UserGuards {
  isSelf: boolean;
  /** `null` when allowed, otherwise the reason to show next to the disabled action. */
  deactivate: string | null;
  changeRole: string | null;
  remove: string | null;
}

/**
 * The API lets an admin deactivate, demote or delete themselves or the last
 * active admin, which would lock everyone out. These checks live in the UI.
 * While the staff roster is still loading, admin targets are treated as the
 * last admin, so the risky actions stay off until we know.
 */
export function useUserGuards(target: ManagedUser | null | undefined): UserGuards {
  const me = useCurrentUser();
  const staff = useRoster("STAFF", target?.user_type === "ADMIN");
  if (!target) return { isSelf: false, deactivate: null, changeRole: null, remove: null };

  const isSelf = target.id === me.id;
  const activeAdmins = staff.data?.filter((person) => person.user_type === "ADMIN" && person.is_active).length ?? 0;
  const lastAdmin = target.user_type === "ADMIN" && target.is_active && activeAdmins <= 1;

  const block = (action: string) => (isSelf ? `You can't ${action} your own account.` : lastAdmin ? `This is the last active admin, so you can't ${action} it.` : null);
  return {
    isSelf,
    deactivate: block("deactivate"),
    changeRole: target.user_type === "DRIVER" ? "Drivers can't be given a staff role." : block("change the role of"),
    remove: block("delete"),
  };
}
