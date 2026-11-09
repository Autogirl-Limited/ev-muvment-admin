"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput } from "@/components/dashboard/screen-kit";
import { TrackingMap, type TrackingMapPoint } from "@/components/vehicle-tracking/tracking-map";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker, lagosToday } from "@/components/ui/date-range-picker";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  autoLinkTrackers,
  getVehicleTracking,
  getVehicleTripHistory,
  listFleetTracking,
  listTrackerDevices,
  listVehicleCommands,
  sendVehicleCommand,
  updateVehicleTracker,
  type FleetTrackingItem,
  type TrackerOnlineStatus,
} from "@/lib/api/vehicle-tracking";
import { formatDateTime } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const STATUS_TONE: Record<TrackerOnlineStatus, "success" | "brand" | "neutral"> = { online: "success", ack: "brand", offline: "neutral" };

function errorText(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 502) return "The tracking provider is temporarily unavailable. Try again shortly.";
  if (error.status === 409) return "That tracker is already linked to another vehicle.";
  return error.message;
}

function LastUpdate({ value }: { value: string | null }) {
  if (!value) return <span>No telemetry yet</span>;
  return <span>Updated {formatDateTime(value)}</span>;
}

function TrackerDialog({ vehicle, onClose }: { vehicle: FleetTrackingItem | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const devices = useQuery({
    queryKey: queryKeys.vehicleTracking.devices,
    queryFn: ({ signal }) => listTrackerDevices(signal),
    enabled: vehicle !== null,
    staleTime: 30_000,
  });
  const selected = devices.data?.find((device) => String(device.id) === deviceId);
  const save = useMutation({
    mutationFn: () => {
      if (!vehicle) throw new Error("No vehicle selected");
      return updateVehicleTracker(vehicle.vehicle_id, selected ? { tracker_device_id: selected.id, tracker_imei: selected.imei } : null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleTracking.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(selected ? `Tracker linked to ${vehicle?.plate_number}.` : `Tracker unlinked from ${vehicle?.plate_number}.`);
      onClose();
    },
    onError: (reason) => setError(errorText(reason, "Couldn't update the tracker.")),
  });

  return (
    <Modal open={vehicle !== null} onClose={save.isPending ? () => {} : onClose} title={vehicle?.is_tracked ? "Change tracker" : "Link tracker"} size="lg">
      {vehicle && <div className="space-y-4">
        <div className="rounded-lg bg-subtle p-3 text-sm"><strong>{vehicle.vehicle_name}</strong> · {vehicle.plate_number}</div>
        {devices.isError ? <Alert tone="error">{errorText(devices.error, "Couldn't load tracker devices.")}</Alert> : (
          <Select label="Tracker device" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={devices.isLoading}>
            <option value="">{vehicle.is_tracked ? "Unlink current tracker" : devices.isLoading ? "Loading trackers…" : "Select a tracker"}</option>
            {devices.data?.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.imei ?? `Device ${device.id}`} · {device.online}</option>)}
          </Select>
        )}
        <p className="text-xs text-muted">Confirm the device name and IMEI match the physical unit installed in this vehicle.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => { setError(null); save.mutate(); }} loading={save.isPending} disabled={!vehicle.is_tracked && !selected}>{selected ? "Link tracker" : "Unlink tracker"}</Button>
        </ModalActions>
      </div>}
    </Modal>
  );
}

