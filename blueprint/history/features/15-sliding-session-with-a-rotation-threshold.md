# Feature: Sliding session with a rotation threshold

**From build-plan:** feature 15
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/sliding-session-with-a-rotation-threshold`

## Goal

`POST /users/refresh` currently rotates the stored refresh token on every call.
The frontend now calls it once at bootstrap, on every page load, which makes
that rotation frequency the new normal: one database write per page load, a new
cookie value per page load, and two tabs opened together racing for the cookie
(the loser renders logged out until a reload).

Rotate only once the refresh token has aged past a threshold. The session stays
sliding (a returning visitor never gets logged out), but the rotation cadence
drops from once per page load to at most once per threshold window.

## In scope

- `utils/constants.js`: add `REFRESH_ROTATION_THRESHOLD_MS` (24 h). A refresh
  token is rotated only once it has less than `REFRESH_TOKEN_TTL_MS` minus this
  value of remaining lifetime, so a session extends at most once a day.
- `services/user.service.js`: extract the `jwt.sign()` call currently inlined in
  `issueSessionTokens` into `issueAccessToken(user)`, and have
  `issueSessionTokens` call it. No behavior change, it only makes access-token
  minting reachable without touching the refresh token.
- `services/user.service.js` `refresh()`: mint a new access token on every call,
  but rotate and `save()` the refresh token only when rotation is due. When it is
  not due, return the existing `refreshToken`/`refreshTokenExpiresAt` unchanged
  and perform no write.
- `controllers/user.controller.js` `setRefreshCookie`: derive `maxAge` from the
  refresh token's actual `refreshTokenExpiresAt` instead of the hardcoded
  `REFRESH_TOKEN_TTL_MS`, so the cookie cannot outlive the server record.
- `tests/user.test.js`: update the two tests that assert unconditional rotation
  and add coverage for the non-rotating path, the rotating path, and the derived
  `maxAge`.
- Documentation: the `POST /users/refresh` OpenAPI description, both READMEs
  (`README.md` and `README.fr.md`), and code comments for the why of the
  threshold.

## Out of scope

- Any absolute session lifetime cap. A sliding session with no ceiling is the
  accepted product decision for this project, recorded in the READMEs by this
  feature.
- Locking, a compare-and-swap rotation, or any other concurrency control on
  `refresh()`. The threshold reduces the race frequency by roughly three orders
  of magnitude, from once per page load to once per day; it does not eliminate
  it, and eliminating it is not a requirement here.
- Per-device or multi-session support. The one-active-refresh-token-per-user
  model is unchanged.
- Any frontend change. The client keeps calling `POST /users/refresh` at
  bootstrap and reading `accessToken`; the cookie is `httpOnly`, so the client
  cannot observe whether rotation happened.

## Build loop

`workflow.stepReview` is `feature`: implement the steps below in order and
present the whole feature for review at the end, not step by step.
`workflow.checkpointCommits` is `disabled`, so make no intermediate commits.
`/complete` creates the final feature commit. `npm test` must be green at the end
of every step; the baseline before this feature is 174 passing tests in 7 suites.

## Build steps

- [x] 1. **Add the threshold constant and extract access-token minting.** Add
  `REFRESH_ROTATION_THRESHOLD_MS = 24 * 60 * 60 * 1000` to `utils/constants.js`
  next to `REFRESH_TOKEN_TTL_MS` and export it. In `services/user.service.js`,
  extract the `jwt.sign(...)` body of `issueSessionTokens` into
  `issueAccessToken(user)` and call it from `issueSessionTokens`.
  **Done when:** `npm test` still reports 174 passing tests with no test changes,
  `npm run lint` and `npm run format:check` pass, and no caller of
  `issueSessionTokens` was modified.

- [x] 2. **Make rotation conditional in `refresh()`.** Compute whether rotation
  is due from the stored expiry:
  `user.refreshTokenExpiresAt.getTime() - Date.now() <= REFRESH_TOKEN_TTL_MS - REFRESH_ROTATION_THRESHOLD_MS`.
  When due, keep the current behavior (`issueSessionTokens` then
  `await user.save()`). When not due, call `issueAccessToken(user)` and skip the
  save entirely. Return the same `{ accessToken, refreshToken,
  refreshTokenExpiresAt }` shape either way, carrying the unrotated values
  through when no rotation happened.
  **Done when:** two calls to `POST /users/refresh` with a freshly issued cookie
  both return `200`, return the same `refreshToken` cookie value, and leave
  `refreshToken` unchanged in the database; a call with a token aged past the
  threshold returns a different cookie value; missing, unknown, and expired
  cookies still return `401`.

- [x] 3. **Update and extend the refresh tests.** In `tests/user.test.js`:
  - Rewrite `returns a new access token and rotates the refresh cookie`
    (line ~800): a fresh signup token is now below the threshold, so it must
    assert `200`, a string `accessToken`, and an unchanged cookie value.
  - Rewrite `rejects a rotated-out refresh token on reuse` (line ~845): drive it
    with a token aged past the threshold so rotation actually happens and the
    first cookie is genuinely rotated out, then assert the `401` on reuse.
  - Add: rotation happens once the token is aged past the threshold (different
    cookie value, `refreshToken` changed in the database).
  - Add: the non-rotating path performs no write (`refreshToken` and
    `refreshTokenExpiresAt` identical before and after).
  - Age a token the way the existing expired-token test does, with
    `User.findByIdAndUpdate(..., { refreshTokenExpiresAt })`, not fake timers.
  **Done when:** `npm test` is green with at least 3 net-new assertions covering
  the non-rotating path, the rotating path, and reuse after a real rotation.

- [x] 4. **Derive the cookie `maxAge` from the stored expiry.** Change
  `setRefreshCookie` to take the expiry alongside the value and set
  `maxAge: refreshTokenExpiresAt.getTime() - Date.now()`. Update its three
  callers (signup, login, refresh). Signup and login always mint a fresh token,
  so their computed `maxAge` stays `REFRESH_TOKEN_TTL_MS` within a millisecond.
  **Done when:** a `POST /users/refresh` that does not rotate returns a
  `Set-Cookie` whose `Max-Age` is strictly less than `REFRESH_TOKEN_TTL_MS` in
  seconds, signup still sets a full-TTL `Max-Age`, and the existing
  `sets the refresh cookie as httpOnly and SameSite=Lax` test still passes.

- [x] 5. **Document the new behavior.** Four places:
  - `routes/user.route.js`: the `POST /users/refresh` OpenAPI `description` and
    its `200` description currently say the cookie is rotated unconditionally.
    State that rotation is conditional and that the cookie can come back
    unchanged.
  - `README.md` line ~72 (endpoint table) and line ~219 (security section), and
    the matching `README.fr.md` line ~68 and line ~215. The security bullet
    currently claims a previously issued refresh token stops working immediately
    once a newer one is minted, which is only true after an actual rotation.
    Replace it with the sliding-session contract, and record there that the
    absence of an absolute session cap is a deliberate product decision.
  - Code comments: one comment in `services/user.service.js` on why the threshold
    exists (bootstrap on every page load), one in `utils/constants.js` on why the
    value is what it is. Follow the Comments standard: the why, not the what.
  **Done when:** neither README still claims unconditional rotation, both say the
  session is sliding with no absolute cap, the Swagger description matches the
  implemented behavior, and `npm run format:check` passes.

## Files / areas

- `utils/constants.js` - new `REFRESH_ROTATION_THRESHOLD_MS`, exported
- `services/user.service.js` - `issueSessionTokens` (line ~78), new
  `issueAccessToken`, `refresh()` (line ~236, the rotation at ~250-251)
- `controllers/user.controller.js` - `setRefreshCookie` (line ~16) and its
  callers at lines ~34 (signup), ~45 (login), ~56 (refresh)
- `routes/user.route.js` - the `POST /users/refresh` OpenAPI block (line ~108)
- `tests/user.test.js` - the `POST /users/refresh` describe block (line ~785)
- `README.md`, `README.fr.md` - endpoint table row and security section

Both READMEs have uncommitted working-tree edits unrelated to this feature. Edit
around them; do not revert or restage them.

## Data / contracts

- No schema change. `refreshToken` / `refreshTokenExpiresAt` keep their current
  types and lifecycle.
- `POST /users/refresh` response body is unchanged: `{ accessToken }`. A new
  access token is minted on every successful call, rotation or not.
- The `401` cases are unchanged: missing cookie, unknown value, expired token.
- **Changed contract:** the `refreshToken` cookie value is no longer guaranteed
  to differ from the presented one. Within the threshold window the same value
  comes back, deliberately, so concurrent tabs converge on one cookie.
- **Changed security property:** presenting the same refresh token twice inside
  the threshold window now succeeds twice instead of the second call getting a
  `401`. The project overview lists reuse detection among the rigor this path
  needs, so state the narrowing plainly rather than letting it pass silently: a
  stolen cookie replayed within the window no longer knocks the legitimate holder
  offline, which removed a crude theft signal. Reuse of a token that was genuinely
  rotated out still returns `401`, and `POST /users/logout` and
  `confirmPasswordReset` still invalidate the session immediately. This is the
  same mechanism that fixes the two-tab race; it is the accepted cost of the
  feature, not an oversight.
- Cookie `Max-Age` now tracks the stored expiry. Before this change a
  non-rotating refresh would have re-armed the cookie for a full 30 days while
  the server record kept its older expiry, a drift of up to the full threshold
  (24 h).

## Testing

`npm test` (Jest + Supertest with `mongodb-memory-server`) is the gate, per
`AGENTS.md` and the Testing standard. No browser coverage: this is an API-only
backend.

Route-level coverage in `tests/user.test.js`, driving real HTTP through Supertest
rather than calling the service directly, matching the existing block:

- fresh token, two consecutive refreshes: both `200`, identical cookie value,
  database `refreshToken` unchanged
- token aged past the threshold: `200`, different cookie value, database
  `refreshToken` changed
- reuse of a genuinely rotated-out token: `401`
- missing / unknown / expired cookie: `401` (existing tests, must stay green)
- `Max-Age` on a non-rotating refresh is below the full TTL

Age tokens by writing `refreshTokenExpiresAt` with `User.findByIdAndUpdate`, the
seam the existing expired-token test already uses. That keeps the threshold
boundary deterministic without fake timers or a clock injection.

## Notes for the AI

- Proportional engineering: no new dependency, no new route, no new model field,
  no configuration surface. One constant, one extracted function, one branch.
- Do not add a lock, a transaction, or a `findOneAndUpdate` compare-and-swap to
  `refresh()`. It stays a read-modify-write, consistent with the current code.
  The residual race is accepted and documented above.
- The threshold is the one tunable value in this feature. 24 h is chosen because
  it sits far below the 30-day TTL (so the session still slides long before it
  could lapse) and far above a page-load burst (so it collapses the tab race).
  Changing it later is a one-line edit with no migration.
- Writing standard: no em dashes anywhere, including the README edits and the
  OpenAPI description. Use a hyphen for `term - description`.
- `blueprint/` is gitignored in this repo, so this spec and the build-plan line
  will not appear in `git status`. That is expected.
- `blueprint/context/coding-standards.md` "Auth & ownership" still describes the
  pre-feature-13 opaque Bearer token. Do not follow it for this feature, and do
  not repair it here either; it is unrelated scope.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":12163,"specSha256":"5461fc41ab20880eb574367ee12da95eeb913e302a13957e562260fc15daa893","branch":"refs/heads/feature/sliding-session-with-a-rotation-threshold","head":"5ead27b17d0eeb586e08671498b5325f7584648d","baseRef":"refs/heads/master","baseCommit":"5ead27b17d0eeb586e08671498b5325f7584648d","sourceTree":"5f64e2c040494ff67877dc019ab02826ebbb5100","absentOptional":[]} -->

## Findings

### 15/F-01 [P2] closed - CORS silently opens to any origin with credentials if FRONTEND_URL is unset

**File:** app.js:21
**Found:** 2026-09-17 by /audit (scope: full; lens: security)
**Why it matters:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })` passes
`undefined` straight through when `FRONTEND_URL` isn't set. The `cors` package treats a falsy
`origin` as "allow any origin" (`node_modules/cors/lib/index.js`: `if (!options.origin ||
options.origin === '*')` reflects `Access-Control-Allow-Origin: *`), so a missing/misconfigured
`FRONTEND_URL` at deploy time silently drops the origin restriction while `credentials: true`
stays on - the opposite of README.md:216's documented contract ("`cors()` is restricted to
`FRONTEND_URL`"). No startup check (index.js) fails fast if the var is absent. Browsers refuse to
honor a wildcard origin together with credentialed requests, which limits real exploitation today,
but it's a silent divergence from the documented security boundary and would bite immediately if
any future client relies on server-side origin checks (or the credentials flag is dropped later).
**Suggested fix:** Fail fast (or default to no allowed origin) when `FRONTEND_URL` is unset, e.g.
validate it alongside `MONGODB_URI` in `index.js`, or pass an explicit array/string origin so an
empty value maps to "no origin allowed" instead of "any origin". No current requirement is lost;
this only removes an unintended fallback.
**Resolution:** `app.js` now passes `process.env.FRONTEND_URL || []` to `cors()` - an empty array
denies every origin instead of falling back to wildcard, so a missing `FRONTEND_URL` fails closed.
`index.js` also exits at startup if `FRONTEND_URL` is unset, mirroring the existing `MONGODB_URI`
check. Re-reviewed 2026-09-17 by /audit (scope: full; lens: security): traced `cors` lib's
`configureOrigin`/`applyHeaders` logic directly - an empty-array `origin` never sets
`Access-Control-Allow-Origin`, so the header is omitted rather than wildcarded when
`FRONTEND_URL` is missing, and `index.js:5-8` exits before `app.listen` in that case. No new
defect introduced in `app.js` or `index.js`. Closed.

