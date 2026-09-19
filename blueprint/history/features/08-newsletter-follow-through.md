# Feature: Newsletter follow-through

**From build-plan:** feature 8
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/newsletter-follow-through`

## Goal

Act on the stored-but-unused `newsletter` flag by wiring up real email
delivery through Resend, and use that same delivery to close a real gap: new
accounts currently have no way to prove they own the email address they
signed up with. Signup now creates an inactive account, sends a confirmation
email, and only activates (and unlocks login) once the link is clicked. Once
confirmed, the account additionally receives a newsletter welcome email if
`newsletter` was `true` at signup.

## In scope

- `resend` npm dependency, plus `RESEND_API_KEY`, `EMAIL_FROM`, and
  `BACKEND_URL` env vars (`.env.example` and README env table).
- `utils/email.js`: a best-effort wrapper around Resend with
  `sendConfirmationEmail(to, token)` and `sendNewsletterWelcomeEmail(to)`.
  Send failures are logged server-side only and never throw or block the
  caller - mirrors how `utils/cloudinary.js` is the single seam mocked in
  tests, except failures here are swallowed rather than propagated, since no
  caller here has upload state to roll back.
- `User` schema: `active` (default `false`), `confirmationToken`,
  `confirmationTokenExpiresAt`.
- Signup creates the account inactive, generates a confirmation token (24h
  TTL, same `uid2` generator as the auth token), and sends the confirmation
  email. Signup's request/response shape is unchanged.
- `GET /users/confirm/:token` - public, activates the account, clears the
  confirmation token, and (only if `newsletter === true`) triggers the
  welcome email.
- `POST /users/confirm/resend` - public, `{ email }`, re-issues a fresh
  confirmation token and re-sends the email for an existing, not-yet-active
  account. Never leaks account existence or confirmation status through the
  response: always the same 200, regardless of whether the email is unknown,
  already active, or genuinely re-sent.
- Login rejects an inactive account with 403 after password verification
  succeeds (never before - don't leak confirmation status to a wrong
  password).
- `isAuthenticated` also rejects an inactive account (403), so a token issued
  at signup can't be used to bypass confirmation on any other authenticated
  route (PUT/PATCH/DELETE `/users/:id`, offer routes, etc.).
- Test fixtures: a shared `activateUser(email)` helper in
  `tests/setupTestDb.js`, and every existing signup-then-login flow in
  `tests/user.test.js`, `tests/offers.test.js`, and `tests/validation.test.js`
  updated to confirm the account first.

## Out of scope

- Frontend UI for entering the confirmation link/flow (no frontend is
  connected yet; the link target is the backend's own `GET` route).
- Password reset (feature 11) - separate token/flow, own feature.
- Any newsletter *content* pipeline beyond the one welcome email (campaigns,
  unsubscribe links, list management) - not requested, no established need.
- Re-sending the newsletter welcome email later if `newsletter` is toggled
  on after confirmation via `PUT`/`PATCH /users/:id` - out of scope for this
  feature; welcome email only fires at confirmation time.

## Build loop

Follow `workflow.stepReview: "feature"` (`blueprint/config.json`): one review
packet after all steps below are done, not per-step. `checkpointCommits` is
disabled, so no intermediate commits are offered. `/complete` makes the final
feature commit.

## Build steps

- [x] **Step 1 - Email utility and schema foundations** - Add the `resend`
      dependency and `RESEND_API_KEY`/`EMAIL_FROM`/`BACKEND_URL` to
      `.env.example`. Add `utils/email.js` with `sendConfirmationEmail` and
      `sendNewsletterWelcomeEmail`, both catching and logging send errors
      instead of throwing. Add `active`/`confirmationToken`/
      `confirmationTokenExpiresAt` to `models/User.js` and
      `CONFIRMATION_TOKEN_TTL_MS` (24h) to `utils/constants.js`. No behavior
      changes yet. *Done when:* `npm test` still passes unchanged, plus a new
      unit test shows `utils/email.js` swallows a rejected Resend call
      instead of throwing.
- [x] **Step 2 - Confirmation flow and login/session gating** - Update
      `signup` to create the account inactive and send the confirmation
      email. Add `confirmEmail`/`resendConfirmation` to
      `services/user.service.js`, `controllers/user.controller.js`, and
      `routes/user.route.js` (`GET /users/confirm/:token` registered above
      `GET /:id`; `POST /users/confirm/resend` behind `authLimiter`). Make
      `login` reject an inactive account (403, after password check) and
      `isAuthenticated` reject an inactive account (403) on every
      authenticated route. Add the `activateUser` test helper and update
      every existing signup-then-login test in `tests/user.test.js`,
      `tests/offers.test.js`, and `tests/validation.test.js` to confirm the
      account first, plus new tests for confirm/resend/login-when-inactive.
      *Done when:* `npm test` passes with the full suite green again, an
      inactive account gets 403 on login and on an authenticated route using
      its signup token, and `GET /users/confirm/:token` activates it.
- [x] **Step 3 - Newsletter welcome email on confirmation** - After a
      successful confirmation, call `sendNewsletterWelcomeEmail` only when
      the confirmed user's `newsletter` is `true`. *Done when:* a test
      confirms an account with `newsletter: true` and asserts the welcome
      email mock was called, and a matching `newsletter: false` (or
      omitted) case asserts it was not; `npm test` passes.

## Files / areas

- `models/User.js`
- `utils/constants.js`
- `utils/email.js` (new)
- `services/user.service.js`
- `controllers/user.controller.js`
- `routes/user.route.js`
- `middlewares/isAuthenticated.js`
- `.env.example`, `README.md` (env var table, if one exists)
- `package.json` (`resend` dependency)
- `tests/setupTestDb.js`, `tests/user.test.js`, `tests/offers.test.js`,
  `tests/validation.test.js`

## Data / contracts

- `User.active` (Boolean, required, default `false`) - gates `login` and
  `isAuthenticated`, both 403 with `"Please confirm your email address
  before logging in"` when `false`.
