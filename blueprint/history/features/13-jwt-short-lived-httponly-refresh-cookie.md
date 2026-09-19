# Feature: JWT short-lived + httpOnly refresh cookie

**From build-plan:** feature 13
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/jwt-short-lived-httponly-refresh-cookie`

## Goal

Replace the current opaque Bearer token (`uid2`, checked against the database
on every request, 30-day lifetime) with a short-lived signed JWT access token
plus a rotating refresh token delivered in an `httpOnly` cookie. This is
feature 13 on the build plan; the overview explicitly calls out this surface
as needing "the same rigor" (rotation, reuse detection, expiry) as the
existing password-reset code.

## In scope

- `jsonwebtoken` and `cookie-parser` as new dependencies.
- A new `JWT_SECRET` env var (added to `.env.example`), used to sign/verify
  access tokens.
- `User` schema: replace `token` (opaque Bearer) / `tokenIssuedAt` with
  `refreshToken` (String, default `null`) / `refreshTokenExpiresAt` (Date,
  default `null`) - same plaintext-random-string-plus-expiry shape already
  used for `confirmationToken` and `resetToken` in this file, not a new
  pattern.
- `utils/constants.js`: replace `MAX_TOKEN_AGE_MS` with `ACCESS_TOKEN_TTL`
  (`'15m'`, the `jsonwebtoken` `expiresIn` string) and
  `REFRESH_TOKEN_TTL_MS` (`30 * 24 * 60 * 60 * 1000`, same numeric value
  `MAX_TOKEN_AGE_MS` had, so a user who keeps refreshing sees no session
  shortening).
- `signup`/`login` (`services/user.service.js`): issue a signed JWT access
  token (`{ sub: user._id }`, `ACCESS_TOKEN_TTL`) instead of a stored opaque
  token; also mint a `refreshToken` (`uid2(16)`) and
  `refreshTokenExpiresAt`, persisted on the user. Response body field
  `token` is renamed to `accessToken`; the refresh token is never in the
  JSON body.
- `app.js`: mount `cookie-parser`; add `credentials: true` to the existing
  `cors()` options (required for a browser client to receive/send the
  refresh cookie cross-origin once `vinted-frontend` connects; inert until
  then).
- Controllers/services set the refresh cookie
  (`res.cookie('refreshToken', value, { httpOnly: true, sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production', path: '/users', maxAge:
  REFRESH_TOKEN_TTL_MS })`) on signup, login, and refresh; clear it
  (`res.clearCookie` with matching options) on logout.
- `POST /users/refresh` (new, rate limited via the existing `authLimiter`):
  reads `req.cookies.refreshToken`, looks up the user by
  `{ refreshToken, refreshTokenExpiresAt: { $gt: new Date() } }`, rotates the
  stored refresh token (mint + persist a new one, same TTL), sets the new
  cookie, and returns a new `{ accessToken }`. Missing, unknown, or expired
  cookie -> `401`.
- `POST /users/logout` (new, rate limited via `authLimiter`): if a
  `refreshToken` cookie is present, clears that user's stored
  `refreshToken`/`refreshTokenExpiresAt` (best effort - an unknown/already
  invalid value is not an error); always clears the cookie and always
  responds `200`.
- `middlewares/isAuthenticated.js`: verify the Bearer value as a JWT
  (`jsonwebtoken.verify(token, process.env.JWT_SECRET)`); on any verification
  failure (bad signature, malformed, expired) respond `401` exactly as
  today. On success, look up the user by the token's `sub` claim (still
  `select('email account active')`, still the existing inactive -> `403`
  check). The separate token-age check is dropped: `jsonwebtoken.verify`
  already rejects an expired token via the JWT's own `exp` claim.
- `confirmPasswordReset` (`services/user.service.js`): currently rotates the
  opaque `token`/`tokenIssuedAt` to invalidate sessions started before the
  reset. Replace that with clearing `refreshToken`/`refreshTokenExpiresAt`
  to `null` (forces a fresh login instead of minting a refresh token nobody
  holds); any access token issued before the reset still simply expires
  within `ACCESS_TOKEN_TTL`.
- Update every existing authenticated test call site
  (`tests/user.test.js`, `tests/offers.test.js`) from
  `Authorization: Bearer <signupOrLoginResponse.body.token>` to
  `.body.accessToken`, and add coverage for the new refresh/logout endpoints
  and JWT expiry (see Testing).
- `config/swagger.js` / the `@openapi` blocks in `routes/user.route.js`:
  update the `bearerAuth` description, the signup/login response schema
  (`token` -> `accessToken`), and document the two new routes.
- `README.md`: update the auth section, the API reference table (new
  `/users/refresh` and `/users/logout` rows, renamed response field), and
  the curl example to match the new contract.

## Out of scope

- Multi-device/session-list support (listing or revoking individual
  sessions) - the codebase has only ever supported one active session token
  per user; this feature keeps that shape (one active refresh token per
  user, rotated in place), it does not add per-device session tracking.
- Hashing the refresh token at rest - `confirmationToken`/`resetToken` are
  already stored as plaintext random strings in this codebase; matching
  that existing precedent instead of introducing a new hashing scheme
  used nowhere else here.
- Changing `active`-account gating, rate limiting, account lockout, or any
  other auth behavior not directly tied to the token mechanism itself.
- Feature 14 (explicit MongoDB indexes) - untouched.
- Choosing a deployment target / production cookie domain - deployment is
  still `> TODO` in the overview by design; `secure`/`sameSite` are read
  from `NODE_ENV` so no deployment decision is required to ship this.

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json` (`feature`: one review packet after all steps).
`workflow.checkpointCommits` is `disabled`, so no checkpoint commits between
steps. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - JWT access token + rotating refresh cookie (core
  mechanism)** - add `jsonwebtoken` and `cookie-parser` to `package.json`;
  add `JWT_SECRET` to `.env.example`; update `models/User.js`
  (`refreshToken`/`refreshTokenExpiresAt` replacing `token`/`tokenIssuedAt`)
  and `utils/constants.js` (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_MS`
  replacing `MAX_TOKEN_AGE_MS`); mount `cookie-parser` and add
  `credentials: true` to `cors()` in `app.js`; rewrite `signup`/`login`/
  `confirmPasswordReset` in `services/user.service.js` to issue/persist the
  JWT + refresh token pair and set/clear the cookie from
  `controllers/user.controller.js`; rewrite `middlewares/isAuthenticated.js`
  to verify the JWT; add `refresh`/`logout` service functions, controller
  actions, and routes (both behind `authLimiter`) in
  `services/user.service.js` / `controllers/user.controller.js` /
  `routes/user.route.js`. Update `tests/user.test.js`: rename `.body.token`
  assertions to `.body.accessToken`, rewrite the token-expiration test to
  sign an already-expired JWT and assert `401`, and add new tests for
  `POST /users/refresh` (happy path returns a new `accessToken` and rotates
  the cookie; missing/invalid/expired cookie returns `401`; a rotated-out
  old refresh token is rejected) and `POST /users/logout` (clears the
  cookie, a subsequent refresh with the old cookie value fails, and it
  responds `200` even with no cookie at all). Also rename the remaining
  `.body.token` references in `tests/offers.test.js` to `.body.accessToken`
  (same mechanical rename, no behavior change) - required for this step's
  own full-suite done-when. *Done when:* `npm test` passes for the full
  suite, and a manual `curl -i` against a locally running server shows
  `POST /users/login` returning `accessToken` in the JSON body and a
  `Set-Cookie: refreshToken=...; HttpOnly` header.
- [x] **Step 2 - Propagate the contract change to docs** - update
  `config/swagger.js`'s `bearerAuth` description and the signup/login
  `@openapi` response schemas in `routes/user.route.js` (`token` ->
  `accessToken`), and add `@openapi` blocks for `POST /users/refresh` and
  `POST /users/logout`; update `README.md`'s auth section, API reference
  table, and curl example to match. *Done when:* `npm test`, `npm run
  lint`, and `npm run format:check` all pass for the full repository, and
  `GET /api-docs.json` lists `/users/refresh` and `/users/logout`.

## Files / areas

- `package.json` / `package-lock.json` - add `jsonwebtoken`, `cookie-parser`.
- `.env.example` - add `JWT_SECRET`.
- `models/User.js` - `refreshToken`/`refreshTokenExpiresAt` replace
  `token`/`tokenIssuedAt`.
- `utils/constants.js` - `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_MS` replace
  `MAX_TOKEN_AGE_MS`.
- `app.js` - mount `cookie-parser`; `cors({ ..., credentials: true })`.
- `services/user.service.js` - `signup`, `login`, `confirmPasswordReset`
  rewritten; new `refresh`, `logout`.
- `controllers/user.controller.js` - `signup`, `login` set the cookie; new
  `refresh`, `logout` controller actions.
- `middlewares/isAuthenticated.js` - JWT verification instead of DB opaque
  lookup + manual age check.
- `routes/user.route.js` - new `POST /users/refresh`, `POST /users/logout`
  routes (both behind `authLimiter`); updated `@openapi` blocks.
- `config/swagger.js` - `bearerAuth` description update.
- `tests/user.test.js` - updated + new tests (step 1).
- `tests/offers.test.js` - `.body.token` -> `.body.accessToken` (step 1).
- `README.md` - auth section, API reference table, curl example (step 2).
- `tests/setupTestDb.js` - sets a fallback `JWT_SECRET` for the test
  environment (no `.env` is loaded when tests require `app.js` directly;
  `index.js` is the only entry point that calls `dotenv.config()`) (step 1).

## Data / contracts

- `User` schema: `token` (String, required) and `tokenIssuedAt` (Date,
  required) are removed; `refreshToken` (String, default `null`) and
  `refreshTokenExpiresAt` (Date, default `null`) are added. No migration
  needed - per the overview, the current database holds only dev/test data
  and will be wiped before any live release.
- Access token: JWT, HS256, signed with `process.env.JWT_SECRET`, payload
  `{ sub: '<user _id>' }`, `expiresIn: '15m'` (`ACCESS_TOKEN_TTL`). Sent the
  same way as today - `Authorization: Bearer <accessToken>` - so
  `isAuthenticated` and every existing protected route's client contract is
  otherwise unchanged.
- Refresh token: `uid2(16)` random string, `REFRESH_TOKEN_TTL_MS` (30 days)
  from issuance, stored in plaintext on `User.refreshToken` /
  `User.refreshTokenExpiresAt` (matching the existing
  `confirmationToken`/`resetToken` shape), delivered only via the
  `refreshToken` cookie (`httpOnly`, `sameSite: 'lax'`, `secure` in
  production, `path: '/users'`), never in a JSON response body.
- Rotation: exactly one active refresh token per user at a time (same
  single-active-session shape the current opaque `token` field already has,
  not a per-device list). Every successful `POST /users/refresh` replaces
  the stored value and cookie with a freshly minted one; the previous value
  stops matching immediately, so presenting it again after rotation returns
  the same `401` as any other unrecognized refresh token.
- `POST /users/signup` / `POST /users/login` response body: `{ _id,
  accessToken, account: { username } }` (renamed from `token`); a
  `Set-Cookie: refreshToken=...` header is added.
- `POST /users/refresh` response body: `{ accessToken }`, `200`; `401` with
  `{ message: 'Unauthorized' }` on a missing/invalid/expired/already-rotated
  cookie value.
- `POST /users/logout` response body: `{ message: 'Logged out' }`, always
  `200`; also sends `Set-Cookie: refreshToken=...` clearing the cookie.
- `confirmPasswordReset` still returns `{ message: 'Password has been
  reset' }`, unchanged; it now clears `refreshToken`/`refreshTokenExpiresAt`
  instead of rotating the old opaque `token`.

## Testing

- `npm test` (Jest + Supertest) gates completion, per `AGENTS.md` and
  `coding-standards.md`.
- `tests/user.test.js`: rename existing `.body.token` assertions to
  `.body.accessToken`; replace the "rejects a token older than the max age"
  test with one that signs an already-expired JWT (e.g.
  `jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s'
  })`) and asserts the protected route returns `401`.
- New `tests/user.test.js` coverage: `POST /users/refresh` happy path
  (returns a new `accessToken`, sets a new `Set-Cookie`), missing cookie
  (`401`), unknown/garbage cookie value (`401`), expired
  `refreshTokenExpiresAt` (`401`), and rotation (refreshing twice makes the
  first refresh's cookie value invalid on a third attempt); `POST
  /users/logout` clears the cookie and a subsequent `POST /users/refresh`
  with the old cookie value returns `401`, and logout with no cookie at all
  still returns `200`.
- `tests/offers.test.js`: existing Bearer-header tests keep passing once
  `.body.token` becomes `.body.accessToken` - no new behavior to test there,
  just the field rename.
- No browser test command is configured (API-only project); verify the
  `Set-Cookie` header manually via `curl -i` as noted in Step 1's done-when,
  not a claimed visual/browser check.
- `npm run lint` and `npm run format:check` must pass (CI gate) after each
  step that touches source files.

## Notes for the AI

- Reuse the existing `throwError('Unauthorized', 401)` /
  `res.status(401).json({ message: 'Unauthorized' })` shape for every new
  401 path (invalid JWT, invalid/expired/reused refresh cookie) - don't
  invent a new error message or status for this feature.
- `jsonwebtoken.verify` throws (`JsonWebTokenError`, `TokenExpiredError`,
  etc.) rather than returning a falsy value - wrap it in the existing
  try/catch in `isAuthenticated.js` and treat any thrown error from
  `verify` as the same `401 Unauthorized`, not a 500.
- Keep the refresh/logout logic in `services/user.service.js` next to
  `signup`/`login`, not a new `auth.service.js` - this codebase keeps all
  user/session logic in one service file today.
- `res.cookie`/`res.clearCookie` calls belong in
  `controllers/user.controller.js` (response concerns), not in the service
  layer, consistent with "controllers: request/response, thin; services:
  business logic" from `AGENTS.md`. The service functions return the
  refresh token value (and its expiry) alongside the rest of the payload so
  the controller has what it needs to set the cookie.
- No em dashes in any generated content (code comments, README additions,
  Swagger descriptions, commit messages).
- Cloudinary, favorites, and offer-ownership behavior are untouched by this
  feature; do not modify `offer.service.js` or `offer.controller.js` beyond
  what a global `isAuthenticated` behavior change already covers for free.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":14670,"specSha256":"c333a9e49d3fe006bae17fec1baf448005e4d3e71a680bf364d551d400857876","branch":"refs/heads/feature/jwt-short-lived-httponly-refresh-cookie","head":"dc274e72a9ca1d5e08be439143f6672cdb294b36","baseRef":"refs/heads/master","baseCommit":"dc274e72a9ca1d5e08be439143f6672cdb294b36","sourceTree":"31c949912300a89e67c8ee5168153bb365caec7c","absentOptional":[]} -->

## Findings

### 13/F-10 [P2] closed - `README.fr.md` still documents the removed opaque Bearer token contract

**File:** README.fr.md:5,34,48,59,91,100,188
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** Feature 13 replaced the opaque Bearer token with a JWT
access token + rotating `httpOnly` refresh cookie, and `README.md` was
updated to match (`accessToken` field, `POST /users/refresh`/`POST
/users/logout`, refresh-cookie security notes). `README.fr.md` - linked from
the top of `README.md` as the French translation of the same document ("🇬🇧
English | 🇫🇷 Français") - was not touched by this feature and still says
the response field is `token` (line 91's example JSON), still shows the old
curl example using that field, still describes "un token opaque aléatoire
(`uid2`), vérifié en base à chaque requête" (line 188, no longer true - auth
now verifies a JWT, only refresh hits the database), and has no mention of
`/users/refresh` or `/users/logout` at all. A French-reading integrator
following this document would build against a contract that no longer
exists.
**Suggested fix:** Apply the same edits made to `README.md` in this feature
(Features bullet, Tech stack Auth row, API reference intro paragraph and
table rows for `/users/refresh`/`/users/logout`, reset/confirm description,
curl examples, env var table, Security section) to `README.fr.md`.
**Resolution:** Fixed - applied the same edits to `README.fr.md`: Features
bullet, Tech stack Auth row, API reference intro paragraph, new
`/users/refresh`/`/users/logout` table rows, curl examples (signup +
refresh), `JWT_SECRET` env var row, and the Security section's auth bullet.
Formatted with `npx prettier --write README.fr.md`. Scope matched the
suggested fix exactly - pre-existing drift unrelated to this feature (the
French README was already missing the confirm/reset/favorites rows and the
other env vars from features 8-12, and still has a stale CORS/payload-size
limitation note) was left untouched, not part of this finding. `npm test`
passes (118/118), `npm run lint` and `npm run format:check` clean.
Re-reviewed 2026-09-17 by `/audit current`: diffed `README.fr.md` line by
line against `README.md`'s equivalent auth-related edits (Features bullet,
Tech stack Auth row, API reference intro + table rows for
`/users/refresh`/`/users/logout`, curl examples, `JWT_SECRET` row, Security
bullet) - all present and accurate, no remaining reference to the removed
opaque Bearer token or the old `token` response field. Closed.

### 13/F-11 [P2] closed - No automated test asserts the refresh cookie's `httpOnly`/`SameSite`/`Secure` attributes

**File:** tests/user.test.js:724-725 (`cookieHeader`/`cookieValue` helpers,
used throughout the `POST /users/refresh` and `POST /users/logout` describe
blocks)
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** The feature's entire security value is that the refresh
token is delivered only in an `httpOnly`, `SameSite=Lax` cookie
(`controllers/user.controller.js`'s `refreshCookieOptions()`), never in a
JSON body reachable by page JavaScript. Every test that inspects the
`Set-Cookie` header does so through `cookieValue()`, which explicitly
discards everything after the first `;` (the value only) - no test reads the
`HttpOnly`/`SameSite`/`Secure` attribute text at all. A future refactor that
accidentally dropped `httpOnly: true` from `refreshCookieOptions()` (e.g.
during a merge, or someone "simplifying" the options object) would still
pass every test in the suite while silently exposing the refresh token to
any XSS on the frontend origin - exactly the class of regression this
feature exists to prevent.
**Suggested fix:** In at least one `POST /users/signup` or `POST
/users/login` test, assert on the raw `Set-Cookie` header string (e.g.
`expect(cookieHeader(response)).toMatch(/HttpOnly/)` and
`expect(cookieHeader(response)).toMatch(/SameSite=Lax/)`), not just the
parsed value. `Secure` is conditional on `NODE_ENV==='production'` and
Jest normally runs with `NODE_ENV=test`, so asserting its *absence* under
the test environment (and noting why) is enough - no need to fake
`NODE_ENV=production` for this.
**Resolution:** Fixed - added `'sets the refresh cookie as httpOnly and
SameSite=Lax'` in `tests/user.test.js`'s `POST /users/signup` describe
block, asserting the raw `Set-Cookie` header matches `/HttpOnly/` and
`/SameSite=Lax/`, and does not match `/Secure/` (documented as expected
since `NODE_ENV` is `'test'`, not `'production'`, in this environment).
`npm test` passes (118/118). Re-reviewed 2026-09-17 by `/audit current`: the
new test in `tests/user.test.js` (`'sets the refresh cookie as httpOnly and
SameSite=Lax'`) asserts on the raw `Set-Cookie` header, not the parsed
value, and correctly documents why `Secure` is expected absent under
`NODE_ENV=test`. Ran it directly (`npx jest tests/user.test.js -t "sets the
refresh cookie"`) - passes. A regression that dropped `httpOnly` or
`sameSite: 'lax'` from `refreshCookieOptions()` would now fail this test.
Closed.

### 13/F-12 [P3] closed - `project-overview.md`'s User data model still lists the removed `token`/`tokenIssuedAt` fields

**File:** blueprint/context/project-overview.md:67-68,77-78
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** The overview's Data model section for `User` still
lists `token` (String, required) and `tokenIssuedAt` (Date, required,
default now) as the shipped fields, with a forward-looking note ("Planned
addition: a refresh-token field... for feature 13") that is now stale -
feature 13 is implemented, and the actual schema
(`models/User.js`) has `refreshToken`/`refreshTokenExpiresAt` instead. A
later `/feature` pass for feature 14 (or any future feature) reading this
section for repository ground truth would plan against a `User` schema that
no longer exists.
**Suggested fix:** Re-run `/overview` (or manually correct the `User` data
model bullet list) so `token`/`tokenIssuedAt` are replaced with
`refreshToken`/`refreshTokenExpiresAt` and the "Planned addition" note is
removed now that it has shipped. Not a code change - this is a planning-doc
sync, normally owned by `/overview`, not `/implement`.
**Resolution:** Fixed by manual correction (chosen over re-running
`/overview`, per the suggested fix's stated alternative) -
`blueprint/context/project-overview.md`'s User data model now lists
`refreshToken`/`refreshTokenExpiresAt` (feature 13) instead of
`token`/`tokenIssuedAt`, and the now-shipped "Planned addition" note is
removed. The file's `blueprint:source-hash` comment was left as-is since
only `/overview` owns regenerating that marker; a future `/overview` run
may still flag or refresh it independently of this fix. Re-reviewed
2026-09-17 by `/audit current`: `blueprint/context/project-overview.md`'s
User data model now reads `refreshToken`/`refreshTokenExpiresAt` (feature
13), matches `models/User.js` field-for-field, and the stale "Planned
addition" note is gone. Closed.
