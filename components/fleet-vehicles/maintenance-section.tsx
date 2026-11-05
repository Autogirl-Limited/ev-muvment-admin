"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import type { Vehicle } from "@/lib/api/configuration";
import {
  createMaintenanceRecord,
  getMaintenanceRecord,
  listMaintenanceRecords,
  updateMaintenanceRecord,
  uploadMaintenanceReceipt,
  voidMaintenanceRecord,
  type MaintenanceRecord,
  type MaintenanceRecordInput,
  type MaintenanceReceipt,
  type MaintenanceType,
} from "@/lib/api/vehicle-maintenance";
import { formatDate, naira } from "@/lib/format";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

const TYPE_LABELS: Record<MaintenanceType, string> = {
  ROUTINE_SERVICE: "Routine service",
  TYRES: "Tyres",
  BRAKES: "Brakes",
  BATTERY: "Battery",
  ELECTRICAL: "Electrical",
  BODY_REPAIR: "Body repair",
  INSPECTION: "Inspection",
  OTHER: "Other",
};

const MAINTENANCE_TYPES = Object.keys(TYPE_LABELS) as MaintenanceType[];
const todayInLagos = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const optional = (value: string) => value.trim() || null;
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message : fallback;

interface FormState {
  maintenanceType: MaintenanceType;
  workPerformed: string;
  completedOn: string;
  serviceProvider: string;
  costAmount: string;
  partsReplaced: string;
  notes: string;
  nextServiceDate: string;
}

function initialForm(record: MaintenanceRecord | null): FormState {
  return {
    maintenanceType: record?.maintenance_type ?? "ROUTINE_SERVICE",
    workPerformed: record?.work_performed ?? "",
    completedOn: record?.completed_on ?? todayInLagos(),
    serviceProvider: record?.service_provider ?? "",
    costAmount: record?.cost_amount == null ? "" : String(record.cost_amount),
    partsReplaced: record?.parts_replaced ?? "",
    notes: record?.notes ?? "",
    nextServiceDate: record?.next_service_date ?? "",
  };
}

