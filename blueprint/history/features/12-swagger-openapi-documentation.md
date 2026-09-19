# Feature: Swagger / OpenAPI documentation

**From build-plan:** feature 12
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/swagger-openapi-documentation`

## Goal

Generate interactive OpenAPI 3.0 API docs from the existing routes so a
reviewer or frontend developer can explore and try every endpoint without
reading the source. This is the next planned feature (highest effort/impact
ratio per the overview) and touches no existing route behavior.

## In scope

- `swagger-jsdoc` (builds an OpenAPI 3.0 document from JSDoc `@openapi`
  comment blocks) and `swagger-ui-express` (serves the interactive UI) as new
  dependencies - the standard pairing for documenting an existing Express app
  without rewriting routes.
- A `config/swagger.js` module: OpenAPI `info` (title, version from
  `package.json`, description), a single `servers` entry (`{ url: '/' }` so
  the UI works against whatever origin it's loaded from, no new env var), a
  `bearerAuth` HTTP security scheme (matches the existing opaque
  `Authorization: Bearer <token>` auth), and shared component schemas for the
  response shapes reused across routes (`User` public profile, `Offer`,
  `Image`, `Error`).
- Two new read-only, unauthenticated routes mounted in `app.js`, matching the
  existing "read/signup endpoints are public" usage model:
  - `GET /api-docs` - the Swagger UI page.
  - `GET /api-docs.json` - the raw generated OpenAPI document.
- `@openapi` JSDoc blocks on every existing route in `routes/user.route.js`
  and `routes/offer.route.js`, documenting exactly the contract already in
  `README.md`'s API reference table: method, path, auth requirement,
  request body/query/params (including the `multipart/form-data` shape for
  `publish`/`PUT`/`PATCH` with files), and the response status codes and
  shapes each controller actually returns (see Data / contracts).
- A short "API docs" pointer added to the README's API reference section
  linking to `/api-docs`.

## Out of scope

- Changing any existing route's request/response behavior, status codes, or
  validation - this feature only describes the current contract, it doesn't
  alter it.
- Feature 13 (JWT + refresh cookie) and feature 14 (explicit indexes) -
  separate planned features, not touched here.
- Auth-gating the docs routes themselves - the API surface they describe is
  already fully public via `README.md`, so there is no new information
  disclosure to protect against.
- Generating docs from the Joi schemas programmatically (e.g.
  `joi-to-swagger`) - the existing schemas are inline in the services, not a
  separate reusable module, so hand-written JSDoc per route is the smaller
  reversible option and keeps the docs colocated with the routes they
  describe.

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json` (`feature`: one review packet after all steps).
`workflow.checkpointCommits` is `disabled`, so no checkpoint commits between
steps. `/complete` makes the final feature commit.

## Build steps

