# Feature: Offer status

**From build-plan:** feature 9
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/offer-status`

## Goal

Give offers a lifecycle (`available` / `reserved` / `sold`) so a seller can mark
an offer as no longer available, and so `GET /offers` stops surfacing sold
offers in the public listing.

## In scope

- `status` field on the `Offer` model: enum `available` / `reserved` / `sold`,
  default `available`.
- `GET /offers` excludes `status: 'sold'` offers unconditionally (no query
  override - not part of the established contract).
- Owner can change an offer's `status` through the existing partial-update
  route (`PATCH /offers/:id`), validated against the enum.
- `status` included in every offer response shape (publish, PUT, PATCH,
  GET all, GET one, DELETE).

## Out of scope

- A dedicated status-change endpoint (e.g. `POST /offers/:id/status`) - the
  existing owner-scoped `PATCH` route already covers this.
- A query param to include sold offers in `GET /offers` (e.g. `?status=sold`)
  - not requested by the plan or overview; can be added later if needed.
- Transition rules between statuses (e.g. blocking `sold` -> `available`) -
  not specified, any owner-initiated transition is allowed.
- Automatic status changes tied to a purchase/checkout flow - no payment
  integration exists in this backend.
- Requiring `status` on full replacement (`PUT /offers/:id`) - `PUT`'s
  `updateFields` never includes `status`, so a replace leaves the existing
  status untouched, consistent with how other unset fields already behave.

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json` (`feature`: one review packet after all steps).
Checkpoint commits are disabled in config, so none between steps. `/complete`
makes the final feature commit. Never accept a review packet you have not
read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Add `status` to the Offer model and DTO** - add `status`
  (String, enum `['available', 'reserved', 'sold']`, default `'available'`)
  to `models/Offer.js`, and include it in `toOfferDTO()` in
  `services/offer.service.js`. *Done when:* a newly published offer's JSON
  response includes `"status": "available"` and `npm test` still passes.
- [x] **Step 2 - Exclude sold offers from `GET /offers`** - in `getAll()`
  (`services/offer.service.js`), always add `status: { $ne: 'sold' }` to the
  `filters` object passed to `findAll`. *Done when:* an offer with
  `status: 'sold'` never appears in `GET /offers` results (new test in
  `tests/offers.test.js`), while `GET /offers/:id` still returns it directly.
- [x] **Step 3 - Allow the owner to change `status` via `PATCH`** - add
  `status: Joi.string().valid('available', 'reserved', 'sold')` to
  `offerBodyPartialSchema`, and apply `data.body.status` to `updateFields` in
  `updatePartial()` the same way the other optional top-level fields are
  applied. *Done when:* `PATCH /offers/:id` with `{ status: 'sold' }` updates
  the offer for its owner, a non-owner/non-existent id still returns 404, an
  invalid status value returns 400, and `npm test` passes (new tests in
  `tests/offers.test.js`).

## Files / areas

- `models/Offer.js` - add the `status` field.
- `services/offer.service.js` - `toOfferDTO()`, `getAll()` filters,
  `offerBodyPartialSchema`, `updatePartial()`.
- `tests/offers.test.js` - coverage for the default status, the `GET /offers`
  exclusion, and the `PATCH` status update (valid and invalid values).

## Data / contracts

- `Offer.status`: String enum `available` / `reserved` / `sold`, default
  `available`. Existing documents created before this migration have no
  `status` field in the database; Mongoose applies the schema default
  (`available`) when they're read, so no backfill is needed.
- `GET /offers` response contract change: sold offers are always excluded,
  regardless of other filters - this changes the public listing contract, per
  `project-overview.md`.
- `GET /offers/:id` is unaffected: a sold offer remains directly reachable by
  id (matches today's behavior, where `getOne` applies no status filtering).
- `PATCH /offers/:id` gains an optional `status` field, validated against the
  enum; ownership is enforced by the existing `{ _id, owner }`-scoped
  `findByIdAndUpdateOrThrow` (unchanged: the read used to build `updateFields`
  is already scoped to `{ _id: data.params.id, owner: data.user._id }` via
  `offerToUpdate`, and `findByIdAndUpdateOrThrow` performs the actual write -
  no change to that ownership path is needed since `status` follows the same
  `updateFields` mechanism as every other partial field).
- `PUT /offers/:id` (`offerBodySchema`) is unchanged: `status` is not part of
  its `updateFields`, so a full replace preserves the offer's current status.

## Testing

- `npm test` is the configured gate (Jest + Supertest, `mongodb-memory-server`);
  must pass before the feature is done.
- New assertions in `tests/offers.test.js`:
  - `POST /offers/publish` response includes `status: 'available'` by default.
  - `GET /offers` excludes an offer whose status was set to `sold`.
  - `PATCH /offers/:id` with a valid `status` updates it and is reflected in
    the response.
  - `PATCH /offers/:id` with an invalid `status` value returns 400.

## Notes for the AI

- Match the existing pattern in `updatePartial()`: only set `updateFields.status`
  when `data.body.status !== undefined`, exactly like `title`/`description`/`price`.
- `findAll()` in `utils/mongooseOrThrow.js` takes a plain `filters` object
  already merged by the caller - add the sold exclusion into the same
  `filters` object built in `getAll()`, no signature change needed.
- No em dashes (U+2014) in code, comments, or commit messages - use a hyphen.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":5818,"specSha256":"4ac5714c070ed1abdb3dfca2308bcf20c4c75a0bbd042ecd9f9898ed46335bc1","branch":"refs/heads/feature/offer-status","head":"042542666588af5a76842b29c777f45cdb3d5d79","baseRef":"refs/heads/master","baseCommit":"042542666588af5a76842b29c777f45cdb3d5d79","sourceTree":"5def3ec4c5ad6656d8f9800ed01dbabe1741809b","absentOptional":[]} -->

## Findings

### 9/F-02 [P3] accepted - Legacy documents without a stored `status` field have no test proving the default applies

**File:** models/Offer.js:29-33
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** The spec explicitly relies on Mongoose applying the
schema default (`available`) when reading a pre-existing document that has no
`status` key stored at all ("no backfill is needed"). This is standard
Mongoose behavior (defaults apply on document hydration regardless of
whether the path exists in the stored BSON), so it is very likely correct, but
every test offer in this suite is created through `POST /offers/publish`,
which always writes `status` explicitly (via the schema default at
insert time) - there is no test inserting a raw document with the field
omitted and reading it back, so this specific "old data, no migration"
contract is unverified by the suite.
**Suggested fix:** Add one small test that inserts an offer directly via
`Offer.collection.insertOne(...)` (bypassing Mongoose, so no default is
applied at write time) without a `status` field, then asserts `GET
/offers/:id` (or `Offer.findById` and `.status`) returns `'available'`.
**Resolution:** Accepted by the user (2026-09-17): the project starts from a
clean database and Cloudinary account, and both will be wiped before the
first live release - there is no pre-existing "legacy document" scenario to
migrate or protect against, so this coverage gap is not worth closing. See
the note in `blueprint/context/project-overview.md` under Deployment.