function CommandDialog({ vehicle, command, onClose }: { vehicle: FleetTrackingItem | null; command: "engineStop" | "engineResume" | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => sendVehicleCommand(vehicle!.vehicle_id, command!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleTracking.all });
      toast.success(command === "engineStop" ? "Immobilizer command sent. Waiting for fresh telemetry." : "Resume command sent. Waiting for fresh telemetry.");
      onClose();
    },
    onError: (reason) => setError(errorText(reason, "The command could not be sent.")),
  });
  const stopping = command === "engineStop";
  return (
    <Modal open={vehicle !== null && command !== null} onClose={mutation.isPending ? () => {} : onClose} title={stopping ? "Immobilize vehicle?" : "Resume engine?"}>
      {vehicle && <div className="space-y-4">
        <Alert tone={stopping ? "error" : "info"}>
          {stopping ? "This sends a remote engine cutoff command. Only continue when the vehicle is safely stationary and the operator has verified the correct plate." : "This removes the immobilizer block. It does not start the engine."}
        </Alert>
        <p className="text-sm">Vehicle: <strong>{vehicle.vehicle_name} ({vehicle.plate_number})</strong></p>
        <Field label="Type CONFIRM to continue" value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase().slice(0, 7))} autoComplete="off" />
        {error && <Alert tone="error">{error}</Alert>}
        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant={stopping ? "danger" : "primary"} disabled={confirmation !== "CONFIRM"} loading={mutation.isPending} onClick={() => { setError(null); mutation.mutate(); }}>
            {stopping ? "Send immobilize command" : "Send resume command"}
          </Button>
        </ModalActions>
      </div>}
    </Modal>
  );
}

function VehicleDetails({ vehicle, isAdmin, onClose, onManageTracker, onCommand }: {
  vehicle: FleetTrackingItem | null;
  isAdmin: boolean;
  onClose: () => void;
  onManageTracker: () => void;
  onCommand: (command: "engineStop" | "engineResume") => void;
}) {
  const today = lagosToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const historyParams = { from_date: from, to_date: to, from_time: fromTime, to_time: toTime, snap_to_road: true };
  const live = useQuery({
    queryKey: queryKeys.vehicleTracking.detail(vehicle?.vehicle_id ?? ""),
    queryFn: ({ signal }) => getVehicleTracking(vehicle!.vehicle_id, signal),
    enabled: Boolean(vehicle?.is_tracked),
    refetchInterval: 15_000,
  });
  const history = useQuery({
    queryKey: queryKeys.vehicleTracking.history(vehicle?.vehicle_id ?? "", historyParams),
    queryFn: ({ signal }) => getVehicleTripHistory(vehicle!.vehicle_id, historyParams, signal),
    enabled: Boolean(vehicle?.is_tracked),
    retry: false,
  });
  const commands = useQuery({
    queryKey: queryKeys.vehicleTracking.commands(vehicle?.vehicle_id ?? ""),
    queryFn: ({ signal }) => listVehicleCommands(vehicle!.vehicle_id, signal),
    enabled: Boolean(vehicle?.is_tracked && isAdmin),
    retry: false,
  });
  const telemetry = live.data ?? vehicle;
  const route = history.data?.points.map((point, index) => ({ id: String(index), latitude: point.latitude, longitude: point.longitude, label: point.raw_time ?? point.time ?? "Route point", tone: "route" as const })) ?? [];
  const point = telemetry?.latitude != null && telemetry.longitude != null ? [{ id: telemetry.vehicle_id, latitude: telemetry.latitude, longitude: telemetry.longitude, label: telemetry.plate_number, tone: telemetry.online ?? "offline" }] : [];
  const supports = (type: string) => commands.data?.some((item) => item.type === type) ?? false;

  return <Modal open={vehicle !== null} onClose={onClose} title={vehicle?.vehicle_name ?? "Vehicle tracking"} size="xl">
    {vehicle && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border bg-subtle px-2 py-1 font-mono text-xs font-semibold">{vehicle.plate_number}</span>
        {vehicle.is_tracked && vehicle.online ? <Badge tone={STATUS_TONE[vehicle.online]} dot>{vehicle.online}</Badge> : <Badge tone="neutral">No tracker</Badge>}
        {telemetry?.is_blocked && <Badge tone="danger" dot>Immobilized</Badge>}
        <span className="text-xs text-muted"><LastUpdate value={telemetry?.last_update_time ?? null} /></span>
      </div>

      {!vehicle.is_tracked ? <EmptyState icon="mapPin" title="No tracker linked" action={isAdmin ? <Button onClick={onManageTracker}>Link a tracker</Button> : undefined}>A tracker must be linked before this vehicle can report live telemetry.</EmptyState> : <>
        {live.isError && <Alert tone="error">{errorText(live.error, "Couldn't refresh live telemetry.")}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Speed", `${telemetry?.speed ?? 0} km/h`],
            ["Battery", telemetry?.battery_level == null ? "Unavailable" : `${telemetry.battery_level}%`],
            ["Ignition", telemetry?.ignition == null ? "Unavailable" : telemetry.ignition ? "On" : "Off"],
            ["Distance", live.data?.total_distance_km == null ? "Unavailable" : `${live.data.total_distance_km} km`],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-subtle/40 p-3"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}
        </div>
        <p className="flex gap-2 text-sm text-muted"><Icon name="mapPin" className="mt-0.5 size-4 shrink-0" />{telemetry?.address ?? "Address unavailable"}</p>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <DateRangePicker compact allowAll={false} from={from} to={to} onApply={(range) => { setFrom(range.from); setTo(range.to); }} className="w-full lg:w-64" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="From time" type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} />
              <Field label="To time" type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} />
            </div>
          </div>
          {history.isError && <Alert tone="info">{errorText(history.error, "Trip history is unavailable for this range.")}</Alert>}
          <div className="overflow-hidden rounded-xl border border-border"><TrackingMap points={point} route={route} /></div>
          {history.data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Distance", history.data.distance_sum], ["Top speed", history.data.top_speed], ["Moving", history.data.move_duration], ["Stopped", history.data.stop_duration]].map(([label, value]) => <div key={label}><p className="text-xs text-muted">{label}</p><p className="font-medium">{value ?? "Unavailable"}</p></div>)}
          </div>}
        </section>
      </>}

      {isAdmin && <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onManageTracker}>{vehicle.is_tracked ? "Change tracker" : "Link tracker"}</Button>
        {vehicle.is_tracked && <div className="flex gap-2">
          {telemetry?.is_blocked ? <Button onClick={() => onCommand("engineResume")} disabled={!supports("engineResume")}>Resume engine</Button> : <Button variant="danger" onClick={() => onCommand("engineStop")} disabled={!supports("engineStop")}>Immobilize</Button>}
        </div>}
      </div>}
    </div>}
  </Modal>;
}

