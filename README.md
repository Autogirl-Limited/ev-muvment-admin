# EV Muvment Admin

Staff dashboard (Admin, Account Officer, Relationship Officer) for the EV Muvment API. Built with Next.js 16 (App Router) and Tailwind 4.

## Getting started

```bash
cp .env.example .env.local   # point API_BASE_URL at the API
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `API_BASE_URL` is the API origin only (`/api/v1` is appended) and is read on the server; the browser never calls the API directly.

## How auth works

The API contract is in `ev-muvment-api/docs/2026/09/21/admin-and-account-officer-auth-api.md`.

- **Tokens live in httpOnly cookies** (`ev_access`, `ev_refresh`, `ev_must_change`), written only by Server Actions and `proxy.ts`, so page JavaScript can't read them.
- **`proxy.ts`** guards routes optimistically (cookies only), forces the change-password screen while the account is on a temporary password, and refreshes tokens shortly before the access token expires. Refresh tokens are single-use, so refreshes are single-flight and the result is reused for 60s by requests still holding the old cookie.
- **`lib/auth/dal.ts`** is the data-access layer: `getCurrentUser()` (role and 2FA flags come from `GET /users/me`, never the JWT), `requireUser()`, `hasRole()`. Authorization is checked next to the data, not in layouts.
- **`lib/auth/actions.ts`** holds the auth Server Actions (sign-in, 2FA challenge, forgot/reset/change password, 2FA management). Plain data reads and writes go through TanStack Query instead (below).
- A dead session is sent to `/login?reason=expired|ended`; the proxy clears leftover cookies on arrival.
- Drivers can authenticate against the API but are refused here; this app is staff-only.

Adding a page that only some roles may use: add `roles` to its entry in `lib/navigation.ts`, and in the page check `hasRole(user, [...])` and render `<AccessDenied />` (also do this for API `403`s).

## Data fetching (TanStack Query)

Server data is cached in the browser with [TanStack Query](https://tanstack.com/query). The browser never talks to the API directly: `apiFetch()` (`lib/api/browser.ts`) calls the same-origin gateway `app/api/proxy/[...path]`, which adds the httpOnly access token and forwards to the API. `/auth/*` is deliberately not reachable through it (those endpoints rotate tokens and must go through the Server Actions that update the cookies).

- **Cache policy** lives in `lib/query/query-client.ts`: data is fresh for 1 minute and kept 10 minutes after last use; only network faults and 5xx are retried. Override per query with `staleTime` (long for reference data such as countries or vehicle makes, `0` for live figures).
- **Keys** come from the factory in `lib/query/keys.ts`, so invalidation and prefetching can't drift apart.
- **The signed-in user** is the worked example (`lib/query/user.ts`): the dashboard layout seeds the cache from the server, `useCurrentUser()` reads it, `useUpdateProfile()` writes it back, and 2FA changes call `useInvalidateCurrentUser()`.
- A `401` from a data call ends the session (full navigation to `/login?reason=expired`); a `403` is a role problem and does not sign the user out.
- The cache is in memory only and is never persisted to storage.

Adding a resource: add its keys, write `useX()` / `useCreateX()` hooks next to `lib/query/user.ts`, and use `apiFetch<T>("/path")` as the `queryFn`. To avoid a first-load spinner on a page, prefetch it in a Server Component and wrap the page in `<HydrationBoundary state={dehydrate(queryClient)}>`, as the dashboard layout does.
