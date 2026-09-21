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
- **`lib/auth/actions.ts`** holds every auth Server Action (sign-in, 2FA challenge, forgot/reset/change password, profile, 2FA management).
- A dead session is sent to `/login?reason=expired|ended`; the proxy clears leftover cookies on arrival.
- Drivers can authenticate against the API but are refused here; this app is staff-only.

Adding a page that only some roles may use: add `roles` to its entry in `lib/navigation.ts`, and in the page check `hasRole(user, [...])` and render `<AccessDenied />` (also do this for API `403`s).