export function VehicleTrackingPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const status = url.get("status");
  const [selected, setSelected] = useState<FleetTrackingItem | null>(null);
  const [trackerVehicle, setTrackerVehicle] = useState<FleetTrackingItem | null>(null);
  const [commandVehicle, setCommandVehicle] = useState<FleetTrackingItem | null>(null);
  const [command, setCommand] = useState<"engineStop" | "engineResume" | null>(null);

  const fleet = useQuery({
    queryKey: queryKeys.vehicleTracking.fleet(true),
    queryFn: ({ signal }) => listFleetTracking(true, signal),
    enabled: isStaff,
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
  });
  const autoLink = useMutation({
    mutationFn: () => autoLinkTrackers(false),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicleTracking.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(result.matched_count > 0 ? `Linked ${result.matched_count} tracker${result.matched_count === 1 ? "" : "s"}.` : "No new plate-number matches were found.");
    },
    onError: (reason) => toast.error(errorText(reason, "Couldn't auto-link trackers.")),
  });
  const items = useMemo(() => (fleet.data ?? []).filter((vehicle) => {
    const term = search.committed.toLowerCase();
    const matchesTerm = !term || [vehicle.vehicle_name, vehicle.plate_number, vehicle.driver_name, vehicle.address, vehicle.location_state].some((value) => value?.toLowerCase().includes(term));
    const matchesStatus = !status || (status === "unlinked" ? !vehicle.is_tracked : vehicle.online === status);
    return matchesTerm && matchesStatus;
  }), [fleet.data, search.committed, status]);
  const mapPoints = useMemo<TrackingMapPoint[]>(() => items.flatMap((vehicle) => vehicle.latitude == null || vehicle.longitude == null ? [] : [{ id: vehicle.vehicle_id, latitude: vehicle.latitude, longitude: vehicle.longitude, label: `${vehicle.vehicle_name} · ${vehicle.plate_number}`, tone: vehicle.online ?? "offline" }]), [items]);
  const selectById = useCallback((id: string) => setSelected((fleet.data ?? []).find((item) => item.vehicle_id === id) ?? null), [fleet.data]);

  if (!isStaff) return <AccessDenied />;
  const counts = { total: fleet.data?.length ?? 0, online: fleet.data?.filter((v) => v.online === "online").length ?? 0, offline: fleet.data?.filter((v) => v.is_tracked && v.online === "offline").length ?? 0, unlinked: fleet.data?.filter((v) => !v.is_tracked).length ?? 0 };

  return <div>
    <ConfigPageHeader icon="mapPin" showBackLink={false} title="Live vehicle tracking" description="See fleet location and status, inspect trip history, and manage installed trackers." actions={isAdmin ? <Button variant="secondary" onClick={() => autoLink.mutate()} loading={autoLink.isPending}>Auto-link trackers</Button> : undefined} />
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Fleet", counts.total], ["Online", counts.online], ["Offline", counts.offline], ["No tracker", counts.unlinked]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-surface p-4 shadow-card"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
    </div>
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_12rem]">
        <SearchInput value={search.text} onChange={search.setText} placeholder="Search vehicle, plate, driver or address" label="Search tracked vehicles" />
        <Select label="Tracking status" hideLabel value={status} onChange={(event) => url.set({ status: event.target.value })}>
          <option value="">All statuses</option><option value="online">Online</option><option value="ack">Acknowledged</option><option value="offline">Offline</option><option value="unlinked">No tracker</option>
        </Select>
      </div>
      {fleet.isLoading ? <div className="h-[36rem] animate-pulse bg-subtle/50" /> : fleet.isError ? <ErrorState message={errorText(fleet.error, "Couldn't load fleet tracking.")} onRetry={() => fleet.refetch()} /> : (
        <div className="grid min-h-[36rem] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="max-h-[42rem] overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
            {items.length === 0 ? <EmptyState icon="mapPin" title="No vehicles match">Try changing the search or status filter.</EmptyState> : <ul className="divide-y divide-border">{items.map((vehicle) => <li key={vehicle.vehicle_id}>
              <button type="button" onClick={() => setSelected(vehicle)} className="w-full p-4 text-left transition hover:bg-subtle/60 focus-visible:outline-2 focus-visible:outline-brand">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{vehicle.vehicle_name}</p><p className="mt-0.5 font-mono text-xs text-muted">{vehicle.plate_number}</p></div>{vehicle.online ? <Badge tone={STATUS_TONE[vehicle.online]} dot>{vehicle.online}</Badge> : <Badge tone="neutral">No tracker</Badge>}</div>
                <p className="mt-2 truncate text-sm text-muted">{vehicle.address ?? vehicle.location_state}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>{vehicle.driver_name ?? "No driver"}</span><span>{vehicle.speed == null ? "—" : `${vehicle.speed} km/h`}</span></div>
              </button>
            </li>)}</ul>}
          </div>
          <TrackingMap points={mapPoints} onSelect={selectById} />
        </div>
      )}
    </section>
    <VehicleDetails vehicle={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} onManageTracker={() => { setTrackerVehicle(selected); setSelected(null); }} onCommand={(next) => { setCommandVehicle(selected); setCommand(next); setSelected(null); }} />
    <TrackerDialog vehicle={trackerVehicle} onClose={() => setTrackerVehicle(null)} />
    <CommandDialog vehicle={commandVehicle} command={command} onClose={() => { setCommand(null); setCommandVehicle(null); }} />
  </div>;
}
