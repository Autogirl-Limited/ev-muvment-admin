"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { getDriverKyc, saveDriverKyc, type KycStatus } from "@/lib/api/staff";
import { queryKeys } from "@/lib/query/keys";

type IdType = "nin" | "bvn";

const ID_LABELS: Record<IdType, string> = { nin: "NIN", bvn: "BVN" };

function summary(kyc: KycStatus) {
  if (kyc.has_bvn && kyc.has_nin) return "BVN and NIN on file";
  if (kyc.has_bvn) return "BVN on file";
  if (kyc.has_nin) return "NIN on file";
  return "No BVN or NIN on file";
}

/** Whether the driver's BVN / NIN is on file (never the number itself), with a way to add it for them. */
export function DriverKycRow({ userId }: { userId: string }) {
  const kyc = useQuery({
    queryKey: queryKeys.driverKyc(userId),
    queryFn: ({ signal }) => getDriverKyc(userId, signal),
  });
  const [open, setOpen] = useState(false);

  if (kyc.isPending) return null;
  if (kyc.isError) {
    return (
      <div className="border-t border-border px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">Couldn&apos;t check this driver&apos;s BVN / NIN.</p>
      </div>
    );
  }

  const missing = !kyc.data.has_kyc;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{summary(kyc.data)}</p>
        <p className="text-xs text-muted">
          {missing
            ? "Needed to recreate their main bank account. The driver is asked for it in the app."
            : "Used if their main bank account ever needs recreating."}
        </p>
      </div>
      <Button variant={missing ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {missing ? "Add BVN / NIN" : "Replace"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add BVN or NIN">
        <KycForm userId={userId} onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function KycForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [idType, setIdType] = useState<IdType>("nin");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const save = useMutation({
    mutationFn: () => saveDriverKyc(userId, { [idType]: value }),
    onSuccess: (kyc) => {
      queryClient.setQueryData(queryKeys.driverKyc(userId), kyc);
      toast.success(`${ID_LABELS[idType]} saved.`);
      onDone();
    },
    onError: (err) => {
      const fieldError = err instanceof ApiError ? err.fieldErrors?.[idType] : undefined;
      setError(fieldError ?? err.message);
    },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!/^\d{11}$/.test(value)) {
          setError(`A ${ID_LABELS[idType]} is 11 digits.`);
          return;
        }
        save.mutate();
      }}
    >
      <p className="text-sm text-muted">
        Only enter a number the driver gave you. It&apos;s stored encrypted and never shown again.
      </p>
      <div role="radiogroup" aria-label="ID type" className="inline-flex rounded-lg border border-border bg-subtle p-1">
        {(Object.keys(ID_LABELS) as IdType[]).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={idType === type}
            onClick={() => {
              setIdType(type);
              setError(undefined);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${idType === type ? "bg-surface shadow-card" : "text-muted hover:text-foreground"}`}
          >
            {ID_LABELS[type]}
          </button>
        ))}
      </div>
      <Field
        label={idType === "nin" ? "National Identification Number" : "Bank Verification Number"}
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value.replace(/\D/g, ""));
          setError(undefined);
        }}
        error={error}
        disabled={save.isPending}
      />
      {save.isError && !error && <Alert tone="error">{save.error.message}</Alert>}
      <ModalActions>
        <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={value.length !== 11}>
          Save
        </Button>
      </ModalActions>
    </form>
  );
}
