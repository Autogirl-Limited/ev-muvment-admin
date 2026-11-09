import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";

export type TrackerOnlineStatus = "online" | "ack" | "offline";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface FleetTrackingItem {
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string;
  location_state: string;
  driver_id: string | null;
  driver_name: string | null;
  is_tracked: boolean;
  tracker_device_id: number | null;
  tracker_imei: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  course: number | null;
  online: TrackerOnlineStatus | null;
  engine_on: boolean | null;
  ignition: boolean | null;
  battery_level: number | null;
  motion: boolean | null;
  is_blocked: boolean | null;
  address: string | null;
  last_update_time: string | null;
}

export interface VehicleLocation extends Omit<FleetTrackingItem, "location_state" | "is_tracked"> {
  altitude: number | null;
  stop_duration_sec: number | null;
  total_distance_km: number | null;
  tail: Coordinate[];
}

export interface TripHistoryPoint {
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  altitude: number | null;
  time: string | null;
  raw_time: string | null;
}

export interface VehicleTripHistory {
  vehicle_id: string;
  tracker_device_id: number;
  distance_sum: string | null;
  top_speed: string | null;
  move_duration: string | null;
  stop_duration: string | null;
  engine_hours: string | null;
  engine_idle: string | null;
  engine_work: string | null;
  fuel_consumption: string | null;
  points_count: number;
  points: TripHistoryPoint[];
}

export interface TrackerDevice {
  id: number;
  name: string;
  imei: string | null;
  plate_number: string | null;
  online: TrackerOnlineStatus;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  last_update_time: string | null;
}

export interface DeviceCommand {
  type: string;
  title: string;
  attributes: Array<{ name: string; title: string; type: string; description: string | null }>;
}

export interface AutoLinkResult {
  total_vehicles_examined: number;
  matched_count: number;
  linked_matches: Array<{
    vehicle_id: string;
    vehicle_name: string;
    plate_number: string;
    tracker_device_id: number;
    tracker_imei: string | null;
    tracker_name: string;
  }>;
}

export function listFleetTracking(includeUnlinked = true, signal?: AbortSignal) {
  return apiFetch<FleetTrackingItem[]>(`/vehicles/tracking${toQuery({ include_unlinked: includeUnlinked })}`, { signal });
}

export function getVehicleTracking(vehicleId: string, signal?: AbortSignal) {
  return apiFetch<VehicleLocation>(`/vehicles/${vehicleId}/tracking`, { signal });
}

export interface TripHistoryParams {
  from_date: string;
  to_date: string;
  from_time?: string;
  to_time?: string;
  snap_to_road?: boolean;
}

export function getVehicleTripHistory(vehicleId: string, params: TripHistoryParams, signal?: AbortSignal) {
  return apiFetch<VehicleTripHistory>(`/vehicles/${vehicleId}/tracking/history${toQuery({ ...params })}`, { signal });
}

export function listTrackerDevices(signal?: AbortSignal) {
  return apiFetch<TrackerDevice[]>("/vehicles/tracking/devices", { signal });
}

export function autoLinkTrackers(overwrite = false) {
  return apiFetch<AutoLinkResult>(`/vehicles/tracking/auto-link${toQuery({ overwrite })}`, { method: "POST" });
}

export function updateVehicleTracker(vehicleId: string, tracker: { tracker_device_id: number; tracker_imei: string | null } | null) {
  return apiFetch<unknown>(`/vehicles/${vehicleId}/tracker`, {
    method: "PATCH",
    body: tracker ?? { tracker_device_id: null, tracker_imei: null },
  });
}

export function listVehicleCommands(vehicleId: string, signal?: AbortSignal) {
  return apiFetch<DeviceCommand[]>(`/vehicles/${vehicleId}/tracking/commands`, { signal });
}

export function sendVehicleCommand(vehicleId: string, commandType: "engineStop" | "engineResume") {
  return apiFetch<{ success: boolean; command_type: string; message: string }>(`/vehicles/${vehicleId}/tracking/commands`, {
    method: "POST",
    body: { command_type: commandType, message: null },
  });
}