- [x] **Step 1 - Wire up swagger-jsdoc and swagger-ui-express** - add both
  packages to `package.json`; create `config/swagger.js` exporting the
  generated OpenAPI document (`info`, `servers`, `components.securitySchemes.bearerAuth`,
  shared `components.schemas` for `User`, `Offer`, `Image`, `Error`, sourced
  from `swagger-jsdoc` scanning `routes/*.route.js`); mount
  `GET /api-docs` (`swaggerUi.serve` + `swaggerUi.setup`) and
  `GET /api-docs.json` in `app.js`, both before the catch-all 404 handler.
  *Done when:* `npm start` boots without error, `GET /api-docs/` returns `200`
  with an HTML UI page (`GET /api-docs` without the trailing slash 301s
  there, standard `swagger-ui-express`/`express.static` behavior since the
  page's asset references are relative), and `GET /api-docs.json` returns `200` with a JSON
  body whose `openapi` field starts with `3.`.
- [x] **Step 2 - Document the user routes** - add an `@openapi` block above
  each route in `routes/user.route.js` (signup, login, confirm, resend, reset
  request/confirm, getOne, update, updatePartial, remove, favorites
  get/add/remove), matching the method, auth, body/params, and status
  codes/response shapes from `README.md`'s API table and
  `controllers/user.controller.js`. *Done when:* `GET /api-docs.json` lists
  every `/users/*` path with the correct methods, and `npm run lint` /
  `npm run format:check` pass.
- [x] **Step 3 - Document the offer routes** - add an `@openapi` block above
  each route in `routes/offer.route.js` (publish, getAll with its query
  params, getOne, update, updatePartial, remove), including the
  `multipart/form-data` request body shape for `publish`/`PUT`/`PATCH`.
  *Done when:* `GET /api-docs.json` lists every `/offers/*` path with the
  correct methods and query parameters, and `npm run lint` /
  `npm run format:check` pass.
- [x] **Step 4 - Test, link from README, and verify** - add
  `tests/docs.test.js` asserting `GET /api-docs.json` returns `200`, a valid
  `openapi: "3.x"` document, and that it lists the full set of documented
  paths (`/users/signup`, `/users/login`, `/offers`, `/offers/publish`,
  etc.); add a one-line "interactive docs at `/api-docs`" pointer to the
  README's API reference section. *Done when:* `npm test`, `npm run lint`,
  and `npm run format:check` all pass.

## Files / areas

- `package.json` / `package-lock.json` - add `swagger-jsdoc`,
  `swagger-ui-express`.
- `config/swagger.js` - new: OpenAPI document definition and generation.
- `app.js` - mount `GET /api-docs` and `GET /api-docs.json`.
- `routes/user.route.js`, `routes/offer.route.js` - add `@openapi` JSDoc
  blocks above each route (no behavior change).
- `tests/docs.test.js` - new.
- `README.md` - one-line addition to the API reference section.

## Data / contracts

- No persisted-data or schema changes; this feature only describes the
  existing HTTP contract.
- `GET /api-docs.json` response: a standard OpenAPI 3.0 JSON document
  (`openapi`, `info`, `servers`, `paths`, `components`). Generated at
  `config/swagger.js` module load from the `@openapi` JSDoc comments via
  `swagger-jsdoc` - no caching/regeneration concern since it's produced once
  at process start, same lifecycle as any other `require`d module.
- `GET /api-docs`: HTML page served by `swagger-ui-express`, no JSON contract.
- Documented request/response shapes must exactly match what
  `controllers/user.controller.js` / `controllers/offer.controller.js` and
  their services actually do today (status codes, `{ message }` error shape
  from `utils/throwError.js`, the `count`/`page`/`totalPages`/`offers` search
  response, etc.) - the source of truth is the code and `README.md`'s
  existing API table, not a rewritten contract.
- Both new routes are public/unauthenticated, consistent with the existing
  "read endpoints are public" usage model; they expose only route shapes
  already public in `README.md`, no secrets or internals.

## Testing

- `npm test` (Jest + Supertest) gates completion, per `AGENTS.md` and
  `coding-standards.md`.
- New `tests/docs.test.js`: Supertest request to `GET /api-docs.json`
  asserting `200`, `openapi` starts with `3.`, and `paths` contains the key
  documented routes for both `users` and `offers` groups.
- No browser test command is configured; verify `GET /api-docs` manually
  (or via a Supertest smoke assertion that it returns `200` with an
  `text/html` content type) rather than claiming visual verification.
- `npm run lint` and `npm run format:check` must pass (CI gate) after each
  step that touches route files.

## Notes for the AI

- Keep the JSDoc-per-route pattern colocated in `routes/*.route.js` right
  above each `router.<method>(...)` call - do not create a separate
  `docs/` or `schemas/` directory for this; there's no existing precedent
  for splitting route wiring from its documentation in this codebase.
- Reuse `package.json`'s `name`/`version`/`description` for the OpenAPI
  `info` block instead of hardcoding them.
- Match the existing ownership semantics in the docs: offer ownership
  mismatches document `404`, user account ownership mismatches document
  `403` (see `coding-standards.md` - Auth & ownership).
- Do not add authentication to `/api-docs`/`/api-docs.json` themselves - the
  API they describe is already fully public via `README.md`.
- No em dashes in any generated content (route comments, README addition,
  commit messages).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":8472,"specSha256":"a2aad09d634cbcdefe8a606e9bd36a447057e13b08ed60b1b51ad52133949e0e","branch":"refs/heads/feature/swagger-openapi-documentation","head":"7c918cb83e4f82b5f37d1ad07cbdf6573fa32a19","baseRef":"refs/heads/master","baseCommit":"7c918cb83e4f82b5f37d1ad07cbdf6573fa32a19","sourceTree":"68836dae18627935bf8ddba89bb8c0b1cb5da7a8","absentOptional":[]} -->

## Findings

### 12/F-01 [P2] closed - PUT full replace preserving `status` has no regression test

**File:** tests/offers.test.js:445
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** The spec's Data/contracts section states `PUT /offers/:id`
must leave the offer's current `status` untouched, since `offerBodySchema`'s
`updateFields` (services/offer.service.js:212-219) never sets `status`. That's
correct today (`update()` returns
`toOfferDTO({ ...offerBeforeUpdate.toObject(), ...updateFields })`, and the
spread preserves the pre-update `status`), but nothing exercises it: the
`'fully replaces the offer'` test (tests/offers.test.js:445) never sets a
non-default status beforehand or asserts `response.body.status` afterward. A
later change to `updateFields` (e.g. someone adding `status: undefined` or
reordering the spread) could silently reset every offer to `available` on its
next edit with no test catching it.
**Suggested fix:** In the existing `'fully replaces the offer'` test, set the
offer's status to `'reserved'` (e.g. via `Offer.findByIdAndUpdate`, as the new
`GET /offers` exclusion test already does at tests/offers.test.js:313) before
the `PUT`, then assert `response.body.status` is still `'reserved'` after.
**Resolution:** Fixed in `tests/offers.test.js` - the test (renamed `'fully
replaces the offer, leaving its status untouched'`) now sets the offer to
`'reserved'` before the `PUT` and asserts `response.body.status` is still
`'reserved'` after. `npm test` passes (36/36 in `tests/offers.test.js`). Not
yet re-reviewed by a fresh `/audit` pass.

