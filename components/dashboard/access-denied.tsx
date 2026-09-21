/** Shown when a signed-in user opens a page their role can't use. Doesn't sign them out. */
export function AccessDenied() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        Your role doesn&apos;t include this area. Contact an administrator if you think that&apos;s a
        mistake.
      </p>
    </div>
  );
}