- `User.confirmationToken` (String, default `null`) - opaque, `uid2(32)`,
  single-use: cleared to `null` on successful confirmation.
- `User.confirmationTokenExpiresAt` (Date, default `null`) - now + 24h at
  generation (signup or resend). An expired or unknown token on
  `GET /users/confirm/:token` returns the same 400
  `"Invalid or expired confirmation link"` (no distinction between
  not-found and expired).
- `POST /users/signup` - unchanged request/response shape and status (201).
  Account is created inactive; the confirmation email send never blocks or
  changes this response, success or failure.
- `GET /users/confirm/:token` - 200 with the user DTO plus `active: true`
  on success; 400 on invalid/expired token. No auth required. `active` is
  only ever included here (the confirming caller already holds the one-time
  token proving ownership) - the generic `toUserDTO()` used by
  `GET /users/:id` and the other user routes does not expose `active`, so an
  arbitrary caller can't learn any other account's confirmation status.
- `POST /users/confirm/resend` - `{ email }` (Joi: `email().required()`).
  Always responds 200 `{ message: "Confirmation email sent" }`, whether the
  email is unknown, belongs to an already-active account, or a real inactive
  account - the response never distinguishes these cases (no account
  enumeration or confirmation-status oracle). Internally, only the real
  inactive-account case rotates the token and actually sends mail; the other
  two are a silent no-op. Rate limited via the existing `authLimiter`.
- `POST /users/login` - unchanged request. New 403 branch,
  `"Please confirm your email address before logging in"`, thrown only
  after password verification succeeds (an inactive account with a wrong
  password still gets the existing generic 403 `"Unauthorized"`, so
  confirmation status is never leaked to a failed guess).
- `isAuthenticated` - `select()` must add `active` alongside the existing
  `email account tokenIssuedAt`; rejects with the same 403 message. This is
  the single choke point for every authenticated route, so a signup-issued
  token can't be used elsewhere before the account is confirmed.
- Email sends are best-effort and fire-and-forget from the caller's
  perspective: `utils/email.js` never throws, so a Resend outage never fails
  signup, confirm, or resend. Callers in `services/user.service.js` do not
  `await` the send, so a slow or hanging Resend call can never hold a
  signup/confirm/resend response open.

## Testing

- Unit: `utils/email.js` - a rejected/thrown Resend call is caught and
  logged, not propagated (mirrors how `utils/cloudinary.js` failures are
  tested, but asserting swallow-not-rethrow instead of a 500).