### 12/F-02 [P2] closed - Offer-deletion favorites cascade isn't fault-isolated, so a failed cascade write skips Cloudinary cleanup and can leave a dangling favorite

**File:** services/offer.service.js:357-360 (also removeAllByOwner:431-435)
**Found:** 2026-09-17 by /audit (scope: current; lens: quality, security)
**Why it matters:** `remove()` now does
`await User.updateMany({ favorites: removedOffer._id }, { $pull: ... })`
between the atomic offer delete and `await cleanupOfferImages(removedOffer)`
(same pattern in `removeAllByOwner()`, before `Promise.all(offers.map(cleanupOfferImages))`).
Unlike every other cleanup step here, this call isn't wrapped in the
codebase's "best effort, non-blocking" pattern (`safeRemoveImage`/`safeDeleteFolder`
internally catch and log). If this `updateMany` throws (e.g. a transient Mongo
error), the offer document is already deleted, but the function throws before
`cleanupOfferImages` runs - `coding-standards.md`'s "Delete the corresponding
Cloudinary assets whenever the owning offer/user is deleted" is violated for
that request, and the same failure leaves the deleted offer's id sitting in
some user's `favorites` array (the exact dangling reference the feature's
"Data / contracts" section says must never happen). Low likelihood (requires
a DB failure on a simple update right after the delete already succeeded), but
concrete and currently unguarded.
**Suggested fix:** Wrap the two `User.updateMany` cascade calls the same way
image cleanup already is - catch and log (console.error) rather than letting
the exception propagate, so a cascade failure can't block Cloudinary cleanup
or the response. A small `safeRemoveFavorites`-style helper alongside
`safeRemoveImage`/`safeDeleteFolder` in `utils/cloudinaryCleanup.js` (or an
inline try/catch) would match the existing idiom. No feature behavior is
lost: the happy path is unchanged, only the failure path stops silently
skipping cleanup.
**Resolution:** Fixed - added `safeRemoveFavorites()` in
`services/offer.service.js` (mirrors `safeRemoveImage`/`safeDeleteFolder`'s
catch-and-log pattern), used by both `remove()` and `removeAllByOwner()`
instead of the raw `User.updateMany` call. New test in `tests/user.test.js`
(`'still deletes the offer and cleans up its images if the favorites cascade
fails'`) mocks `User.updateMany` to reject and asserts the offer delete still
returns 200 and Cloudinary cleanup still runs. `npm test` passes (97/97).
Re-reviewed 2026-09-17 by `/audit full`: `safeRemoveFavorites()` is still
present and used by both `remove()` and `removeAllByOwner()`. Closed.

### 12/F-03 [P3] closed - `getFavorites()` has no defense against a populated favorite whose offer no longer exists

