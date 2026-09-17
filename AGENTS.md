# AGENTS.md

Instructions for AI coding agents working in this project.

AI tools must not add AI attribution to commits or pull requests, including AI
`Co-Authored-By` trailers or generated-by signatures. Preserve genuine human
attribution.

## What this is

Vinted Backend - a RESTful backend API for a Vinted-inspired second-hand
clothing marketplace: token-based authentication, listing (offer) management
with image upload, and search/filter with pagination. See `README.md` for the
full feature list, API reference, and setup instructions.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.

## Coding conventions

- Node.js, Express 5, CommonJS (`require`/`module.exports`)
- Layered architecture: `routes/` (wiring + middleware) -> `controllers/`
  (request/response, thin) -> `services/` (business logic) -> `models/`
  (Mongoose schemas)
- Joi validates and sanitizes input on every route before it reaches the database
- Centralized error handling: throw via `utils/throwError.js` with an HTTP
  status; the global handler in `app.js` returns a client-safe JSON `{ message }`
  and never leaks internals for unexpected errors
- Enforce ownership atomically with the write itself (single
  `findOneAndUpdate`/`findOneAndDelete` filtered by `{ _id, owner }`)
- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs. Use a hyphen for `term - description` separators instead.

## Commands

- Start: `npm start`
- Test: `npm test` (Jest + Supertest, `mongodb-memory-server`)
- Test (watch): `npm run test:watch`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Format (write): `npm run format`

Testing gate: `npm test` is configured and must pass before changes are
considered done. CI (`.github/workflows/ci.yml`) runs lint, format:check, and
test on every push/PR to `main`/`master`.
