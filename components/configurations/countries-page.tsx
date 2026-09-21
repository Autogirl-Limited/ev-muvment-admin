"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, IconButton, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { createCountry, deleteCountry, diff, updateCountry, type Country, type CountryInput } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { LIST_PAGE_SIZE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const CONTINENTS = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"];
const ROW_GRID = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_6rem]";

interface FormState {
  name: string;
  continent: string;
  country_code: string;
  currency_name: string;
  currency_symbol: string;
  is_active: boolean;
}

const EMPTY: FormState = { name: "", continent: "", country_code: "", currency_name: "", currency_symbol: "", is_active: true };

function fromCountry(country: Country): FormState {
  const { name, continent, country_code, currency_name, currency_symbol, is_active } = country;
  return { name, continent, country_code, currency_name, currency_symbol, is_active };
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const required = (key: "name" | "continent" | "currency_name" | "currency_symbol", label: string, max: number) => {
    const value = form[key].trim();
    if (!value) errors[key] = `${label} is required.`;
    else if (value.length > max) errors[key] = `${label} can be at most ${max} characters.`;
  };
  required("name", "Name", 100);
  required("continent", "Continent", 50);
  required("currency_name", "Currency name", 50);
  required("currency_symbol", "Currency symbol", 10);
  if (form.country_code.length < 2) errors.country_code = "Use a 2 or 3 letter code, like NG.";
  return errors;
}

function CountryForm({
  country,
  onClose,
}: {
  country: Country | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(country ? fromCountry(country) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const clean: CountryInput = {
        name: form.name.trim(),
        continent: form.continent.trim(),
        country_code: form.country_code.trim().toUpperCase(),
        currency_name: form.currency_name.trim(),
        currency_symbol: form.currency_symbol.trim(),
        is_active: form.is_active,
      };
      if (!country) return createCountry(clean);
      const changes = diff(clean, country);
      return Object.keys(changes).length ? updateCountry(country.id, changes) : country;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.countries.all });
      toast.success(country ? `${saved.name} updated.` : `${saved.name} added.`);
      onClose();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return setFormError("Couldn't save this country. Try again.");
      if (error.status === 409) {
        const message = "A country with this name or code already exists.";
        setErrors({ name: message, country_code: message });
      } else if (error.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys.countries.all });
        setFormError("This country was removed by someone else.");
      } else if (error.status === 422 && Object.keys(error.fieldErrors).length) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(error.message);
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} placeholder="Ghana" autoComplete="off" maxLength={100} />
        <div>
          <Field
            label="Continent"
            value={form.continent}
            onChange={(e) => set("continent", e.target.value)}
            error={errors.continent}
            placeholder="Africa"
            autoComplete="off"
            list="continent-options"
            maxLength={50}
          />
          <datalist id="continent-options">
            {CONTINENTS.map((continent) => <option key={continent} value={continent} />)}
          </datalist>
        </div>
        <Field
          label="Country code"
          value={form.country_code}
          onChange={(e) => set("country_code", e.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3))}
          error={errors.country_code}
          hint="2 or 3 letters, e.g. NG"
          placeholder="GH"
          autoComplete="off"
          autoCapitalize="characters"
          className="font-mono uppercase"
        />
        <Field label="Currency name" value={form.currency_name} onChange={(e) => set("currency_name", e.target.value)} error={errors.currency_name} placeholder="Cedi" autoComplete="off" maxLength={50} />
        <Field label="Currency symbol" value={form.currency_symbol} onChange={(e) => set("currency_symbol", e.target.value)} error={errors.currency_symbol} placeholder="₵" autoComplete="off" maxLength={10} />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 sm:mt-6">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted">Switch off to keep it on file without using it.</p>
          </div>
          <Switch checked={form.is_active} onChange={(value) => set("is_active", value)} label="Active" />
        </div>
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{country ? "Save changes" : "Add country"}</Button>
      </ModalActions>
    </form>
  );
}

