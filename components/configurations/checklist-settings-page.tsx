"use client";

import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ChecklistLocationEditor } from "@/components/configurations/checklist-location-editor";
import { ConfigPageHeader, ErrorState, Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { updateChecklistSettings, type AIProvider, type ChecklistSettings } from "@/lib/api/checklists-groups";
import { updateChecklistSettingsFor, type StateChecklistSettings } from "@/lib/api/states";
import {
  MAX_GRACE,
  PHASES,
  PHASE_LABEL,
  PROVIDER_LABEL,
  AI_MODEL_OPTIONS,
  buildPatch,
  describeChanges,
  toForm,
  validate,
  warningsFor,
  type FormErrors,
  type Phase,
  type PhaseForm,
  type SettingsForm,
} from "@/lib/checklist-form";
import { LAGOS, formatDateTime } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useStaffNames } from "@/lib/query/staff-names";
import { useCurrentUser } from "@/lib/query/user";

const PHASE_BLURB: Record<Phase, string> = {
  pick_up: "When drivers collect their vehicle each morning.",
  drop_off: "When drivers hand their vehicle back each evening.",
};

const CUSTOM_MODEL = "__custom__";

const nowInLagos = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

const timeInput =
  "h-10 w-full rounded-lg border bg-surface px-3 text-sm tabular-nums outline-none transition pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5 ${className}`}>{children}</section>;
}

function TimeField({ label, value, onChange, invalid }: { label: string; value: string; onChange: (value: string) => void; invalid: boolean }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input
        id={id}
        type="time"
        step={60}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        className={`${timeInput} ${invalid ? "border-danger" : "border-input"}`}
      />
    </div>
  );
}

function PhaseCard({
  phase,
  form,
  saved,
  errors,
  onChange,
}: {
  phase: Phase;
  form: PhaseForm;
  saved: ChecklistSettings;
  errors: FormErrors;
  onChange: (next: PhaseForm) => void;
}) {
  const label = PHASE_LABEL[phase];
  const windowError = errors[`${phase}.window`];
  const geofenced = saved[phase].location !== null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Icon name={phase === "pick_up" ? "arrowUp" : "arrowDown"} className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{label}</h2>
            <p className="text-sm text-muted">{PHASE_BLURB[phase]}</p>
          </div>
        </div>
        <Badge tone={geofenced ? "brand" : "neutral"} dot>{geofenced ? "Geofenced" : "Not geofenced"}</Badge>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Opens" value={form.start} onChange={(start) => onChange({ ...form, start })} invalid={Boolean(windowError)} />
          <TimeField label="Closes" value={form.end} onChange={(end) => onChange({ ...form, end })} invalid={Boolean(windowError)} />
        </div>
        <p className={`mt-1.5 text-xs ${windowError ? "text-danger" : "text-muted"}`}>
          {windowError ?? "Nigeria time (WAT, UTC+1). Both times are inclusive."}
        </p>
      </div>

      <ChecklistLocationEditor phase={phase} value={form.location} onChange={(location) => onChange({ ...form, location })} errors={errors} />
    </Card>
  );
}

