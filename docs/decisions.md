# Architectural & Design Decisions

This document records the design decisions, deviation rationales, and architectural constraints implemented across the Greenfield API rebuild.

---

## 1. §0 Deviations & Greenfield Rebuild Rationale

* **Standalone Express.js (v5) + TypeScript Architecture**:
  The backend is structured as an independent Node.js API with strict separation of layers (`contracts`, `routes`, `middlewares`, `services`, `models`, `providers`, `lib`). It does not bundle frontend dependencies (`next`, `react`, `tailwind`, `clsx`).

* **Single Source of Truth Contracts & OpenAPI Generation**:
  All schemas and contracts are defined with Zod (`zod-openapi`). The committed `openapi.json` document is generated directly from these schemas via `pnpm openapi:generate` and verified in CI via `pnpm openapi:check`.

---

## 2. Calls & Structural Trade-offs

### 2.1 Table Retention: `inventory` and `addresses`
* **Decision**: Kept in the database schema per `notes.md §1`.
* **Rationale**: While `product_variants.stock_quantity` is the authoritative source for real-time inventory checks and atomic decrementing via `decrement_variant_inventory()`, the `inventory` table is retained for historical tracking and audit consistency. `addresses` table remains reserved for multi-address expansion.

### 2.2 Image Domain Reorganization & Deprecation Window Removal
* **Decision**: Direct transition to `product_images` and `category_images` with complete removal of the `image_url` legacy column and migration deprecation window.
* **Rationale**: Greenfield rebuild on an empty Supabase project meant there was no legacy production data to migrate or backfill. Starting directly with the normalized schema avoided unnecessary migration churn and dead legacy code paths.

---

## 3. Deliberate Security & Isolation Design

### 3.1 `security_invoker` Views with Catalogue-Only Grants
* **Public Views**: `products_public`, `product_images_public`, and `category_images_public` are created with `security_invoker = true`.
* **Grant Model**:
  - `anon` and `authenticated` roles only have `SELECT` on catalogue tables and public views.
  - `service_role` possesses full DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) for base tables.
  - `orders`, `order_items`, `profiles`, `sessions`, `audit_log`, `email_outbox`, and `fabrication_requests` are locked strictly to `service_role`.

### 3.2 Direct PostgreSQL Connection for Mutations & RPCs
* **Atomic Checkout**: `create_order` PostgreSQL stored procedure coordinates sequence generation, stock decrementing, and outbox insertion in a single atomic transaction.
* **Standalone Auth**: Database-backed sessions with SHA-256 token hashing and 7-day sliding expiration. `requireAdmin` checks role from the database per-request to prevent privilege escalation via stale session cookies.

---

## 4. Layer Boundary Rules

* `src/models/**` must never import `express`, `contracts`, `services`, or `controllers`.
* `src/services/**` must never import `express`, `Request`, `Response`, `routes`, or `controllers`.
* `src/controllers/**` must never import `@supabase/supabase-js` or `../config/supabase`.
* `src/routes/**` must never import `@supabase/supabase-js` or `../config/supabase`, and must delegate all request handling to controllers.
* `src/contracts/**` contains pure schemas, DTOs, and OpenAPI metadata without runtime side-effects.