- Integration (Supertest + `mongodb-memory-server`, `utils/email.js` fully
  mocked like `utils/cloudinary.js` already is):
  - Signup creates an inactive account and calls
    `sendConfirmationEmail` with the generated token.
  - Login on an unconfirmed account returns 403 with the confirmation
    message; wrong password on an unconfirmed account still returns the
    existing generic 403.
  - An authenticated route (e.g. `PATCH /users/:id`) with a signup-issued
    token on an unconfirmed account returns 403.
  - `GET /users/confirm/:token` with a valid token activates the account,
    clears the token, and login then succeeds.
  - `GET /users/confirm/:token` with an unknown or expired token returns
    400 and leaves the account inactive.
  - `POST /users/confirm/resend` returns the same 200 for an unknown email,
    an already-active account, and a real inactive account (no enumeration),
    but only the real inactive-account case actually rotates the token and
    calls `sendConfirmationEmail`.
  - Confirming with `newsletter: true` calls `sendNewsletterWelcomeEmail`;
    confirming with `newsletter: false`/omitted does not.
  - Every existing test that signs up then logs in (across
    `tests/user.test.js`, `tests/offers.test.js`,
    `tests/validation.test.js`) is updated to call the new
    `activateUser(email)` helper between the two, so the pre-existing
    suite stays green under the new default-inactive behavior.
- No test performs a real Resend API call; `RESEND_API_KEY` stays unset in
  the test environment.

## Notes for the AI

- Route order matters: `router.get('/confirm/:token', ...)` must be
  registered before `router.get('/:id', ...)` in `routes/user.route.js`, or
  Express will match `/confirm/:token` against the `:id` param instead.
- Follow the existing `uid2`-based token pattern (same generator as the
  Bearer auth token) for `confirmationToken`, not a new token scheme.
- Follow the existing `assertValid`/`throwError` pattern already used
  throughout `services/user.service.js`; don't introduce a new validation or
  error-handling style for the new endpoints.
- `utils/email.js` follows the `utils/cloudinary.js` shape (a thin wrapper
  module, one function per operation) so it can be `jest.mock()`-ed the same
  way - but unlike Cloudinary uploads, failures here are logged and
  swallowed, never re-thrown, since nothing downstream needs to roll back a
  failed email send.
- Do not add unsubscribe links, list-management, or any other email beyond
  the two described - not requested, no established need.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":11569,"specSha256":"e8c541decfb936e1799154a414b3556773b037a3a6bd9e71048cd8f15fccceda","branch":"refs/heads/feature/newsletter-follow-through","head":"752feaa7745c774f16cc56caf528a38b9ba8df6d","baseRef":"refs/heads/master","baseCommit":"b87fd092884ecc9b809616ebbba52a77c7af7b78","sourceTree":"222159746ab9d89ea5b22c1308c56bc24ef39559","absentOptional":[]} -->

## Findings

### 8/F-01 [P2] closed - Unset BACKEND_URL silently emails a dead confirmation link

**File:** utils/email.js:7
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `confirmUrl` interpolates `process.env.BACKEND_URL` with no
guard. If that variable is unset or misspelled in a deployment, the template
literal yields `undefined/users/confirm/<token>`, the Resend call succeeds, and
nothing is logged. Unlike a transient Resend outage (which the spec
deliberately swallows), this is a silent success that produces an unusable
link. Because `active` now gates both `login` and `isAuthenticated`, the
affected account can never log in and never reaches any authenticated route.
Nothing validates `BACKEND_URL`, `EMAIL_FROM`, or `RESEND_API_KEY` at startup -
`index.js` only exits on a MongoDB failure - so the misconfiguration surfaces
only as user complaints.
**Suggested fix:** Guard the required email env vars once at send time (or at
startup in `index.js`, alongside the existing MongoDB check): when
`BACKEND_URL` or `EMAIL_FROM` is missing, log a distinct error and skip the
send instead of emailing an `undefined`-prefixed URL.
**Resolution:** Both `sendConfirmationEmail` and `sendNewsletterWelcomeEmail`
now check their required env vars first and log-and-return instead of sending
a broken link; `tests/email.test.js` covers both skip paths.
Closed by the independent review of f520899 (2026-09-17): re-read
`utils/email.js:5-11` and `:29-34` - the guard runs before any URL is built and
before the Resend client is constructed, `sendNewsletterWelcomeEmail` correctly
checks only `EMAIL_FROM` (it builds no link), and a missing `RESEND_API_KEY`
still throws inside the existing try/catch and is logged. Both skip paths are
asserted in `tests/email.test.js:60-78`. No new issue introduced.

### 8/F-02 [P2] closed - confirmEmail queries Mongo with an unvalidated route param