function MaintenanceForm({
  vehicle,
  record,
  onClose,
}: {
  vehicle: Vehicle;
  record: MaintenanceRecord | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => initialForm(record));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const receiptInput = receipt ? await uploadMaintenanceReceipt(vehicle.id, receipt) : undefined;
      const input: MaintenanceRecordInput = {
        maintenance_type: form.maintenanceType,
        work_performed: form.workPerformed.trim(),
        completed_on: form.completedOn,
        service_provider: optional(form.serviceProvider),
        cost_amount: form.costAmount ? Number(form.costAmount) : null,
        currency: form.costAmount ? "NGN" : null,
        parts_replaced: optional(form.partsReplaced),
        notes: optional(form.notes),
        next_service_date: form.nextServiceDate || null,
        ...(receiptInput ? { receipt: receiptInput } : {}),
      };
      return record
        ? updateMaintenanceRecord(vehicle.id, record.id, input)
        : createMaintenanceRecord(vehicle.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMaintenance.all });
      toast.success(record ? "Maintenance record updated." : "Maintenance recorded.");
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) setErrors(error.fieldErrors);
      setApiError(errorMessage(error, "Could not save this maintenance record."));
    },
  });

  const change = (next: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...next }));
    setErrors({});
    setApiError(null);
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.workPerformed.trim()) nextErrors.work_performed = "Describe the work that was completed.";
    if (!form.completedOn) nextErrors.completed_on = "Choose the completion date.";
    else if (form.completedOn > todayInLagos()) nextErrors.completed_on = "Completion date cannot be in the future.";
    if (form.costAmount && (!Number.isFinite(Number(form.costAmount)) || Number(form.costAmount) < 0)) {
      nextErrors.cost_amount = "Enter a valid non-negative amount.";
    }
    if (form.nextServiceDate && form.completedOn && form.nextServiceDate < form.completedOn) {
      nextErrors.next_service_date = "Next service cannot be before completion.";
    }
    if (receipt && !["application/pdf", "image/jpeg", "image/png"].includes(receipt.type)) {
      nextErrors.receipt = "Choose a PDF, JPEG, or PNG file.";
    }
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length === 0) save.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Maintenance type" value={form.maintenanceType} onChange={(event) => change({ maintenanceType: event.target.value as MaintenanceType })}>
          {MAINTENANCE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
        </Select>
        <Field label="Completed on" type="date" max={todayInLagos()} value={form.completedOn} onChange={(event) => change({ completedOn: event.target.value })} error={errors.completed_on} />
      </div>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Work performed</span>
        <textarea
          value={form.workPerformed}
          onChange={(event) => change({ workPerformed: event.target.value.slice(0, 4000) })}
          rows={4}
          aria-invalid={errors.work_performed ? true : undefined}
          className={`w-full resize-y rounded-lg border bg-surface px-3 py-2 outline-none transition pointer-coarse:text-base focus:ring-3 ${errors.work_performed ? "border-danger focus:border-danger focus:ring-danger/20" : "border-input focus:border-brand focus:ring-brand/20"}`}
          placeholder="Describe the completed work"
        />
        {errors.work_performed && <span className="block text-xs text-danger">{errors.work_performed}</span>}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service provider (optional)" value={form.serviceProvider} maxLength={150} onChange={(event) => change({ serviceProvider: event.target.value })} />
        <Field label="Cost in NGN (optional)" type="number" min="0" step="0.01" value={form.costAmount} onChange={(event) => change({ costAmount: event.target.value })} error={errors.cost_amount} />
      </div>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Parts replaced (optional)</span>
        <textarea value={form.partsReplaced} onChange={(event) => change({ partsReplaced: event.target.value.slice(0, 2000) })} rows={2} className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 outline-none transition pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20" />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Notes (optional)</span>
        <textarea value={form.notes} onChange={(event) => change({ notes: event.target.value.slice(0, 4000) })} rows={2} className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 outline-none transition pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20" />
      </label>

      <Field label="Next service date (optional)" type="date" min={form.completedOn || undefined} value={form.nextServiceDate} onChange={(event) => change({ nextServiceDate: event.target.value })} error={errors.next_service_date} />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="maintenance-receipt">Receipt or supporting document (optional)</label>
        <input
          id="maintenance-receipt"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => { setReceipt(event.target.files?.[0] ?? null); setApiError(null); }}
          className="block w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:font-medium"
        />
        <p className="text-xs text-muted">PDF, JPEG, or PNG. You can save the record without a file.</p>
        {record?.receipt && !receipt && <p className="text-xs text-muted">Current file: {record.receipt.file_name}</p>}
        {errors.receipt && <p className="text-xs text-danger">{errors.receipt}</p>}
      </div>

      {apiError && <Alert tone="error">{apiError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button onClick={submit} loading={save.isPending}>{record ? "Save changes" : "Record maintenance"}</Button>
      </ModalActions>
    </div>
  );
}

function RecordCard({
  record,
  canManage,
  isAdmin,
  onEdit,
  onVoid,
  onPreview,
  previewing,
}: {
  record: MaintenanceRecord;
  canManage: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onVoid: () => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{TYPE_LABELS[record.maintenance_type]}</p>
            <Badge tone="success">Completed</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{formatDate(record.completed_on)}</p>
        </div>
        <div className="flex gap-1">
          {canManage && <Button variant="ghost" onClick={onEdit}>Edit</Button>}
          {isAdmin && <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={onVoid}>Void</Button>}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm">{record.work_performed}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {record.service_provider && <div><dt className="text-xs text-muted">Service provider</dt><dd>{record.service_provider}</dd></div>}
        {record.cost_amount != null && <div><dt className="text-xs text-muted">Cost</dt><dd>{naira(Number(record.cost_amount), 2)}</dd></div>}
        {record.parts_replaced && <div><dt className="text-xs text-muted">Parts replaced</dt><dd className="whitespace-pre-wrap">{record.parts_replaced}</dd></div>}
        {record.next_service_date && <div><dt className="text-xs text-muted">Next service</dt><dd>{formatDate(record.next_service_date)}</dd></div>}
      </dl>
      {record.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-subtle/60 p-3 text-sm text-muted">{record.notes}</p>}
      {record.receipt && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onPreview} loading={previewing}>
            {!previewing && <Icon name="zoomIn" className="size-4" />}
            Preview receipt
          </Button>
          <span className="min-w-0 truncate text-xs text-muted">{record.receipt.file_name}</span>
        </div>
      )}
    </li>
  );
}