export function CountriesPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const search = useSearchState(url);

  const [editing, setEditing] = useState<Country | "new" | null>(null);
  const [removing, setRemoving] = useState<Country | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const countries = useQuery({
    ...configQueries.countries({ page: url.page, page_size: LIST_PAGE_SIZE, searchTerm: search.committed || undefined }),
    enabled: isStaff,
  });

  // Landing past the last page (e.g. after deleting its only row) falls back to page 1.
  const totalPages = countries.data?.pagination.total_pages ?? 1;
  useEffect(() => {
    if (countries.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [countries.data, totalPages, url]);

  const toggle = useMutation({
    mutationFn: ({ country, is_active }: { country: Country; is_active: boolean }) => updateCountry(country.id, { is_active }),
    onMutate: async ({ country, is_active }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.countries.all });
      const snapshots = queryClient.getQueriesData<Paginated<Country>>({ queryKey: queryKeys.countries.all });
      queryClient.setQueriesData<Paginated<Country>>({ queryKey: queryKeys.countries.all }, (data) =>
        data ? { ...data, items: data.items.map((item) => (item.id === country.id ? { ...item, is_active } : item)) } : data,
      );
      return { snapshots };
    },
    onError: (error, { country }, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error instanceof ApiError ? error.message : `Couldn't update ${country.name}.`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.countries.all }),
  });

  const remove = useMutation({
    mutationFn: (country: Country) => deleteCountry(country.id),
    onSuccess: (_, country) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.countries.all });
      setRemoving(null);
      toast.success(`${country.name} deleted.`);
    },
    onError: (error, country) => {
      if (error instanceof ApiError && error.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys.countries.all });
        setRemoving(null);
        toast.info(`${country.name} was already removed.`);
      } else {
        setRemoveError(error instanceof ApiError ? error.message : "Couldn't delete this country.");
      }
    },
  });

  if (!isStaff) return <AccessDenied />;

  const items = countries.data?.items;
  const filtered = Boolean(search.committed);

  return (
    <div>
      <ConfigPageHeader
        icon="globe"
        title="Countries"
        description="The reference list of countries with their continent, code and currency."
        actions={isAdmin ? <Button onClick={() => setEditing("new")}>Add country</Button> : undefined}
      />

      {!isAdmin && (
        <div className="mb-4">
          <Alert tone="info">You can browse countries, but only administrators can add, edit or remove them.</Alert>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border p-4">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search name, continent, code or currency" label="Search countries" />
        </div>

        {countries.isLoading ? (
          <SkeletonRows rows={7} columns={5} />
        ) : countries.isError ? (
          <ErrorState message={countries.error.message} onRetry={() => countries.refetch()} />
        ) : items && items.length > 0 ? (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Country</span>
              <span>Continent</span>
              <span>Currency</span>
              <span>Active</span>
              <span className="text-right">{isAdmin ? "Actions" : ""}</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((country) => (
                <li key={country.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6 ${ROW_GRID} ${country.is_active ? "" : "bg-subtle/30"}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 min-w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft px-2 font-mono text-sm font-semibold text-brand">
                      {country.country_code}
                    </span>
                    <p className="min-w-0 truncate font-medium">{country.name}</p>
                  </div>
                  <p className="text-sm text-muted md:text-foreground">{country.continent}</p>
                  <p className="text-sm">
                    {country.currency_name} <span className="font-mono text-muted">({country.currency_symbol})</span>
                  </p>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Switch
                        checked={country.is_active}
                        onChange={(is_active) => toggle.mutate({ country, is_active })}
                        label={`${country.name} is ${country.is_active ? "active" : "inactive"}`}
                      />
                    ) : (
                      <Badge tone={country.is_active ? "success" : "neutral"} dot>{country.is_active ? "Active" : "Inactive"}</Badge>
                    )}
                    {isAdmin && <span className="text-xs text-muted md:hidden">{country.is_active ? "Active" : "Inactive"}</span>}
                  </div>
                  {isAdmin && (
                    <div className="-mx-1.5 flex justify-end gap-0.5 md:mx-0">
                      <IconButton label={`Edit ${country.name}`} icon="pencil" onClick={() => setEditing(country)} />
                      <IconButton label={`Delete ${country.name}`} icon="trash" tone="danger" onClick={() => { setRemoveError(null); setRemoving(country); }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination pagination={countries.data?.pagination} onPage={(page) => url.set({ page })} noun="countries" />
          </>
        ) : (
          <EmptyState
            icon="globe"
            title={filtered ? "No countries match your search" : "No countries yet"}
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => { search.setText(""); url.set({ q: "" }); }}>Clear search</Button>
              ) : isAdmin ? (
                <Button onClick={() => setEditing("new")}>Add a country</Button>
              ) : undefined
            }
          >
            {filtered ? "Try a different name, code or currency." : "Countries you add will appear here."}
          </EmptyState>
        )}
      </section>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add country" : "Edit country"} size="lg">
        {editing !== null && <CountryForm country={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        title="Delete country?"
        confirmLabel="Delete country"
        loading={remove.isPending}
        error={removeError}
      >
        <p>
          <strong className="font-semibold text-foreground">{removing?.name}</strong> will be removed permanently. Nothing else in the platform depends on it, but this can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
