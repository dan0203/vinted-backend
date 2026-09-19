# Feature: Password reset via email

**Status:** verified
**From build-plan:** feature 11
**Build attempt:** 1
**Branch:** feature/password-reset-via-email

## Goal

Give a user with no working password a self-service recovery path: request a
reset by email, then set a new password using a time-limited, single-use token
delivered to that email address. Today there is no account-recovery route at
all.

## In scope

- `POST /users/reset/request` - body `{ email }`. Always responds `200` with
  the same generic message regardless of whether the email is unknown or
  known, mirroring the existing `POST /users/confirm/resend` anti-enumeration
  behavior. For a known account, issues a reset token and emails it via Resend
  (reusing `utils/email.js`'s existing lazy-`Resend`-client, env-var-checked,
  try/catch-swallowed pattern).
- `POST /users/reset/confirm` - body `{ token, password }`. Validates the
  token exists and is unexpired, hashes the new password with bcrypt (same
  cost factor as signup), clears the reset token, and rotates the session
  `token`/`tokenIssuedAt` so any previously issued bearer token stops working
  (the same rationale as login's rotation: a password reset is a strong
  enough signal that other live sessions should also require the new
  password). Also clears `failedLoginAttempts`/`lockUntil` so a reset isn't
  blocked by a stale lockout. Returns `400` for an invalid/expired token.
- New `User` schema fields `resetToken` / `resetTokenExpiresAt`, matching the
  existing `confirmationToken` / `confirmationTokenExpiresAt` shape.
- New `RESET_TOKEN_TTL_MS` constant (1 hour - shorter than the 24h
  confirmation TTL, since a reset token grants a password change rather than
  just activation).
- Rate limiting via the existing `authLimiter` on both new routes, same as
  signup/login/confirm-resend.
- README API table + env var section updated to document the two routes (no
  new env vars - reuses `RESEND_API_KEY`/`EMAIL_FROM`/`BACKEND_URL`).

## Out of scope

- Any new frontend or hosted reset-password page. This is a backend-only
  repo; the email contains the raw reset token itself, and the caller
  (frontend, not built here) POSTs it back to `/users/reset/confirm` with the
  new password, the same client responsibility split already used for email
  confirmation.
- Multiple concurrent reset tokens per user, reset-token audit/history,
  notifying the user by email that their password changed (no such
  notification exists for any other account change today either).
- Changes to `security/*` branches (account-lockout, token-expiry, etc.) -
  those are separate, unmerged work and out of reach for this feature.

## Build loop

Per `blueprint/config.json`: `workflow.stepReview` is `feature`, so pause for
review after each build step below rather than after the whole feature.
`workflow.checkpointCommits` is `disabled`, so do not commit after individual
steps; `/complete` makes the single final commit once all steps are done.

## Build steps

- [x] 1. Add `resetToken` (String, default null) and `resetTokenExpiresAt`
      (Date, default null) fields to `models/User.js`, and add
      `RESET_TOKEN_TTL_MS = 60 * 60 * 1000` to `utils/constants.js` (exported
      alongside `CONFIRMATION_TOKEN_TTL_MS`).
      Done when: `npm test` still passes (no behavior change yet).
- [x] 2. Add `sendPasswordResetEmail(to, token)` to `utils/email.js`, following
      the exact structure of `sendConfirmationEmail` (env-var guard for
      `BACKEND_URL`/`EMAIL_FROM`, lazy `Resend` client, try/catch that logs
      and swallows). The email body includes the raw token (not a clickable
      backend link, since confirming requires POSTing a new password) with
      subject "Reset your Vinted password".
      Done when: a Jest unit test (mirroring `tests/email.test.js`'s
      confirmation-email cases) confirms the mocked `resend.emails.send` is
      called with the right `to`/`subject`/token, and that a missing env var
      or a rejected send is swallowed without throwing. `npm test` passes.
