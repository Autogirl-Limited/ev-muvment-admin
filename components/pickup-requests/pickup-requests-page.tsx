"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  approvePickupRequest,
  listPickupRequests,
  rejectPickupRequest,
  type PickupRequest,
  type PickupRequestStatus,
} from "@/lib/api/pickup-requests";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { LIST_PAGE_SIZE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const STATUS_TABS: { value: PickupRequestStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

const STATUS_TONE: Record<PickupRequestStatus, "brand" | "success" | "danger"> = {
  PENDING: "brand",
  APPROVED: "success",
  REJECTED: "danger",
};

const trimTime = (time: string) => time.slice(0, 5);

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function ApproveDialog({ request, onClose }: { request: PickupRequest | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () => {
      if (!request) throw new Error("No request selected");
      const adjusted = start && end && (start !== trimTime(request.requested_start_time) || end !== trimTime(request.requested_end_time));
      return approvePickupRequest(request.id, adjusted ? { start_time: start, end_time: end, notes } : { notes });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pickupRequests.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleOverrides.all });
      toast.success(`Approved. ${updated.vehicle.name}'s pick-up window is now set for ${updated.requested_date}.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pickupRequests.all });
        toast.info("Someone already reviewed this request.");
        onClose();
        return;
      }
      setError(errorText(err, "Couldn't approve this request."));
    },
  });

  const startValue = start || (request ? trimTime(request.requested_start_time) : "");
  const endValue = end || (request ? trimTime(request.requested_end_time) : "");

  return (
    <Modal open={request !== null} onClose={onClose} title="Approve pick-up request" size="lg">
      {request && (
        <div className="space-y-4">
          <div className="rounded-lg bg-subtle/60 p-3.5 text-sm">
            <p className="font-medium">{request.vehicle.name} ({request.vehicle.plate_number})</p>
            <p className="mt-1 text-muted">{request.reason}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start time" type="time" step={60} value={startValue} onChange={(e) => setStart(e.target.value)} />
            <Field label="End time" type="time" step={60} value={endValue} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <p className="text-xs text-muted">The driver will be notified of whatever window you approve here, not necessarily what they asked for.</p>
          <Field label="Note to driver (optional)" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} placeholder="Approved with a slightly earlier window" />
          {error && <Alert tone="error">{error}</Alert>}
          <ModalActions>
            <Button variant="secondary" onClick={onClose} disabled={approve.isPending}>Cancel</Button>
            <Button onClick={() => { setError(null); approve.mutate(); }} loading={approve.isPending}>Approve request</Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

function RejectDialog({ request, onClose }: { request: PickupRequest | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reject = useMutation({
    mutationFn: () => rejectPickupRequest(request!.id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pickupRequests.all });
      toast.success("Request rejected. The driver was notified.");
      onClose();
      setNotes("");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pickupRequests.all });
        toast.info("Someone already reviewed this request.");
        onClose();
        return;
      }
      setError(errorText(err, "Couldn't reject this request."));
    },
  });

  return (
    <Modal open={request !== null} onClose={onClose} title="Reject pick-up request" size="lg">
      {request && (
        <div className="space-y-4">
          <div className="rounded-lg bg-subtle/60 p-3.5 text-sm">
            <p className="font-medium">{request.vehicle.name} ({request.vehicle.plate_number})</p>
            <p className="mt-1 text-muted">{request.reason}</p>
          </div>
          <Field label="Note to driver (optional, but encouraged)" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} placeholder="Too close to the drop-off window" />
          {error && <Alert tone="error">{error}</Alert>}
          <ModalActions>
            <Button variant="secondary" onClick={onClose} disabled={reject.isPending}>Cancel</Button>
            <Button onClick={() => { setError(null); reject.mutate(); }} loading={reject.isPending} className="bg-danger text-white hover:bg-danger/90">
              Reject request
            </Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

export function PickupRequestsPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const url = useUrlState();
  const tab = (url.get("status") || "PENDING") as PickupRequestStatus | "ALL";

  const [approving, setApproving] = useState<PickupRequest | null>(null);
  const [rejecting, setRejecting] = useState<PickupRequest | null>(null);

  const filters = { page: url.page, page_size: LIST_PAGE_SIZE, status: tab === "ALL" ? undefined : tab };
  const requests = useQuery({
    queryKey: queryKeys.pickupRequests.list(filters),
    queryFn: ({ signal }) => listPickupRequests(filters, signal),
    enabled: isStaff,
    refetchOnWindowFocus: true,
  });

  if (!isStaff) return <AccessDenied />;

  const items = requests.data?.items ?? [];

  return (
    <div>
      <ConfigPageHeader
        icon="clock"
        title="Pick-up requests"
        description="Drivers running late ask for a later pick-up window here. Approving applies it automatically as a one-day schedule override for that vehicle."
        showBackLink={false}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
          {STATUS_TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => url.set({ status: item.value === "PENDING" ? undefined : item.value })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                tab === item.value ? "bg-brand text-brand-foreground" : "bg-subtle text-muted hover:bg-subtle/70 hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {requests.isLoading ? (
          <SkeletonRows rows={6} columns={5} />
        ) : requests.isError ? (
          <ErrorState message={requests.error.message} onRetry={() => requests.refetch()} />
        ) : items.length > 0 ? (
          <>
            <ul className="divide-y divide-border">
              {items.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{request.vehicle.name}</p>
                      <span className="font-mono text-xs text-muted">{request.vehicle.plate_number}</span>
                      <Badge tone={STATUS_TONE[request.status]} dot>{request.status}</Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {request.requested_date} · {trimTime(request.requested_start_time)}–{trimTime(request.requested_end_time)}
                    </p>
                    <p className="max-w-xl truncate text-sm" title={request.reason}>{request.reason}</p>
                    <p className="text-xs text-muted">
                      Requested {formatRelative(request.created_at)}
                      {request.status !== "PENDING" && request.reviewed_at && ` · Reviewed ${formatDateTime(request.reviewed_at)}`}
                      {request.review_notes && ` · "${request.review_notes}"`}
                    </p>
                  </div>
                  {isAdmin && request.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" onClick={() => setRejecting(request)}>Reject</Button>
                      <Button onClick={() => setApproving(request)}>Approve</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination pagination={requests.data?.pagination} onPage={(page) => url.set({ page })} noun="requests" />
          </>
        ) : (
          <EmptyState icon="clock" title={tab === "PENDING" ? "No pending requests" : "No requests here"}>
            {tab === "PENDING" ? "Every driver's pick-up request has been reviewed." : "Nothing matches this filter yet."}
          </EmptyState>
        )}
      </section>

      {!isAdmin && (
        <div className="mt-4">
          <Alert tone="info">You can view pick-up requests, but only administrators can approve or reject them.</Alert>
        </div>
      )}

      <ApproveDialog key={approving?.id ?? "approve"} request={approving} onClose={() => setApproving(null)} />
      <RejectDialog key={rejecting?.id ?? "reject"} request={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}
