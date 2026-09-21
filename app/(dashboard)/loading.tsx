/** Shown inside the shell while a dashboard page loads, so navigation feels instant. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-subtle" />
        <div className="h-4 w-72 max-w-full rounded-md bg-subtle" />
      </div>
      <div className="h-48 max-w-2xl rounded-xl bg-subtle" />
    </div>
  );
}