- [x] 3. Add `requestPasswordReset(data)` and `confirmPasswordReset(data)` to
      `services/user.service.js`:
      - `requestPasswordReset`: Joi-validates `{ email }`; if a matching user
        exists, generates a token with `uid2(32)` (same generator used for
        `confirmationToken`), sets `resetTokenExpiresAt` to
        `Date.now() + RESET_TOKEN_TTL_MS`, saves, and fire-and-forgets
        `sendPasswordResetEmail` (not awaited, matching the existing
        fire-and-forget confirmation-email call); always returns the same
        `{ message }` shape regardless of match.
      - `confirmPasswordReset`: Joi-validates `{ token, password }`
        (`password` reuses signup's `min(6)` rule); does an atomic
        `findOneAndUpdate` filtered by `{ resetToken: token,
        resetTokenExpiresAt: { $gt: new Date() } }` that sets the new
        `hash`, clears `resetToken`/`resetTokenExpiresAt`, rotates
        `token`/`tokenIssuedAt`, and resets
        `failedLoginAttempts`/`lockUntil`; throws `400` ("Invalid or expired
        reset link") when no document matched.
      Done when: unit-level behavior is covered by the tests added in step 5;
      `npm test` passes.
- [x] 4. Wire `controllers/user.controller.js` (`requestPasswordReset`,
      `confirmPasswordReset`, both following the existing thin
      try/catch-then-`next` shape) and `routes/user.route.js`:
      `POST /users/reset/request` and `POST /users/reset/confirm`, both behind
      `authLimiter`, placed alongside the existing `/confirm` routes.
      Done when: routes are reachable and return the expected status codes for
      a manual/integration check; `npm test` passes.
- [x] 5. Add integration tests to `tests/user.test.js` (or a new
      `tests/passwordReset.test.js` if that keeps the file size reasonable),
      covering: successful request + confirm round-trip (new password logs
      in, old password no longer does), generic same-response for an unknown
      email, expired-token rejection, invalid-token rejection, old bearer
      token rejected after a successful reset, and Joi validation errors
      (missing email / short password). Update `README.md`'s API table and
      `RESEND_API_KEY`/`BACKEND_URL` description to mention the two new
      routes.
      Done when: `npm test` passes with the new tests included, and
      `npm run lint` / `npm run format:check` pass.

## Files / areas

- `models/User.js` - new `resetToken`/`resetTokenExpiresAt` fields
- `utils/constants.js` - new `RESET_TOKEN_TTL_MS`
- `utils/email.js` - new `sendPasswordResetEmail`
- `services/user.service.js` - new `requestPasswordReset`/`confirmPasswordReset`
- `controllers/user.controller.js` - new thin controller actions
- `routes/user.route.js` - two new rate-limited routes
- `tests/email.test.js` - new cases for the password-reset email
- `tests/user.test.js` or new `tests/passwordReset.test.js` - integration coverage
- `README.md` - API table + env var docs

## Data / contracts

- `User.resetToken: String, default: null`
- `User.resetTokenExpiresAt: Date, default: null`
- `POST /users/reset/request` - body `{ email }` -> `200 { message }` always
  (same message for known/unknown email)
- `POST /users/reset/confirm` - body `{ token, password }` -> `200 { message }`
  on success; `400` with a client-safe message for invalid/expired token or
  Joi validation failure
- On successful confirm: `hash` replaced, `resetToken`/`resetTokenExpiresAt`
  cleared, `token`/`tokenIssuedAt` rotated (old bearer token invalidated),
  `failedLoginAttempts` reset to 0, `lockUntil` cleared to `null`

## Testing

- `npm test` (Jest + Supertest + `mongodb-memory-server`) must pass, including
  new unit coverage for `sendPasswordResetEmail` and new integration coverage
  for both routes.
- `npm run lint` and `npm run format:check` must pass (CI gate).

## Notes for the AI

- Follow the confirmation-email flow's exact shape throughout (Joi schema
  style, `assertValid`, `uid2` token generation, lazy `Resend` client,
  fire-and-forget send, atomic `findOneAndUpdate` for the state-changing
  write, generic anti-enumeration response) rather than inventing a new
  pattern - this repo already has one, and it satisfies the same trust
  boundary (public unauthenticated input, account-existence disclosure).
- No em dashes in any generated content (docs, comments, commit messages).
- Do not add a "notify on password change" email, a reset-history log, or a
  configurable TTL - none are established requirements here.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":8579,"specSha256":"1cd2069234d845f6faeb6f7ce265078c26bd05f41054f98d7b152c3cf57592c4","branch":"refs/heads/feature/password-reset-via-email","head":"7d8fe1fe69442dc9043d4e757fcc27a5bd592247","baseRef":"refs/heads/master","baseCommit":"7d8fe1fe69442dc9043d4e757fcc27a5bd592247","sourceTree":"905336e2a815034a145354ffc41ca88a844fea9d","absentOptional":[]} -->