**File:** services/user.service.js:188
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `confirmEmail` passes `req.params.token` straight into
`User.findOne({ confirmationToken: data.token, ... })` with no Joi schema. This
breaks the project rule in `AGENTS.md` ("Joi validates and sanitizes input on
every route before it reaches the database") and the active spec's own
instruction to follow the existing `assertValid`/`throwError` pattern -
`resendConfirmation`, added in the same commit twenty lines below, does use
`assertValid`. It is also the one input path `middlewares/sanitizeMongo.js`
explicitly does not cover: its header comment states it touches only `req.body`
because `req.params` is unpopulated at that point in the chain, and relies on
route params being validated at the service layer. Not exploitable today
(Express 5 route params are always strings, and the `confirmationTokenExpiresAt:
{ $gt: new Date() }` clause would reject a null token anyway), so this is a
missing guard on an authentication boundary rather than a live injection.
**Suggested fix:** Add a `confirmEmailSchema` (`token: Joi.string().required()`)
and run `data = assertValid(confirmEmailSchema, data)` as the first line of
`confirmEmail`, mirroring `resendConfirmation`.
**Resolution:** Added exactly that: `confirmEmailSchema` and the
`assertValid` call at the top of `confirmEmail`.
Closed by the independent review of f520899 (2026-09-17):
`services/user.service.js:46-48` defines `confirmEmailSchema` as
`{ token: Joi.string().required() }` and `:193` runs
`data = assertValid(confirmEmailSchema, data)` as the first statement, matching
the `resendConfirmation` pattern. The unvalidated param no longer reaches Mongo.

### 8/F-03 [P2] closed - README API reference omits both new endpoints and is stale on the user DTO

**File:** README.md:62
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `AGENTS.md` designates `README.md` as this project's API
reference, and the spec lists `README.md` under Files / areas. The commit
updated only the environment-variable table. The endpoint table still has no row
for `GET /users/confirm/:token` or `POST /users/confirm/resend`, and line 64
still documents `GET /users/:id` as returning `_id`, `account.username`,
`account.avatar`, `newsletter` - `toUserDTO` now also returns `active`, so the
documented response shape is wrong for every route that uses the DTO. Nothing
documents that signup now yields an account that cannot log in until confirmed,
which is the single largest behavior change in this feature.
**Suggested fix:** Add the two endpoint rows to the table around README.md:62,
add `active` to the `GET /users/:id` response list on line 64, and note on the
`POST /users/signup` row that the account starts inactive and login is blocked
until the emailed link is followed.
**Resolution:** Added rows for both new endpoints, noted the inactive-by-default
signup behavior and the 403 on unconfirmed login, and added a Security bullet
on the non-leaking resend/login behavior. `active` is not documented on
`GET /users/:id` because F-05's fix removed it from that response entirely
instead - see F-05.
Closed by the independent review of f520899 (2026-09-17): README.md now carries
both endpoint rows, the inactive-signup and 403-login notes, and the Security
bullet at README.md:199. The `GET /users/:id` field list matches the current
`toUserDTO` exactly (no `active`), so the documented shape is accurate again.

### 8/F-04 [P3] closed - Confirmation token is consumed non-atomically

**File:** services/user.service.js:196
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `confirmEmail` reads the user with `findOne`, then mutates
and `save()`s it. The token is documented as single-use, but two requests
carrying the same link concurrently can both pass the `findOne` before either
save lands, so both activate the account and both fire
`sendNewsletterWelcomeEmail` - a duplicate email to the user. This also drifts
from the convention this project states twice (`AGENTS.md`, README.md:189):
enforce the guard atomically with the write itself via a single
`findOneAndUpdate`. Impact is a duplicate email, not a privilege change, since
both racers hold the same valid token.
**Suggested fix:** Replace the read-modify-save with one
`findOneAndUpdate({ confirmationToken: data.token, confirmationTokenExpiresAt:
{ $gt: new Date() } }, { active: true, confirmationToken: null,
confirmationTokenExpiresAt: null })`; a null result is the existing 400 branch,
and only the winning call proceeds to the welcome email.
**Resolution:** Replaced with exactly that atomic `findOneAndUpdate`.
Closed by the independent review of f520899 (2026-09-17):
`services/user.service.js:195-209` is a single `findOneAndUpdate` filtered by
token plus unexpired TTL, clearing both token fields in the same write, with
`returnDocument: 'after'` so the returned document reflects `active: true`. A
second concurrent request no longer matches the filter, so only the winner
reaches `sendNewsletterWelcomeEmail`. Tests at `tests/user.test.js:230-268`
cover the valid, unknown, and expired token paths.

### 8/F-05 [P3] closed - Confirmation status is disclosed to unauthenticated callers

**File:** services/user.service.js:212
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** `POST /users/confirm/resend` is public and answers with
three distinguishable outcomes: 404 "User not found", 400 "Account is already
confirmed", and 200. That is an oracle for both account existence and
confirmation state. It sits directly against the care taken in `login`
(services/user.service.js:165), where the confirmation check was deliberately
placed after password verification so a wrong guess cannot learn the same fact.
`toUserDTO` adding `active` widens this: the public `GET /users/:id` now
returns the confirmation state of any account whose id is known. Mitigating
factors keep this low: signup already returns 409 on a duplicate email, so
email existence is enumerable today, and `authLimiter` caps the endpoint at 20
requests per 15 minutes. Note the current responses are exactly what the
approved spec prescribes, so narrowing them changes shipped, specified
behavior and needs an explicit user decision rather than an automatic repair.
**Suggested fix:** If the user wants the oracle closed, collapse both error
branches into the same 200 `{ message: 'Confirmation email sent' }` and send
mail only when an inactive account matched. Requirement that would be lost:
the spec's distinct 404 / 400 response codes for this endpoint.
**Resolution:** User explicitly decided the spec's leaking behavior was wrong,
not a requirement to preserve. Updated `blueprint/context/current-feature.md`
to specify the non-leaking contract, collapsed `resendConfirmation` to always
return the same 200 and only act when a real inactive account matches, and
removed `active` from the generic `toUserDTO()` (it's now only included in
`confirmEmail`'s own response, where the caller already proved ownership via
the one-time token).
Closed by the independent review of f520899 (2026-09-17):
`services/user.service.js:216-228` has a single exit returning
`{ message: 'Confirmation email sent' }` with no status-dependent branch, and
`toUserDTO` at `:82-92` no longer exposes `active` (with a comment stating
why); `confirmEmail` re-adds it only on its own response. The spec at
`blueprint/context/current-feature.md:36-40` and `:139-145` now describes the
non-leaking contract, and `tests/user.test.js:289-334` asserts an identical 200
for the unknown-email, already-active, and genuinely-resent cases, with the
send mock only called in the last. No new issue introduced.

### 8/F-06 [P3] closed - Signup blocks on an untimed outbound Resend call

**File:** services/user.service.js:128
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** The spec describes email sends as "fire-and-forget from the
caller's perspective", but `signup` awaits `sendConfirmationEmail` before
returning, so the 201 is now gated on a third-party HTTP round-trip. The Resend
client is constructed with no timeout option and Node's fetch has no default
timeout, so a hung Resend connection holds the signup request open
indefinitely; the same applies to `confirmEmail` (:202) and
`resendConfirmation` (:222). Under the 20-request `authLimiter` window this is
a latency and connection-holding concern rather than an outage, and it is
unverified by profiling - no runtime measurement was taken.
**Suggested fix:** Either drop the `await` and let the already-swallowing
wrapper run detached, or pass an abort signal / timeout to the Resend call so a
stalled upstream cannot outlive the request.
**Resolution:** Dropped the `await` on all three call sites (`signup`,
`confirmEmail`, `resendConfirmation`); the wrapper's own try/catch still
swallows the eventual result, so nothing is unhandled.
Closed by the independent review of f520899 (2026-09-17): all three call sites
(`services/user.service.js:136`, `:212`, `:224`) are un-awaited, each with the
comment explaining why. The detached promises cannot reject: both wrapper
functions return early on a missing env var and wrap every Resend call
(including the `new Resend(...)` construction, which throws on a falsy key) in
try/catch, so no unhandled rejection is introduced. Signup still calls the send
after `newUser.save()` resolves, so the token it passes is the persisted one.

### 8/F-07 [P3] closed - Email unit tests never assert the send payload

**File:** tests/email.test.js:19
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security, performance, tests)
**Why it matters:** Both cases in `tests/email.test.js` assert only that a
rejected send is swallowed and that `mockSend` ran once. Nothing asserts what
was sent, so the `from` address, the subject, and the confirmation URL are
entirely uncovered. F-01's `undefined/users/confirm/<token>` link passes this
suite unnoticed, and so would a wrong or empty `from`. The integration tests in
`tests/user.test.js` mock `utils/email.js` wholesale, so they cannot cover this
either - `tests/email.test.js` is the only place the real wrapper runs.
**Suggested fix:** Add one assertion on `mockSend.mock.calls[0][0]` covering
`from`, `to`, and an `html` containing both `process.env.BACKEND_URL` and the
token, with the env vars set inside the test.
**Resolution:** Added a test asserting `mockSend`'s `from`, `to`, and `html`
(containing the full confirmation URL), plus two tests covering the new
BACKEND_URL/EMAIL_FROM skip guards from F-01.
Closed by the independent review of f520899 (2026-09-17):
`tests/email.test.js:46-58` asserts `from`, `to`, and an `html` containing the
full `https://api.example.com/users/confirm/sometoken` URL, so the F-01 defect
could no longer pass unnoticed. Env vars are set and restored per test
(`:17-27`), so the suite does not depend on ambient configuration.

