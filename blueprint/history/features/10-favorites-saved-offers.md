# Feature: Favorites / saved offers

**From build-plan:** feature 10
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/favorites-saved-offers`

## Goal

Let an authenticated user save and unsave offers as favorites, and view their
own saved list - the User<->Offer relation named in the build plan.

## In scope

- `favorites` field on `User`: an array of `Offer` ObjectIds, default `[]`.
- `POST /users/:id/favorites/:offerId` - self only, adds an offer to the
  caller's favorites. Idempotent (`$addToSet`): favoriting an already-favorited
  offer is a no-op, not an error. 404 if the offer doesn't exist.
- `DELETE /users/:id/favorites/:offerId` - self only, removes an offer from the
  caller's favorites. Idempotent (`$pull`): removing an offer that isn't
  currently favorited is a no-op, not an error.
- `GET /users/:id/favorites` - self only, returns the caller's favorited
  offers as full offer objects, same shape as other offer responses (reuses
  `toOfferDTO`).
- Referential integrity: deleting an offer (owner-initiated `DELETE
  /offers/:id`, or the cascade from account self-deletion) removes it from
  every user's `favorites` array, so the favorites list never returns or
  populates a stale reference.

## Out of scope

- Public visibility of another user's favorites - the list is self-only, like
  the other authenticated `/users/:id` routes.
- Pagination on the favorites list - a personal saved list has no established
  scale requirement, unlike the public `GET /offers` catalog.
- Surfacing "is this offer favorited by me" on `GET /offers` / `GET
  /offers/:id` - those routes are unauthenticated today; adding that would
  require optional auth, which isn't requested.
- Notifying a user when a favorited offer's price/status changes or it's
  removed - no notification mechanism exists in this backend.
- A separate `Favorite` collection - an embedded ObjectId array on `User` is
  the simplest shape that satisfies add/remove/list of one's own favorites;
  nothing today needs "who favorited this offer" queries at scale.

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json` (`feature`: one review packet after all steps).
Checkpoint commits are disabled in config, so none between steps. `/complete`
makes the final feature commit. Never accept a review packet you have not
read; split any diff that is too large to review.

## Build steps

- [x] **Step 1 - Add `favorites` to the User model and cascade cleanup on
  offer deletion** - add `favorites: { type: [{ type: Schema.Types.ObjectId,
  ref: 'Offer' }], default: [] }` to `models/User.js`. In
  `services/offer.service.js`, in `remove()` and `removeAllByOwner()`, after
  the offer(s) are deleted, pull the deleted offer id(s) from every user's
  `favorites` via `User.updateMany({ favorites: <id> }, { $pull: { favorites:
  <id> } })` (or `$in` for the multi-offer case in `removeAllByOwner()`).
  *Done when:* an offer favorited by user B is removed from B's `favorites`
  array once its owner deletes it (new test), and `npm test` still passes.
- [x] **Step 2 - Add/remove favorite endpoints** - add `POST` and `DELETE`
  `/users/:id/favorites/:offerId` in `routes/user.route.js` (both
  `isAuthenticated`), `addFavorite`/`removeFavorite` in
  `controllers/user.controller.js`, and matching functions in
  `services/user.service.js`: `assertIsSelf(data.params.id, data.user)`,
  validate `data.params.offerId` with `assertValidObjectId(..., OFFER)`, then
  `$addToSet`/`$pull` via `findByIdAndUpdateOrThrow`. `addFavorite` first
  checks the offer exists with `findByIdOrThrow(Offer, data.params.offerId,
  OFFER)` (404 if not). Return `{ favorites: updatedUser.favorites }` (raw
  ids) from both. *Done when:* favoriting twice leaves one entry, removing a
  non-favorited offer doesn't error, a non-existent offer id returns 404 on
  add, another user's id returns 403, no token returns 401, a malformed
  `offerId` returns 400, and `npm test` passes (new tests in
  `tests/user.test.js`).