### 15/F-02 [P2] closed - Doc comment for issueSessionTokens now sits above issueAccessToken

**File:** services/user.service.js:75
**Found:** 2026-09-19 by /audit (scope: current; lens: quality)
**Why it matters:** Extracting `issueAccessToken` inserted the new function between the existing
four-line comment and the function it documents. The comment says the subject "Mints a short-lived
JWT access token and a rotating refresh token, storing the refresh token on the user document
(caller still has to save() it)", which is now attached to `issueAccessToken` (lines 79-83), a
function that does none of that: it neither mints a refresh token nor touches the document. The
description is accurate only for `issueSessionTokens` on line 85. A reader following the comment
would believe calling `issueAccessToken` rotates the stored refresh token, which is precisely the
distinction feature 15 introduced, so the misplacement actively misleads on the thing this feature
changed.
**Suggested fix:** Move the existing comment block down to sit directly above `issueSessionTokens`
(line 85). Give `issueAccessToken` either no comment or a one-line purpose, per the Comments
standard.
**Resolution:** 2026-09-19: the comment block was moved back above `issueSessionTokens`
(services/user.service.js:81-84). `issueAccessToken` was left without a comment rather than given
a new one, per the Comments standard. `npm test` 178/178, lint and format:check clean.
Re-reviewed 2026-09-19 by /audit (scope: current; lens: quality): services/user.service.js:75-90
now reads `issueAccessToken` with no comment, then the block, then `issueSessionTokens`, so the
description matches its subject. The extracted function has exactly two callers
(`issueSessionTokens:89`, `refresh:269`) and no dead export was introduced. Closed.