### 8/F-08 [P1] closed - Delta breaks `npm run format:check`, so the CI lint job fails

**File:** middlewares/isAuthenticated.js:26
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** Two blocks added by this delta are not Prettier-formatted.
`middlewares/isAuthenticated.js:26-31` wraps the 403 body onto a second line
(`message:` then the string) where Prettier wants it on one line, and
`routes/user.route.js:17-22` expands the `POST /confirm/resend` registration
across five lines where Prettier wants a single-line call. `AGENTS.md` declares
`npm run format:check` a CI gate and `.github/workflows/ci.yml` runs it on
every push/PR, so the lint job goes red on this branch. This is attributable to
the delta rather than pre-existing noise: the same two files at base commit
`b87fd09` pass `prettier --check` cleanly, while the 28 warnings in a raw local
run are CRLF line endings in the Windows working tree (untouched files such as
`app.js`, `eslint.config.js`, and `utils/capitalize.js` warn too). Checked
against the committed LF blobs, only these two files still fail. The two ESLint
parse errors are likewise not delta defects - they come from `.agents/` and
`.claude/` `.mjs` tooling that this delta newly git-ignores, so CI never checks
out those paths.
**Suggested fix:** Run `npm run format` (or hand-apply the two collapses) and
re-verify with `prettier --check` against the committed LF content rather than
the CRLF working tree.
**Resolution:** Ran `npm run format` (Prettier `--write`) on both files;
`npx prettier --check middlewares/isAuthenticated.js routes/user.route.js`
now passes and `npm test` remains green (77 tests).
Closed by the independent review of 752feaa (2026-09-17): re-derived the CI
condition rather than trusting the raw local run. Every tracked file was
extracted from the target commit with `git cat-file blob HEAD:<path>` (raw
blobs, no `core.autocrlf` conversion) into a scratch tree and checked with
`prettier --check .` against the committed `.prettierrc`/`.prettierignore`:
"All matched files use Prettier code style" - zero failures across the whole
repository, so the CI `format:check` job is green on this branch.
`middlewares/isAuthenticated.js:26-30` is now a single-line `message:` property
and `routes/user.route.js:18` is a one-line `POST /confirm/resend`
registration; both, plus the newly edited `tests/offers.test.js`, also pass
`npx prettier --check` directly in the working tree. The reformat is
whitespace-only - it changed no status code, message string, middleware order,
or route-registration order (`/confirm/:token` is still registered above
`/:id` at `routes/user.route.js:17-19`), and `npm test` passes 77/77. The 25
remaining warnings from a raw `npm run format:check` here are CRLF working-tree
noise confirmed by `git ls-files --eol` (index `i/lf`, worktree `w/crlf` on
every warned file, including untouched ones such as `app.js` and
`README.fr.md`); CI checks out LF on Linux. `npm run lint` still fails only on
`.agents/skills/doctor/scripts/run-state.mjs` and
`.claude/skills/doctor/scripts/run-state.mjs`, both git-ignored and absent from
a CI checkout - re-verified this pass, not assumed. No new issue introduced.