- [x] **Step 3 - List favorites** - add `GET /users/:id/favorites` in
  `routes/user.route.js` (`isAuthenticated`), `getFavorites` in
  `controllers/user.controller.js` and `services/user.service.js`. Export
  `toOfferDTO` from `services/offer.service.js` and reuse it here. Fetch the
  user with `favorites` populated (nested populate on `owner` too, matching
  `offer.service.js`'s `populate`), map each populated offer through
  `toOfferDTO`, return `{ favorites: [...] }`. *Done when:* `GET
  /users/:id/favorites` returns the caller's favorited offers in the same
  shape as `GET /offers/:id`, excludes offers favorited by other users, is
  self-only (403/401 like the other cases), and `npm test` passes (new test in
  `tests/user.test.js`).

## Files / areas

- `models/User.js` - `favorites` field.
- `services/offer.service.js` - cascade cleanup in `remove()` and
  `removeAllByOwner()`; export `toOfferDTO`.
- `services/user.service.js` - `addFavorite`, `removeFavorite`,
  `getFavorites`.
- `controllers/user.controller.js` - matching controller functions.
- `routes/user.route.js` - the three new routes.
- `tests/user.test.js` - coverage for all three endpoints and the cascade.

## Data / contracts

- `User.favorites`: `[ObjectId]`, `ref: 'Offer'`, default `[]`. No schema-level
  uniqueness; de-duplication comes from `$addToSet` at write time.
- Trusted actor: the authenticated `req.user` from `isAuthenticated`, scoped to
  self via `assertIsSelf(data.params.id, data.user)` on all three routes -
  same pattern as the existing `PUT`/`PATCH`/`DELETE /users/:id`.
- Add/remove are idempotent by construction (`$addToSet` / `$pull`): no extra
  existence check is needed on remove, and add only checks the *offer's*
  existence (404), not whether it's already favorited.
- Referential integrity: an offer's id must not persist in any `favorites`
  array after that offer is deleted, by any deletion path (owner `DELETE
  /offers/:id` or the account-deletion cascade in `removeAllByOwner()`).
- Response shape: favorites list reuses the exact `toOfferDTO` shape already
  returned by `GET /offers/:id` etc., so no new offer representation is
  introduced.

## Testing

- `npm test` is the configured gate (Jest + Supertest, `mongodb-memory-server`);
  must pass before the feature is done.
- New assertions in `tests/user.test.js`:
  - `POST /users/:id/favorites/:offerId` adds the offer; a second call is a
    no-op (still one entry); non-existent offer id returns 404; another
    user's id returns 403; no token returns 401; malformed `offerId` returns
    400.
  - `DELETE /users/:id/favorites/:offerId` removes the offer; calling it again
    (or on a never-favorited offer) doesn't error.
  - `GET /users/:id/favorites` returns only the caller's favorited offers, in
    the same shape as `GET /offers/:id`; self-only enforcement (403/401).
  - Deleting an offer that's in another user's favorites removes it from that
    user's `favorites` array (covers the `remove()` cascade branch).

## Notes for the AI

- Mount favorites under `/users/:id/favorites[...]`, not `/offers/:id/...` -
  it's a self-scoped relation on the user, matching the existing
  `assertIsSelf` pattern already used for `PUT`/`PATCH`/`DELETE /users/:id`,
  not the owner-scoped pattern used for offer mutations.
- Reuse `assertValidObjectId`/`OFFER` (already imported in
  `services/user.service.js`) for the `offerId` param, and
  `findByIdOrThrow`/`findByIdAndUpdateOrThrow` from
  `utils/mongooseOrThrow.js`, matching existing conventions in both service
  files.
- `services/offer.service.js` requiring `models/User.js` for the cascade
  cleanup is a new (one-directional) dependency; `services/user.service.js`
  already requires `services/offer.service.js` for `removeAllByOwner`, so this
  doesn't create a cycle.
- No em dashes (U+2014) in code, comments, or commit messages - use a hyphen.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7941,"specSha256":"476b9926b32cb85f8aae83e8e0128c4f28e7fe61656099d86e686ff90342d27f","branch":"refs/heads/feature/favorites-saved-offers","head":"0b414542b63208a7ec6b8f377570c049606747ae","baseRef":"refs/heads/master","baseCommit":"0b414542b63208a7ec6b8f377570c049606747ae","sourceTree":"679f398fab8f8e45625013055ccfb0b16ec5527c","absentOptional":[]} -->