### 15/F-03 [P2] closed - POST /users/login has no Set-Cookie coverage although this feature changed its cookie call

**File:** tests/user.test.js:138
**Found:** 2026-09-19 by /audit (scope: current; lens: tests)
**Why it matters:** `setRefreshCookie` changed from two arguments to three, and login is one of its
three call sites (`controllers/user.controller.js:52`). The `POST /users/login` describe block
asserts status codes and body only; the suite has Set-Cookie assertions at signup (line 82), reset
(479) and refresh (807), but none for login. A wrong expiry argument at the login call site would
still produce a syntactically valid cookie with an incorrect `Max-Age` and every login test would
stay green. Only a hard crash (an undefined expiry reaching `.getTime()`) would be caught, and only
indirectly via a 500.
**Suggested fix:** Add one assertion in the login describe block mirroring the signup cookie test:
login mints a fresh token, so its `Max-Age` must be the full `REFRESH_TOKEN_TTL_MS` in seconds
within a few seconds of tolerance.
**Resolution:** 2026-09-19: added `sets a full-lifetime refresh cookie` to the login describe
(tests/user.test.js:152), asserting the `Max-Age` parsed from the real `Set-Cookie` header sits
within 10 seconds of the full `REFRESH_TOKEN_TTL_MS`. Suite went 177 -> 178 passing.
Re-reviewed 2026-09-19 by /audit (scope: current; lens: tests): the assertion parses the real
`Set-Cookie` header, so all three `setRefreshCookie` call sites (signup, login, refresh) now have
cookie coverage. No new defect introduced in tests/user.test.js. Closed.