### 8/F-09 [P3] accepted - Accounts that exist before this deploy are locked out with no documented recovery

**File:** models/User.js:17
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** `active` is added with `default: false`, and both `login`
(services/user.service.js:173) and `isAuthenticated`
(middlewares/isAuthenticated.js:26) now reject a falsy `active`. A Mongoose
default applies at document creation/hydration and is never written back to
rows already in the collection, so every account created before this deploy
becomes unable to log in or use any authenticated route the moment it ships.
There is a self-service path out - `POST /users/confirm/resend` matches on
`!user.active`, issues a token, and mails the link - but nothing in `README.md`
or the spec tells an operator or an existing user that this is what happened or
what to do, and no backfill is part of the delta. Kept at P3 because this
project has no established production deployment and the recovery path works.
**Suggested fix:** Add a short note to the README's "Known limitations /
roadmap" (or a one-line backfill in `data/seed.js`) stating that accounts
created before this change must re-confirm via `POST /users/confirm/resend`. A
full migration framework would be more machinery than the requirement
justifies.
**Resolution:** User's explicit decision: no accounts exist in the database
yet (app is still in development, pre-launch), so there is nothing to lock out
and no backfill or documentation is needed at this time.

### 8/F-10 [P3] closed - tests/offers.test.js runs the real email wrapper instead of mocking it

