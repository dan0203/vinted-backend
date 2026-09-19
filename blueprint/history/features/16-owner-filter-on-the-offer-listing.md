# Feature: Owner filter on the offer listing

**From build-plan:** feature 16
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/owner-filter-on-the-offer-listing`

## Goal

`GET /offers` can only list the whole catalog. Showing one seller's listings,
which a seller profile needs, has no server support today.

Add a public `owner` query parameter to the existing listing route. Reusing
`GET /offers` keeps pagination, sorting, the price and title filters, and the
sold-offer exclusion in one place instead of duplicating them in a second
endpoint.

## In scope

- `services/offer.service.js` `getAllQuerySchema`: accept `owner`, validated
  with the existing `joiObjectId()` helper, so a malformed id is rejected before
  it reaches the database.
- `services/offer.service.js` `getAll`: when `query.owner` is present, add it to
  the `filters` object built for the listing query, alongside the existing
  status, title and price filters.
- `models/Offer.js`: declare `offerSchema.index({ owner: 1 })`, since `owner`
  becomes a field the listing filters on (feature 14's contract).
- `routes/offer.route.js`: document the `owner` query parameter in the
  `GET /offers` OpenAPI block and adjust the route description.
- `tests/offers.test.js`: route-level coverage for the filter alone, the filter
  combined with another filter, an unknown id, a malformed id, and the sold
  exclusion under an owner-filtered listing.
- `README.md` and `README.fr.md`: the `GET /offers` row of the endpoint table.

## Out of scope

- Any authentication or ownership restriction on the parameter. It is public by
  design: a seller's listings are already reachable through the public
  `GET /offers` and `GET /users/:id`, and the listing populates only
  `_id account` from the owner, so no new data is exposed.
- Any existence check on the owner id. An unknown but well-formed id returns an
  empty page, exactly like a price range that matches nothing.
- A separate seller-listings endpoint.
- A compound index. The file's existing pattern is one single-field index per
  filtered field (`price`, `status`), and nothing establishes a need to depart
  from it.
- Any change to the sold-offer exclusion, which stays a locked contract.

## Build loop

`workflow.stepReview` is `feature`: implement the steps in order and present the
whole feature for review at the end, not step by step.
`workflow.checkpointCommits` is `disabled`, so make no intermediate commits.
`/complete` creates the final feature commit. `npm test` must be green at the end
of every step.

**The code for this feature is already written in the working tree**, carried
over from ad-hoc work that predates this spec. It has been reviewed by `/audit`
(findings F-04 and F-05, both repaired and closed) and the suite is green at 178
tests in 7 suites. `/implement` should therefore verify each `Done when` below
against what is on disk and check the step off, not rewrite working code. If a
`Done when` does not match reality, the spec is wrong and must be corrected
before the step is checked.

## Build steps

- [x] 1. **Accept and apply the `owner` query parameter.** In
  `services/offer.service.js`, add `owner: joiObjectId()` to `getAllQuerySchema`
  and, in `getAll`, set `filters.owner` from `query.owner` when it is present,
  before the title and price filters are applied.
  **Done when:** `GET /offers?owner=<valid id>` returns only that owner's
  non-sold offers, `?owner=not-an-id` returns `400`, a well-formed unknown id
  returns `200` with `count` 0, and a request with no `owner` parameter behaves
  exactly as before.

- [x] 2. **Index the filtered field.** Add `offerSchema.index({ owner: 1 })` to
  `models/Offer.js`, beside the existing `price` and `status` indexes, with a
  one-line comment saying why it exists.
  **Done when:** the declaration sits next to the other two, follows the same
  single-field form, and `npm test` stays green.

- [x] 3. **Cover the parameter at the route level.** In `tests/offers.test.js`,
  add Supertest coverage for: the filter alone, the filter combined with
  `priceMin`, an unknown but well-formed id, a malformed id, and a sold offer
  excluded from an owner-filtered listing.
  **Done when:** `npm test` is green and the combination test is discriminating,
  meaning both bounds are load bearing: an offer above the price floor exists for
  two different sellers, so dropping either the owner filter or the price filter
  changes the expected count. A combination test that would still pass with the
  owner filter removed does not satisfy this step.

- [x] 4. **Document the parameter.** In `routes/offer.route.js`, add `owner` to
  the `GET /offers` OpenAPI parameters with a description saying it is public and
  combinable with the other filters, and adjust the route description so it
  states that sold offers stay excluded when filtering by owner. Update the
  `GET /offers` row of the endpoint table in `README.md` and `README.fr.md`.
  **Done when:** the served `/api-docs.json` lists `owner` among the
  `GET /offers` parameters, both READMEs mention it in the query-param list, and
  `npm run format:check` passes.

## Files / areas

- `services/offer.service.js` - `getAllQuerySchema` (line ~62) and `getAll`
  (line ~381), plus the existing `joiObjectId` import and the `populate`
  projection that limits the owner to `_id account`
- `models/Offer.js` - index declarations (lines ~41-47)
- `routes/offer.route.js` - the `GET /offers` OpenAPI block (line ~59)
- `tests/offers.test.js` - the `GET /offers` describe block
- `README.md`, `README.fr.md` - endpoint table, `GET /offers` row

## Data / contracts

- No schema change. `Offer.owner` already exists as a required `ObjectId` ref to
  `User`; this feature only filters on it and indexes it.
- Query parameter: `owner`, an ObjectId string. Validation goes through the
  shared `joiObjectId()` helper, so the contract matches every other id the API
  accepts.
- `400` on a malformed id, with the standard `{ message }` error shape from the
  global handler. Joi rejects a non-string value too, so bracket syntax such as
  `?owner[$ne]=x` is refused before any query is built.
- `200` with `count` 0 and an empty `offers` array for a well-formed id that
  matches nothing. No `404`: an unknown owner is not an error.
- The sold-offer exclusion still applies. `filters` starts as
  `{ status: { $ne: 'sold' } }` and the owner filter is added to it, never
  replacing it.
- `count` is computed from the same `filters` as the page itself, so pagination
  totals stay correct under the owner filter.
- Response shape is unchanged: `{ count, page, totalPages, offers }`, each offer
  populated with `_id account` for its owner and nothing else.

## Testing

`npm test` (Jest + Supertest with `mongodb-memory-server`) is the gate, per
`AGENTS.md`. No browser coverage: this is an API-only backend.

Route-level coverage in `tests/offers.test.js`, driving real HTTP:

- filter alone: a second seller publishes one offer, `?owner=<second seller>`
  returns exactly that offer with the matching owner id
- combined with `priceMin`: discriminating as described in step 3
- unknown but well-formed id: `200`, `count` 0, empty `offers`
- malformed id: `400`
- sold exclusion: an owner's only offer marked `sold` disappears from
  `?owner=<that owner>`

## Notes for the AI

- Proportional engineering: no new dependency, no new route, no new model field,
  no configuration surface. One validated query parameter, one filter line, one
  index.
- Reuse `joiObjectId()` rather than writing a new id check; it is already used by
  `assertValidOfferId` in the same file.
- Do not add an existence lookup for the owner id. It would cost a query and turn
  an empty result into a `404`, which contradicts how every other filter on this
  route behaves.
- Writing standard: no em dashes anywhere, including the README rows and the
  OpenAPI description. Use a hyphen for `term - description`.
- The endpoint tables in both READMEs are column-aligned and Prettier checks
  them. Keep the replacement cell within the existing column width so the whole
  table is not realigned.
- `blueprint/` is gitignored in this repo, so this spec and the build-plan line
  will not appear in `git status`. That is expected.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":8283,"specSha256":"dd26aafe8161dc964927671d5a167d4d3388374e68c69c90cb72484c08d515c0","branch":"refs/heads/feature/owner-filter-on-the-offer-listing","head":"273a6e437cedf61cec50f1c46ef3e4f8d8cc8060","baseRef":"refs/heads/master","baseCommit":"273a6e437cedf61cec50f1c46ef3e4f8d8cc8060","sourceTree":"67f2d328e7e8c5c6ebae29f791874e3c5aeac622","absentOptional":[]} -->

## Findings

### 16/F-04 [P2] closed - New owner filter on GET /offers queries an unindexed field

**File:** services/offer.service.js:390
**Found:** 2026-09-19 by /audit (scope: current; lens: performance)
**Why it matters:** This belongs to the unrelated in-progress `owner` filter work sharing the
working tree, not to feature 15. `getAll` now builds `filters.owner` from a query parameter, but
`models/Offer.js` declares explicit indexes only on `price` (line 41) and `status` (line 44).
Feature 14's stated contract is `schema.index()` declarations for the fields actually used in
search/filter/sort, and `owner` is now such a field. An owner-filtered listing falls back to a
collection scan, which is invisible at dev-seed size (107 offers) and degrades linearly with the
collection.
**Suggested fix:** Add `offerSchema.index({ owner: 1 })` in `models/Offer.js` beside the existing
two. Unverified at runtime: no profiling or `explain()` output was collected, the finding rests on
the absent index declaration and the new query path.
**Resolution:** 2026-09-20: added `offerSchema.index({ owner: 1 })` in models/Offer.js:47, beside the
existing price and status indexes and with the same one-line rationale. `npm test` 178/178, lint and
format:check clean.
Re-reviewed 2026-09-20 by /audit (scope: changed; lens: performance): models/Offer.js:46-47 declares
the index beside the price and status ones, matching the file's existing single-field pattern, and
`getAll` builds `filters.owner` on the same path that now has it. No new defect introduced. Closed.

### 16/F-05 [P2] closed - The owner-filter combination test cannot fail for the right reason

**File:** tests/offers.test.js:414
**Found:** 2026-09-19 by /audit (scope: current; lens: tests)
**Why it matters:** Belongs to the unrelated in-progress `owner` filter work, not to feature 15.
`combines the owner filter with the other filters` requests `?owner=<id>&priceMin=100` and asserts
`count` is 0. The `GET /offers` fixture seeds a single offer priced 25 (tests/offers.test.js:301),
so `priceMin=100` alone already returns 0. Deleting the owner filter from `getAll` entirely would
leave this test green, which means it proves nothing about combination. The swagger description
added in this same work explicitly advertises the parameter as "combinable with the other filters"
(routes/offer.route.js:79), so the one test covering that contract gives false confidence.
**Suggested fix:** Make the assertion positive: seed a second offer for the same owner above the
price floor and assert that the combined query returns exactly that one, or assert a non-zero count
with a discriminating price bound.
**Resolution:** 2026-09-20: the test now publishes an offer above the price floor for each of two
sellers, so the fixture offer (25) is excluded by the price bound and the second seller's offer by
the owner bound, leaving exactly one expected result. Proven discriminating by disabling the owner
filter in services/offer.service.js and re-running it: the test failed with `Expected: 1,
Received: 2`, then passed again once the filter was restored.
Re-reviewed 2026-09-20 by /audit (scope: changed; lens: tests): the assertion set is positive
(count, name and owner id), both bounds are load bearing, and the disable/restore experiment was
reproduced this pass. No new defect introduced in tests/offers.test.js. Closed.
