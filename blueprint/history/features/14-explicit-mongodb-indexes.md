# Feature: Explicit MongoDB indexes

**From build-plan:** feature 14
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/explicit-mongodb-indexes`

## Goal

`GET /offers` (`services/offer.service.js:getAll`) always filters out sold
offers (`status: { $ne: 'sold' }`) before applying the optional title/price
filters, but only `price` has an explicit index today
(`models/Offer.js:41`). Add the remaining `schema.index()` declaration(s) for
the fields the codebase actually queries on, so the collection doesn't rely on
implicit/default indexing as offer volume grows.

## In scope

- An explicit index on `Offer.status`, the one filter field applied on every
  `GET /offers` call (unconditionally, via `status: { $ne: 'sold' }`) that
  currently has no index.
- A regression test asserting the expected indexes exist on the `Offer`
  collection.

## Out of scope

- Any index on `Offer.name` for the title filter: that filter is an
  unanchored, case-insensitive `RegExp` (`offer.service.js:386`), which
  MongoDB cannot use a standard B-tree index for. Adding one would be dead
  weight with no query it actually serves.
- Indexes on `Offer.details.*` (brand/size/color/condition/city): none of
  these are filterable or sortable today (`getAllQuerySchema` only accepts
  `title`, `priceMin`, `priceMax`, `page`, `sort`), so there's no query to
  support.
- Any index on `User` fields (email is already implicitly indexed via
  `unique: true`; the token fields queried in `user.service.js` - email,
  refreshToken, confirmationToken, resetToken - are point lookups for auth
  flows, not the search/filter/sort surface this feature targets).
- Changing the existing `price: 1` index or the query/filter logic itself.

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json` (currently `feature`: one review packet after all
steps). `workflow.checkpointCommits` is `disabled`, so no checkpoint commits
mid-build. `/complete` makes the final feature commit. Never accept a review
packet you have not read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Add the `status` index** - in `models/Offer.js`, add
      `offerSchema.index({ status: 1 })` next to the existing
      `offerSchema.index({ price: 1 })`, with a one-line comment mirroring the
      existing one explaining why (every `GET /offers` call filters on
      `status`). *Done when:* `npm run lint` and `npm run format:check` pass
      and the index declaration is present.
- [x] **Step 2 - Regression test for the indexes** - in `tests/offers.test.js`
      (or a new `tests/offerIndexes.test.js` if that reads cleaner), after the
      test DB connects, call `Offer.collection.getIndexes()` and assert both
      the `price_1` and `status_1` indexes are present (Mongoose builds
      declared indexes automatically on connect via the default `autoIndex`
      behavior already relied on by this project's models). *Done when:*
      `npm test` passes, including the new assertion, and fails if either
      index declaration is removed.

## Files / areas

- `models/Offer.js` - add the `status` index declaration.
- `tests/offers.test.js` (or a new small test file) - assert both indexes
  exist.

## Data / contracts

- No schema field, API shape, or response contract changes. This only adds a
  MongoDB index (`{ status: 1 }`) alongside the existing `{ price: 1 }` one;
  indexes are a storage/performance detail, not part of any persisted
  document shape or API contract.

## Testing

- `npm test` (Jest + Supertest, `mongodb-memory-server`) must pass, including
  the new index-existence assertion.
- `npm run lint` and `npm run format:check` must pass.
- No UI/browser evidence applies (backend-only, no observable behavior change
  for API consumers).

## Notes for the AI

- Match the existing single-field index style and inline comment convention
  already used for `price: 1` in `models/Offer.js:41` - don't introduce a
  compound index; there's no established query-performance measurement in
  this repo backing a specific compound shape, and a single extra field index
  is the smaller, reversible choice proportional to what's actually queried.
- Keep the existing `price: 1` index untouched.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4264,"specSha256":"162129b10ff5f7a79ad9e1ab86c0e6af3b832f3918795711b085b03d3e31b819","branch":"refs/heads/feature/explicit-mongodb-indexes","head":"338d8edf62166eed45bbc22a62b52dad37b9f096","baseRef":"refs/heads/master","baseCommit":"338d8edf62166eed45bbc22a62b52dad37b9f096","sourceTree":"57767acd4092f625576ed92bf24a525e8cfb5121","absentOptional":[]} -->