**File:** tests/offers.test.js:1
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** The spec's Testing section says the integration tests keep
`utils/email.js` "fully mocked like `utils/cloudinary.js` already is".
`tests/user.test.js:11-15` does exactly that, but `tests/offers.test.js` mocks
only Cloudinary, so each of its three `POST /users/signup` calls executes the
real `utils/email.js`. Today that is a no-op plus a `console.error` line,
because `app.js` never loads `dotenv` (only `index.js` does), leaving
`EMAIL_FROM` and `BACKEND_URL` unset under Jest - the suite is green and no
network call happens. The risk is that the safety rests on an unrelated
accident of where `dotenv.config()` sits: if those variables ever enter the
test environment (a CI secret, an exported shell var, or `dotenv` moving into
`app.js`), this suite starts making real Resend calls to `seller@example.com`
and `other@example.com`, which the spec explicitly forbids.
**Suggested fix:** Add the same `jest.mock('../utils/email', ...)` block that
`tests/user.test.js:11-15` already uses to `tests/offers.test.js`.
**Resolution:** Added the identical `jest.mock('../utils/email', ...)` block
to `tests/offers.test.js`; `npm test` remains green (77 tests).
Closed by the independent review of 752feaa (2026-09-17): `tests/offers.test.js:14-17`
now carries a `jest.mock('../utils/email', ...)` factory that is byte-identical
in shape to `tests/user.test.js:12-15`, stubbing both `sendConfirmationEmail`
and `sendNewsletterWelcomeEmail`. The real wrapper is therefore no longer
reachable from this suite's three `POST /users/signup` calls, so the safety no
longer depends on `dotenv` living in `index.js` rather than `app.js`. The
factory builds its `jest.fn()`s inline, so Jest's hoisting of `jest.mock` above
the `require` of `app` is safe and no out-of-scope-variable error is possible;
it is placed before the existing Cloudinary mock and the suite still passes
(77/77, 4 suites). `tests/validation.test.js` was listed in the spec but needs
no mock: its only signup/login cases are Joi rejections that never reach the
service layer. No new issue introduced.

## Independent review