**File:** services/user.service.js:389-397
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** `user.favorites.map(offerService.toOfferDTO)` assumes
every populated entry is a real offer. Mongoose's populate leaves `null` in
an array-of-refs position when the referenced document no longer exists, and
`toOfferDTO(null)` throws (`Cannot read properties of null`), turning a single
stale reference into a 500 for the whole endpoint instead of just omitting
that entry. Today this isn't reachable through the app's own code (both
deletion paths are patched to pull the reference first, see F-02), but it's
the only defense-in-depth layer this feature has - if F-02's cascade ever
fails, or a future change deletes an `Offer` document by another path (the
codebase already has one precedent: `data/seed.js` calls
`Offer.deleteMany({})` directly, bypassing `offer.service.js` entirely, though
it also wipes `User` so no dangling reference survives it today), the list
endpoint breaks completely rather than degrading.
**Suggested fix:** Filter out falsy entries before mapping:
`user.favorites.filter(Boolean).map(offerService.toOfferDTO)`. No behavior
change for the current happy path; only changes what happens when the
referential-integrity guarantee is already broken.
**Resolution:** Fixed - `getFavorites()` in `services/user.service.js` now
filters with `.filter(Boolean)` before mapping to `toOfferDTO`. New test in
`tests/user.test.js` (`'omits a favorite whose offer no longer exists instead
of crashing'`) deletes the favorited offer directly (bypassing the cascade)
and asserts the list endpoint still returns 200 with the stale entry omitted.
`npm test` passes (97/97). Re-reviewed 2026-09-17 by `/audit full`:
`getFavorites()` still filters with `.filter(Boolean)` before mapping. Closed.

### 12/F-04 [P3] closed - `confirmPasswordReset` hashes the new password before checking whether the reset token is even valid

**File:** services/user.service.js:280-284
**Found:** 2026-09-17 by /audit (scope: current; lens: performance)
**Why it matters:** `confirmPasswordReset` runs `bcrypt.hash(data.password, 10)`
unconditionally, before the `findOneAndUpdate` that actually checks
`resetToken`/`resetTokenExpiresAt`. Every request with an unknown or expired
token (Joi already requires a syntactically valid body, so this includes any
guessed/replayed token) still pays a full ~10-round bcrypt hash before being
told `400`. `authLimiter` bounds this to 20 requests/15min per IP today, so
the added cost is small in absolute terms, but it's wasted work on a path
that's already going to reject the request, and every other token-checked
mutation in this file (`confirmEmail`) validates the token via the query
itself with no wasted precomputation.
**Suggested fix:** Only if this is worth the extra complexity: look up the
user by `resetToken`/`resetTokenExpiresAt` first (read), hash the password
only when a match exists, then apply the update filtered by `_id` (or repeat
the token filter to stay race-safe). No behavior is lost either way - this is
a minor efficiency note, not a correctness issue.
**Resolution:** Fixed - `confirmPasswordReset` now does a `findOne` on the
token/expiry filter first and throws the same 400 before hashing anything;
the password is only hashed once a live token is confirmed. The final
`findOneAndUpdate` still filters on the token itself (not just `_id`), so a
second request racing on an already-consumed token still gets the 400
instead of a second successful reset. `npm test` passes (107/107). Re-reviewed
2026-09-17 by `/audit full`: the `findOne` pre-check before hashing is still
in place. Closed.

### 12/F-05 [P3] closed - `confirmPasswordReset`'s `findOneAndUpdate` skips this codebase's usual `returnDocument`/`runValidators` options

**File:** services/user.service.js:286-301
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** Every other state-changing `findOneAndUpdate` in this file
passes explicit options - `confirmEmail` uses `{ returnDocument: 'after' }`,
and `applyUserUpdate`/`addFavorite`/`removeFavorite` share the module-level
`updateOptions = { returnDocument: 'after', runValidators: true }`.
`confirmPasswordReset`'s call passes no options at all, so it silently
returns the pre-update document (harmless today - the result is only used
for a truthy check) and skips schema validators on the update payload. It
works now because every field written here is either server-generated
(`uid2`, `Date.now()`, `0`, `null`) or already Joi/bcrypt-validated, but it's
a drift from the file's own convention that the next person to extend this
function could easily copy.
**Suggested fix:** Pass `{ returnDocument: 'after', runValidators: true }`
(the existing `updateOptions` constant already defined in this file) for
consistency. No behavior change expected.
**Resolution:** Fixed - `confirmPasswordReset`'s `findOneAndUpdate` now passes
the existing `updateOptions` constant, matching `confirmEmail` and the other
writes in this file. `npm test` passes (107/107). Re-reviewed 2026-09-17 by
`/audit full`: the call still passes `updateOptions`. Closed.