function SummaryTile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-subtle/60 p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{children}</dd>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ModelPicker({
  provider,
  value,
  inUse,
  error,
  onChange,
}: {
  provider: AIProvider;
  value: string;
  inUse: string;
  error?: string;
  onChange: (model: string) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const options = AI_MODEL_OPTIONS[provider];
  const trimmed = value.trim();
  const isCustom = customOpen || (trimmed !== "" && !options.includes(trimmed));
  const selected = isCustom ? CUSTOM_MODEL : trimmed;

  return (
    <div className="space-y-2">
      <Select
        label="Model"
        value={selected}
        onChange={(event) => {
          const next = event.target.value;
          setCustomOpen(next === CUSTOM_MODEL);
          if (next !== CUSTOM_MODEL) onChange(next);
        }}
        error={isCustom ? undefined : error}
        hint="Choose a common model, keep the provider default, or use a custom override."
        className="font-mono"
      >
        <option value="">Provider default ({inUse})</option>
        {options.map((model) => (
          <option key={model} value={model}>{model}</option>
        ))}
        <option value={CUSTOM_MODEL}>Custom model override...</option>
      </Select>

      {isCustom && (
        <Field
          label="Custom model override"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          error={error}
          placeholder={options[0]}
          hint="Use this when the exact model is not listed yet."
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      )}

      {trimmed !== "" && (
        <button type="button" onClick={() => { setCustomOpen(false); onChange(""); }} className="text-xs font-medium text-brand hover:underline pointer-coarse:py-2">
          Reset to provider default
        </button>
      )}
    </div>
  );
}

function StateTabs({
  stateId,
  states,
  onSelect,
}: {
  stateId: string | null;
  states: { id: string; name: string }[];
  onSelect: (id: string | null) => void;
}) {
  const tabClass = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-brand text-brand-foreground" : "bg-subtle text-muted hover:bg-subtle/70 hover:text-foreground"}`;
  return (
    <div role="tablist" aria-label="Checklist settings scope" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button type="button" role="tab" aria-selected={stateId === null} className={tabClass(stateId === null)} onClick={() => onSelect(null)}>
        Global default
      </button>
      {states.map((state) => (
        <button key={state.id} type="button" role="tab" aria-selected={stateId === state.id} className={tabClass(stateId === state.id)} onClick={() => onSelect(state.id)}>
          {state.name}
        </button>
      ))}
    </div>
  );
}

/** Map an API failure back to form fields; anything left over is shown in the dialog. */
function mapServerErrors(error: unknown): FormErrors {
  const mapped: FormErrors = {};
  if (!(error instanceof ApiError)) return mapped;

  if (error.status === 400) {
    const phase: Phase | null = /pick-up/i.test(error.message) ? "pick_up" : /drop-off/i.test(error.message) ? "drop_off" : null;
    if (phase) mapped[`${phase}.window`] = error.message;
    return mapped;
  }
  if (error.status === 422) {
    for (const [path, issue] of Object.entries(error.fieldErrors)) {
      const nested = /^(pick_up|drop_off)\.(?:location\.)?(start_time|end_time|address|latitude|longitude|radius_meters)$/.exec(path);
      if (nested) {
        const [, phase, field] = nested;
        mapped[field === "start_time" || field === "end_time" ? `${phase}.window` : `${phase}.${field === "radius_meters" ? "radius" : field}`] ??= issue;
      } else if (path === "grace_minutes") mapped.grace = issue;
      else if (path === "ai_model") mapped.model = issue;
    }
  }
  return mapped;
}

export function ChecklistSettingsPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const stateId = url.get("state") || null;

  const states = useQuery({ ...configQueries.states({ page: 1, page_size: 100 }), enabled: isStaff });
  // Fetched regardless of the active tab so a state tab can tell "inheriting" from "forked" by comparing ids.
  // No push channel for staff yet, so notice colleagues' edits by polling while the page is open.
  const globalSettings = useQuery({ ...configQueries.checklistSettings(), enabled: isStaff, refetchInterval: 45_000 });
  const stateSettings = useQuery({
    ...configQueries.stateChecklistSettings(stateId),
    enabled: isStaff && stateId !== null,
    refetchInterval: 45_000,
  });

  const settings = stateId === null ? globalSettings : stateSettings;
  const latest = settings.data;
  const activeState = stateId ? states.data?.items.find((item) => item.id === stateId) : null;
  const isForked = stateId !== null && Boolean(latest && globalSettings.data && latest.id !== globalSettings.data.id);

  // `baseline` is the saved settings the form was built from; the form is the user's working copy.
  const [baseline, setBaseline] = useState<ChecklistSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [now] = useState(nowInLagos);

  const patch = baseline && form ? buildPatch(baseline, form) : {};
  const dirty = Object.keys(patch).length > 0;

  // Reset the working form when the selected tab changes, so a state's settings never bleed into another's form.
  const [loadedFor, setLoadedFor] = useState<string | null>(stateId);
  if (loadedFor !== stateId) {
    setLoadedFor(stateId);
    setBaseline(null);
    setForm(null);
    setServerErrors({});
    setDialogError(null);
  }

  // Adopt the newest settings when there are no unsaved edits (first load, or a colleague saved).
  if (latest && (!baseline || (!dirty && latest.updated_at !== baseline.updated_at))) {
    setBaseline(latest);
    setForm(toForm(latest));
  }
  const changedElsewhere = dirty && latest && baseline && latest.updated_at !== baseline.updated_at;

  const nameOf = useStaffNames([baseline?.updated_by, latest?.updated_by], isAdmin);

  const save = useMutation({
    mutationFn: () => (stateId === null ? updateChecklistSettings(patch) : updateChecklistSettingsFor(stateId, patch)),
    onSuccess: (saved) => {
      // The response is the source of truth: put it in the cache and rebuild the form from it.
      if (stateId === null) queryClient.setQueryData(queryKeys.checklistSettings, saved);
      else queryClient.setQueryData(queryKeys.stateChecklistSettings(stateId), saved as StateChecklistSettings);
      queryClient.invalidateQueries({ queryKey: queryKeys.checklistSettings });
      setBaseline(saved);
      setForm(toForm(saved));
      setServerErrors({});
      setDialogError(null);
      setConfirming(false);
      toast.success(
        stateId === null
          ? "Checklist settings saved. Drivers see the change now."
          : `${activeState?.name ?? "This state"}'s checklist settings saved. Drivers linked to it see the change now.`,
      );
    },
    onError: (error) => {
      const mapped = mapServerErrors(error);
      if (Object.keys(mapped).length > 0) {
        setServerErrors(mapped);
        setConfirming(false);
        toast.error("Some settings need fixing. See the highlighted fields.");
      } else {
        setDialogError(error instanceof ApiError ? error.message : "Couldn't save the settings. Try again.");
      }
    },
  });

  if (!isStaff) return <AccessDenied />;

  const edit = (next: SettingsForm) => {
    setForm(next);
    setServerErrors({});
  };

  const selectState = (id: string | null) => url.set({ state: id ?? undefined });
  const tabs = states.data?.items ?? [];

  if (settings.isError && !latest) {
    return (
      <div>
        <ConfigPageHeader icon="clipboard" title="Checklist settings" />
        <div className="mb-5"><StateTabs stateId={stateId} states={tabs} onSelect={selectState} /></div>
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <ErrorState message={settings.error.message} onRetry={() => settings.refetch()} />
        </div>
      </div>
    );
  }

  if (!baseline || !form) {
    return (
      <div>
        <ConfigPageHeader icon="clipboard" title="Checklist settings" description="When and where drivers do their daily checklists." />
        <div className="mb-5"><StateTabs stateId={stateId} states={tabs} onSelect={selectState} /></div>
        <div role="status" aria-label="Loading" className="animate-pulse space-y-5">
          <div className="h-24 rounded-2xl bg-subtle" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-96 rounded-2xl bg-subtle" />
            <div className="h-96 rounded-2xl bg-subtle" />
          </div>
        </div>
      </div>
    );
  }

  const errors: FormErrors = { ...validate(form), ...serverErrors };
  const hasErrors = Object.keys(errors).length > 0;
  const changes = describeChanges(baseline, form);
  const warnings = warningsFor(baseline, form, now);
  const updatedBy = baseline.updated_by ? (nameOf(baseline.updated_by) ?? "a staff member") : null;
  const changedBy = latest?.updated_by ? (nameOf(latest.updated_by) ?? "someone else") : "someone else";
  const providerChanged = form.provider !== baseline.ai_provider;

  return (
    <div className="pb-24">
      <ConfigPageHeader
        icon="clipboard"
        title="Checklist settings"
        description="When drivers can start their daily pick-up and drop-off checklists, where they must be, and which AI reads the photos."
      />

      <div className="mb-5"><StateTabs stateId={stateId} states={tabs} onSelect={selectState} /></div>

      <div className="space-y-5">
        {activeState && (
          <Alert tone="info">
            {isForked ? (
              <>
                <strong className="font-semibold">{activeState.name}</strong> has its own checklist settings, last changed{" "}
                {formatDateTime(baseline.updated_at)}{updatedBy ? ` by ${updatedBy}` : ""}.
              </>
            ) : (
              <>
                <strong className="font-semibold">{activeState.name}</strong> is currently following the global default. Saving any change here gives{" "}
                {activeState.name} its own checklist settings from now on.
              </>
            )}
          </Alert>
        )}
        {changedElsewhere && (
          <div role="status" className="flex flex-col gap-3 rounded-xl border border-border bg-subtle p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              <strong className="font-semibold">Settings changed by {changedBy}</strong> while you were editing. Your edits are still here.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                if (!latest) return;
                setBaseline(latest);
                setForm(toForm(latest));
                setServerErrors({});
              }}
            >
              <Icon name="refresh" className="size-4" />
              Discard mine and reload
            </Button>
          </div>
        )}

        <Card className="bg-subtle/30">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Pick-up window">
              {baseline.pick_up.start_time.slice(0, 5)} – {baseline.pick_up.end_time.slice(0, 5)}
            </SummaryTile>
            <SummaryTile label="Drop-off window">
              {baseline.drop_off.start_time.slice(0, 5)} – {baseline.drop_off.end_time.slice(0, 5)}
            </SummaryTile>
            <SummaryTile label="AI model in use" sub={`${PROVIDER_LABEL[baseline.ai_provider]}${baseline.ai_model ? "" : " (default)"}`}>
              <span className="font-mono">{baseline.ai_model_in_use}</span>
            </SummaryTile>
            <SummaryTile label="Last updated" sub={updatedBy ? `by ${updatedBy}` : "Never edited"}>
              {formatDateTime(baseline.updated_at)}
            </SummaryTile>
          </dl>
        </Card>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(21rem,0.55fr)]">
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-base font-semibold">Schedule and location</h2>
              <p className="mt-0.5 text-sm text-muted">Set the windows and optional geofences drivers must use for each checklist.</p>
            </div>
            <div className="grid items-start gap-5 2xl:grid-cols-2">
              {PHASES.map((phase) => (
                <PhaseCard
                  key={phase}
                  phase={phase}
                  form={form[phase]}
                  saved={baseline}
                  errors={errors}
                  onChange={(next) => edit({ ...form, [phase]: next })}
                />
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <Card className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Rules</h2>
                <p className="mt-0.5 text-sm text-muted">A small buffer for checklists already in progress.</p>
              </div>
              <Field
                label="Grace period"
                inputMode="numeric"
                value={form.grace}
                onChange={(event) => edit({ ...form, grace: event.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                error={errors.grace}
                hint={`0 to ${MAX_GRACE} minutes.`}
                trailing={<span className="pr-2 text-xs text-muted">min</span>}
              />
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">AI photo analysis</h2>
                <p className="mt-0.5 text-sm text-muted">Choose the provider and model used for new checklist photo reviews.</p>
              </div>
              <Select
                label="Provider"
                value={form.provider}
                onChange={(event) => edit({ ...form, provider: event.target.value as AIProvider, model: "" })}
              >
                {(Object.keys(PROVIDER_LABEL) as AIProvider[]).map((provider) => (
                  <option key={provider} value={provider}>{PROVIDER_LABEL[provider]}</option>
                ))}
              </Select>
              <ModelPicker
                key={form.provider}
                provider={form.provider}
                value={form.model}
                inUse={providerChanged ? AI_MODEL_OPTIONS[form.provider][0] : baseline.ai_model_in_use}
                error={errors.model}
                onChange={(model) => edit({ ...form, model })}
              />
              {providerChanged && (
                <Alert tone="info">
                  The provider must be set up on the server. If it isn&apos;t, new photo analyses will fail. After switching, re-run a recent checklist to check it works.
                </Alert>
              )}
            </Card>
          </aside>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:left-64">
          <div className="mx-auto flex max-w-3xl animate-pop-in flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:pl-5">
            <p className="text-sm">
              <strong className="font-semibold">Unsaved changes</strong>
              <span className="text-muted"> · {changes.length} {changes.length === 1 ? "setting" : "settings"}</span>
              {hasErrors && <span className="block text-xs text-danger sm:inline sm:pl-2">Fix the highlighted fields to save.</span>}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="secondary" onClick={() => { setForm(toForm(baseline)); setServerErrors({}); }}>Discard</Button>
              <Button onClick={() => { setDialogError(null); setConfirming(true); }} disabled={hasErrors}>Review &amp; save</Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={confirming} onClose={() => !save.isPending && setConfirming(false)} title="Review your changes" size="lg">
        <ul className="space-y-2">
          {changes.map((line) => (
            <li key={line} className="flex items-start gap-2.5 rounded-lg bg-subtle/60 px-3 py-2.5 text-sm">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="min-w-0 break-words">{line}</span>
            </li>
          ))}
        </ul>
        {warnings.map((warning) => <Alert key={warning} tone="error">{warning}</Alert>)}
        <p className="text-sm text-muted">
          These apply to checklists started from now on. Checklists already started keep their old window and location. Drivers are notified live.
        </p>
        {dialogError && <Alert tone="error">{dialogError}</Alert>}
        <ModalActions>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={save.isPending}>Keep editing</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save changes</Button>
        </ModalActions>
      </Modal>
    </div>
  );
}
