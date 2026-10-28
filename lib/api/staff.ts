import { apiFetch } from "@/lib/api/browser";
import type { DeliveryChannel, User } from "@/lib/api/types";

export type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface BankAccount {
  bank_name: string;
  bank_code: string;
  account_number: string;
}

/** MONNIFY is the default gateway; PAYSTACK is the extra Wema Bank account drivers also get. */
export type PaymentProvider = "MONNIFY" | "PAYSTACK";

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  MONNIFY: "Monnify",
  PAYSTACK: "Paystack (Wema Bank)",
};

/** Every DVA a driver holds, primary first - falls back to the single `virtual_account`. */
export function driverAccounts(record: { virtual_account: VirtualAccount | null; virtual_accounts?: VirtualAccount[] }) {
  if (record.virtual_accounts?.length) return record.virtual_accounts;
  return record.virtual_account ? [record.virtual_account] : [];
}

export interface VirtualAccount {
  id: string;
  created_at: string;
  updated_at: string;
  provider: PaymentProvider;
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
  banks: BankAccount[];
}

export interface DriverApplication {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
  years_of_experience: number;
  driver_license_number: string | null;
  status: ApplicationStatus;
  rejection_reason: string | null;
  user_id: string | null;
  virtual_account: VirtualAccount | null;
  /** One per gateway, primary (`virtual_account`) first. */
  virtual_accounts?: VirtualAccount[];
  ev_wallet_balance: number | null;
}

export interface DvaTransaction {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  virtual_account_id: string | null;
  provider: PaymentProvider;
  transaction_reference: string;
  payment_reference: string | null;
  amount: number;
  settlement_amount: number | null;
  currency: string;
  payer_name: string | null;
  payer_account_number: string | null;
  payer_bank_code: string | null;
  payer_bank_name: string | null;
  narration: string | null;
  paid_at: string;
}

export interface DvaTransactionStats {
  /** Echo of the `userId` filter; `null` when the stats are platform-wide. */
  user_id: string | null;
  date_from: string | null;
  date_to: string | null;
  total_amount: number;
  total_settlement_amount: number;
  transaction_count: number;
  unique_drivers_funded: number;
  average_transaction_amount: number;
}

export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface VirtualAccountResyncResult {
  user_id: string;
  succeeded: boolean;
  error: string | null;
  virtual_account: VirtualAccount | null;
}

export interface BulkResyncResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: VirtualAccountResyncResult[];
}

export interface ListApplicationsParams {
  page: number;
  page_size: number;
  status?: ApplicationStatus;
  searchTerm?: string;
}

export interface ListDvaTransactionsParams {
  page: number;
  page_size: number;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  searchTerm?: string;
}

function toQuery<T extends Record<string, string | number | undefined>>(params: T) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function listDriverApplications(params: ListApplicationsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<DriverApplication>>(
    `/driver-applications${toQuery({ ...params })}`,
    { signal },
  );
}

export function getDriverApplication(id: string, signal?: AbortSignal) {
  return apiFetch<DriverApplication>(`/driver-applications/${id}`, { signal });
}

export function approveDriverApplication(id: string) {
  return apiFetch<DriverApplication>(`/driver-applications/${id}/approve`, { method: "POST" });
}

export function rejectDriverApplication(id: string, reason: string) {
  const trimmed = reason.trim();
  return apiFetch<DriverApplication>(`/driver-applications/${id}/reject`, {
    method: "POST",
    body: trimmed ? { reason: trimmed } : {},
  });
}

export function sendDriverCredentials(userId: string, channel: DeliveryChannel) {
  return apiFetch<null>(`/users/${userId}/send-credentials`, {
    method: "POST",
    body: { channel },
  });
}

export function listDvaTransactions(params: ListDvaTransactionsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<DvaTransaction>>(
    `/dva-transactions${toQuery({ ...params })}`,
    { signal },
  );
}

export function getDvaTransaction(id: string, signal?: AbortSignal) {
  return apiFetch<DvaTransaction>(`/dva-transactions/${id}`, { signal });
}

export type DvaStatsParams = {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function getDvaStats(params: DvaStatsParams, signal?: AbortSignal) {
  return apiFetch<DvaTransactionStats>(`/dva-transactions/stats${toQuery(params)}`, { signal });
}

export function listDrivers(searchTerm: string, signal?: AbortSignal) {
  return apiFetch<Paginated<User>>(
    `/users${toQuery({ userType: "DRIVER", page: 1, page_size: 100, searchTerm: searchTerm || undefined })}`,
    { signal },
  );
}

/** One page of every driver, for resolving names in exports. */
export function listDriversPage(page: number, signal?: AbortSignal) {
  return apiFetch<Paginated<User>>(
    `/users${toQuery({ userType: "DRIVER", page, page_size: 100 })}`,
    { signal },
  );
}

/** Recreates one gateway's DVA for a driver (the default gateway's when `provider` is omitted). */
export function resyncDriverDva(userId: string, provider?: PaymentProvider) {
  return apiFetch<VirtualAccount>(`/payments/virtual-accounts/${userId}/resync${toQuery({ provider })}`, { method: "POST" });
}

/** With PAYSTACK this also backfills Wema Bank DVAs for drivers who don't have one yet. */
export function resyncAllDriverDvas(provider?: PaymentProvider) {
  return apiFetch<BulkResyncResponse>(`/payments/virtual-accounts/resync-all${toQuery({ provider })}`, { method: "POST" });
}
