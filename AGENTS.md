# Agent & Contributor Guidance: Roofing Construction Shop API

This document provides architectural context, commands, and operational boundaries for working on the Greenfield Roofing Construction Shop API.

---

## 1. Tech Stack & Environment

- **Runtime**: Node.js >= 22 (ESM only, `"type": "module"`)
- **Package Manager**: pnpm (>= 11)
- **Framework**: Express.js (v5) + TypeScript (strict mode: `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`)
- **Database**: Supabase / PostgreSQL (pg library for direct connections, `@supabase/supabase-js` service client for models)
- **Image Processing**: `sharp`, `blurhash`
- **Mail**: `nodemailer` (SMTP transport with exponential backoff and transactional outbox queue)
- **Testing**: Jest 30 (`@jest/globals`, `ts-jest` with ESM VM modules)

---

## 2. Directory Layout & Layer Boundaries

```
src/
├── app.ts                 # Express app creation & middleware setup
├── index.ts               # Server startup, graceful shutdown
├── config/                # Environment configuration, DB clients, database types
├── contracts/             # Zod schemas, contract DTOs, OpenAPI document builder
├── controllers/           # HTTP Request & Response handlers (input validation, status, response shaping)
├── lib/                   # Utilities (errors, logging, sessions, storage, image processing)
├── middlewares/           # Express middlewares (error handler, requireAuth, requireAdmin)
├── models/                # Database access layer (Postgres / Supabase queries)
├── providers/             # Mail provider (SMTP, email templates, outbox processor)
├── routes/                # Express router declarations and middleware binding
└── services/              # Domain logic orchestrators
```

### Architectural Invariants:
1. **Models Layer (`src/models/`)**: Interacts with database tables/views. Must never import `express`, `contracts`, `services`, or `controllers`.
2. **Services Layer (`src/services/`)**: Implements business rules and orchestrates models and providers. Must never import Express `Request`/`Response`, `express`, `routes`, or `controllers`.
3. **Controllers Layer (`src/controllers/`)**: Handles HTTP requests, validates contract inputs, and dispatches to services. Must never import `@supabase/supabase-js` or `../config/supabase`.
4. **Routes Layer (`src/routes/`)**: Mounts routes and middleware, binding route paths cleanly to controller methods. No inline handlers.
5. **Contracts (`src/contracts/`)**: Pure Zod schemas and OpenAPI document definitions.

---

## 3. Essential Commands

- `pnpm verify` — Run complete check suite: `tsc --noEmit`, `eslint .`, `jest unit`.
- `pnpm typecheck` — TypeScript strict typecheck (`tsc --noEmit`).
- `pnpm lint` — ESLint validation including layer boundary enforcement.
- `pnpm test` — Run all unit test suites.
- `pnpm test:integration` — Run integration tests against database.
- `pnpm openapi:generate` — Regenerate `openapi.json` from Zod contracts.
- `pnpm openapi:check` — Verify `openapi.json` matches contracts.

---

## 4. Key Security Conventions

- **Auth**: Google OAuth 2.0 with database-backed sessions (`sessions` table). Token hashes stored as SHA-256 with 7-day sliding expiration.
- **Admin Verification**: `requireAdmin` checks user role directly from database per-request to prevent stale privilege retention.
- **Transactional Outbox**: All customer/admin transactional emails are inserted into `email_outbox` in the same database transaction as the triggering action.
- **Money Handling**: Stored in whole Naira (`bigint` / number integers), zero fractional storage, formatted via `src/lib/money.ts`.

# Git Commit Rules
- When generating git commit messages or using the git commit tool, do NOT append any "Co-authored-by:" trailers, signatures, or third-party AI attributes (such as Claude). 
- Keep all commit titles and descriptions strictly limited to the actual technical code modifications.