export function MaintenanceSection({
  vehicle,
  canManage,
  isAdmin,
}: {
  vehicle: Vehicle;
  canManage: boolean;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MaintenanceRecord | "new" | null>(null);
  const [voiding, setVoiding] = useState<MaintenanceRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MaintenanceReceipt | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const history = useQuery({
    queryKey: queryKeys.vehicleMaintenance.list(vehicle.id, page),
    queryFn: ({ signal }) => listMaintenanceRecords(vehicle.id, page, signal),
    placeholderData: keepPreviousData,
    ...CACHE.live,
  });

  const voidRecord = useMutation({
    mutationFn: () => voidMaintenanceRecord(vehicle.id, voiding!.id, voidReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMaintenance.all });
      toast.success("Maintenance record voided.");
      setVoiding(null);
      setVoidReason("");
    },
    onError: (error) => setVoidError(errorMessage(error, "Could not void this record.")),
  });

  const loadPreview = useMutation({
    mutationFn: (recordId: string) => getMaintenanceRecord(vehicle.id, recordId),
    onSuccess: (record) => {
      if (!record.receipt) {
        setPreviewError("This receipt is no longer attached to the maintenance record.");
        return;
      }
      setPreviewError(null);
      setPreview(record.receipt);
    },
    onError: (error) => setPreviewError(errorMessage(error, "Could not load this receipt.")),
  });

  const items = history.data?.items ?? [];
  const pagination = history.data?.pagination;

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted">Maintenance history</p>
          <p className="mt-1 text-sm text-muted">Completed service and repair work for this vehicle.</p>
        </div>
        {canManage && <Button variant="secondary" className="py-3" onClick={() => setEditing("new")}>Record maintenance</Button>}
      </div>

      <div className="mt-4">
        {history.isLoading ? (
          <div className="h-28 animate-pulse rounded-lg bg-subtle" />
        ) : history.isError ? (
          <Alert tone="error">{history.error.message}</Alert>
        ) : items.length === 0 ? (
          <EmptyState icon="car" title="No maintenance recorded">Completed maintenance will appear here.</EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  canManage={canManage}
                  isAdmin={isAdmin}
                  onEdit={() => setEditing(record)}
                  onVoid={() => { setVoiding(record); setVoidReason(""); setVoidError(null); }}
                  onPreview={() => { setPreviewError(null); loadPreview.mutate(record.id); }}
                  previewing={loadPreview.isPending && loadPreview.variables === record.id}
                />
              ))}
            </ul>
            {pagination && pagination.total_pages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <Button variant="secondary" disabled={!pagination.has_prev} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                <span className="text-muted">Page {pagination.page} of {pagination.total_pages}</span>
                <Button variant="secondary" disabled={!pagination.has_next} onClick={() => setPage((current) => current + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? `Record maintenance for ${vehicle.name}` : `Edit maintenance for ${vehicle.name}`} size="lg">
        {editing && <MaintenanceForm vehicle={vehicle} record={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>

      <Modal open={voiding !== null} onClose={voidRecord.isPending ? () => {} : () => setVoiding(null)} title="Void maintenance record">
        <div className="space-y-4">
          <Alert tone="info">The record remains in the audit history but is removed from the active maintenance list.</Alert>
          <Field label="Reason" value={voidReason} maxLength={500} onChange={(event) => { setVoidReason(event.target.value); setVoidError(null); }} placeholder="Why is this record being voided?" />
          {voidError && <Alert tone="error">{voidError}</Alert>}
          <ModalActions>
            <Button variant="secondary" onClick={() => setVoiding(null)} disabled={voidRecord.isPending}>Cancel</Button>
            <Button variant="danger" disabled={voidReason.trim().length < 3} loading={voidRecord.isPending} onClick={() => voidRecord.mutate()}>Void record</Button>
          </ModalActions>
        </div>
      </Modal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.file_name ?? "Receipt preview"} size="xl">
        {preview && (
          <div className="space-y-4">
            {preview.content_type === "application/pdf" ? (
              <iframe
                src={preview.preview_url}
                title={`Preview of ${preview.file_name}`}
                className="h-[min(70dvh,48rem)] w-full rounded-lg border border-border bg-white"
              />
            ) : (
              // The backend only accepts JPEG and PNG images here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.preview_url} alt={`Receipt ${preview.file_name}`} className="mx-auto max-h-[70dvh] max-w-full rounded-lg object-contain" />
            )}
            <div className="flex justify-end">
              <a href={preview.download_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:brightness-95">
                <Icon name="download" className="size-4" />
                Download receipt
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={previewError !== null} onClose={() => setPreviewError(null)} title="Receipt unavailable">
        {previewError && <Alert tone="error">{previewError}</Alert>}
      </Modal>
    </section>
  );
}