**Status:** passed
**Target commit:** 752feaa7745c774f16cc56caf528a38b9ba8df6d
**Base commit:** b87fd092884ecc9b809616ebbba52a77c7af7b78
**Base ref:** origin/master
**Spec hash:** e8c541decfb936e1799154a414b3556773b037a3a6bd9e71048cd8f15fccceda
**Spec snapshot:** blueprint/.state/review-specs/752feaa7745c774f16cc56caf528a38b9ba8df6d-e8c541decfb936e1799154a414b3556773b037a3a6bd9e71048cd8f15fccceda.md
**Prepared by:** claude
**Builder model:** claude-sonnet-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5
**Requested execution:** automatic
**Requested at:** 2026-09-17T15:30:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-17T13:20:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git rev-parse HEAD`: pass - equals Target commit 752feaa
- `git merge-base HEAD origin/master`: pass - equals Base commit b87fd09
- `sha256sum blueprint/context/current-feature.md`: pass - matches Spec hash; the snapshot file hashes identically
- `git status --porcelain -uall`: pass - clean; no path differs from the target
- `git check-ignore -v` / `git ls-files --stage` / `git ls-tree -r HEAD` on the spec and snapshot: pass - both ignored, untracked, absent from index and target
- `npm test`: pass - 4 suites, 77 tests, 0 failures
- `npm run lint`: fail locally - 2 parse errors, both in git-ignored `.mjs` Blueprint tooling (`.agents/skills/doctor/scripts/run-state.mjs`, `.claude/skills/doctor/scripts/run-state.mjs`), outside this delta and never checked out in CI; re-verified this pass rather than assumed
- `npm run format:check`: fail locally - 25 CRLF working-tree warnings, none attributable to the delta (see Evidence)
- `npx prettier --check middlewares/isAuthenticated.js routes/user.route.js tests/offers.test.js`: pass - "All matched files use Prettier code style"
- `prettier --check .` over every raw committed blob of 752feaa: pass - zero failures repository-wide

### Evidence

- Full `b87fd09..752feaa` delta reviewed fresh across all four lenses: 17 files, +660/-22 (`utils/email.js` new, `models/User.js`, `utils/constants.js`, `services/user.service.js`, `controllers/user.controller.js`, `routes/user.route.js`, `middlewares/isAuthenticated.js`, `.env.example`, `README.md`, `.gitignore`, `AGENTS.md`, `package.json`, `package-lock.json`, and the four test files).
- Local `format:check` noise is a checkout artifact, not delta drift: `git config core.autocrlf` is `true` and `git ls-files --eol` shows `i/lf w/crlf` on every warned file, including untouched ones (`app.js`, `README.fr.md`, `.prettierrc`). Extracting each tracked path with `git cat-file blob HEAD:<path>` (which applies no EOL filter) into a scratch tree and running `prettier --check .` against the committed config reports zero failures, so the CI `format:check` job is green on this branch.
- F-08 repair verified as whitespace-only: `middlewares/isAuthenticated.js:26-30` (single-line `message:`) and `routes/user.route.js:18` (one-line registration). No status code, message string, middleware, or route-registration order changed; `/confirm/:token` still precedes `/:id` (`routes/user.route.js:17-19`), which the spec calls out as order-sensitive.
- F-10 repair verified: `tests/offers.test.js:14-17` mocks both email functions with an inline factory matching `tests/user.test.js:12-15`; the real wrapper is unreachable from that suite's signup calls, so test isolation no longer depends on `dotenv` being absent from `app.js`.
- Security re-verified independently: `login` checks `!user.active` only after `bcrypt.compare` succeeds (`services/user.service.js:162-175`); `isAuthenticated` adds `active` to its `select()` and rejects with 403 at the single authenticated choke point; `confirmEmail` validates the route param through Joi then consumes the token in one atomic `findOneAndUpdate` filtered by token plus unexpired TTL; `resendConfirmation` has one unconditional 200 exit with no status-dependent branch; `toUserDTO` does not expose `active`.
- Tests re-verified against the spec's Testing section: inactive signup, wrong-password-vs-confirmed 403 distinction, signup-token rejection on `PATCH /users/:id`, valid/unknown/expired confirm tokens, the three identical resend responses, and the newsletter true/false split are all covered. No skipped, focused, or placeholder tests found. `tests/validation.test.js` correctly needs no `activateUser` - its signup/login cases are Joi rejections that never reach the service layer.

### Findings

- F-08 [P1] moved `fixed` -> `closed`
- F-10 [P3] moved `fixed` -> `closed`
- F-09 [P3] left `accepted` by the user's recorded decision; not re-litigated
- No new findings raised this pass

### Remaining risk

- `npm run lint` cannot pass locally while the git-ignored `.mjs` Blueprint tooling sits in the working tree; the clean signal is only re-derivable by inspecting which paths failed, not from the exit code.
- `npm run format:check` cannot pass locally on this Windows checkout (`core.autocrlf=true`); a clean result requires the committed-blob check described in Evidence. A future contributor running the documented command will see a red result that does not reflect CI.
- No Check step was run (not required for this request), so no behavior was proven against a live server; all runtime evidence is from Jest plus `mongodb-memory-server`.
- Email delivery is never exercised end to end: `utils/email.js` is mocked in the integration suites and `resend` is mocked in `tests/email.test.js`, so a real Resend send, a real confirmation link, and the `BACKEND_URL`/`EMAIL_FROM` production values remain unverified by any command available here.
- No performance profiling was run. `confirmationToken` and `token` are queried on unindexed fields; consistent with the existing `isAuthenticated` pattern and immaterial at this scale, but unmeasured.
