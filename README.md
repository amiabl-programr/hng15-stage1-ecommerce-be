# Roofing Construction Shop API

A production-grade, high-performance RESTful API powering an e-commerce platform and custom fabrication service for roofing and building construction materials.

Built with **Node.js (ESM)**, **Express 5**, **TypeScript (Strict Mode)**, **Supabase / PostgreSQL**, **Sharp**, and **Zod**.

---

## Features

- **Product & Variant Catalog**:
  - Hierarchical categories, product profiles, finishes, gauges, and dimensions.
  - Dynamic inventory tracking and variant-level pricing.
- **Custom Fabrication Requests**:
  - Request quotes for bespoke roofing profiles, flashings, gutters, and structural fabrication.
  - Multi-file blueprint, specification, and CAD attachment uploads.
- **Authentication & Role-Based Access Control**:
  - Google OAuth 2.0 authentication with secure sliding-session cookie management (SHA-256 token hashing).
  - Fine-grained role checks (Customer vs. Admin) with dynamic role validation.
- **Transactional Order Placement**:
  - Atomic PostgreSQL RPC (`create_order`) that verifies stock availability, calculates line totals, decrements inventory, and records order records in an isolated transaction.
  - Constraint-verified order and invoice generation in whole Naira integer units (`bigint`).
- **Transactional Email Outbox**:
  - Robust background email delivery queue ensuring emails are never lost even if SMTP providers fail or throttle requests.
  - Automatic retry with exponential backoff and connection timeout management.
- **Optimized Media Pipeline**:
  - Multi-size image processing and WebP conversion with `sharp`.
  - Client-side placeholder blurhash generation using `blurhash`.
- **OpenAPI 3.1 & Contract-First Validation**:
  - Strict input and output contract validation with Zod.
  - Automatically generated OpenAPI 3.1 schema definitions.

---

## Tech Stack

- **Runtime**: Node.js >= 22 (Native ESM, `"type": "module"`)
- **Framework**: Express.js v5
- **Language**: TypeScript 6 (Strict mode with `exactOptionalPropertyTypes` & `noUncheckedIndexedAccess`)
- **Database**: PostgreSQL / Supabase (`@supabase/supabase-js` and `pg`)
- **Validation**: Zod 4 & `zod-openapi`
- **Media**: Sharp & Blurhash
- **Mail**: Nodemailer (SMTP with transactional outbox queue)
- **Testing**: Jest 30 (`@jest/globals`, `ts-jest` with ESM VM modules), Supertest
- **Package Manager**: pnpm (>= 11)

---

## Architecture & Layer Boundaries

The codebase enforces strict, unidirectional architectural layers:

```
src/
├── app.ts                 # Express application setup & middleware registration
├── index.ts               # Process bootstrapper, background worker & graceful shutdown
├── config/                # Environment variables, database clients, constants
├── contracts/             # Zod schemas, contract DTOs & OpenAPI spec definitions
├── controllers/           # HTTP Request & Response handlers (input validation & status)
├── lib/                   # Shared utilities (logging, errors, money, sessions, storage)
├── middlewares/           # Global & route middlewares (requireAuth, requireAdmin, errorHandler)
├── models/                # Database query layer (PostgreSQL / Supabase)
├── providers/             # Outbox worker & SMTP email provider with templates
├── routes/                # Express router declarations and controller bindings
└── services/              # Business domain services and orchestrators
```

### Architectural Rules:
- **Models (`src/models/`)**: Interacts exclusively with database tables. Never imports `express`, `contracts`, `services`, or `controllers`.
- **Services (`src/services/`)**: Implements business rules and orchestrates models and providers. Never imports Express `Request`/`Response` or controllers.
- **Controllers (`src/controllers/`)**: Validates contract inputs and dispatches to services. Never queries the database directly.
- **Money Handling**: Stored in whole Naira integer units (`bigint`/`number`), zero fractional storage, formatted via `src/lib/money.ts`.

---

## Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** >= 11.0.0
- A **Supabase** project (or local PostgreSQL 16+ instance)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/amiabl-programr/hng15-stage1-ecommerce-be.git
   cd hng15-stage1-ecommerce-be
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure environment variables**:
   Copy `.env.example` to `.env` and configure your credentials:
   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | :--- | :--- |
   | `PORT` | API listen port (default: `4000`) |
   | `APP_URL` | Frontend client URL (e.g. `http://localhost:3000`) |
   | `CORS_ORIGINS` | Comma-separated list of allowed CORS origins |
   | `SUPABASE_URL` | Supabase API Gateway URL |
   | `SUPABASE_ANON_KEY` | Supabase public anonymous key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for administrative queries) |
   | `SUPABASE_DB_URL` | Direct PostgreSQL connection string for migrations & scripts |
   | `GOOGLE_CLIENT_ID` | Google Cloud OAuth Client ID |
   | `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth Client Secret |
   | `GOOGLE_REDIRECT_URI` | Google OAuth redirect callback URI |
   | `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`) |
   | `SMTP_PORT` | SMTP port (`587` for STARTTLS / `465` for SSL) |
   | `SMTP_USER` | SMTP username / email address |
   | `SMTP_APP_PASSWORD` | SMTP password / App password |
   | `BOOTSTRAP_ADMIN_EMAILS` | Comma-separated list of initial admin user emails |

4. **Initialize Database Schema**:
   Run database schema and RPC migrations:
   ```bash
   pnpm db:apply --file scripts/create-outbox-and-order-rpc.sql
   ```

5. **Seed Catalog Data (Optional)**:
   ```bash
   pnpm seed
   ```

6. **Start Development Server**:
   ```bash
   pnpm dev
   ```

The API will be running at `http://localhost:4000`.

---

## API Reference

### Health & System
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` / `HEAD` | `/` | Root health check |
| `GET` | `/health` | Application liveness probe |
| `GET` | `/health/ready` | Readiness probe (verifies database connectivity) |
| `GET` | `/api/docs` | OpenAPI 3.1 JSON schema document |

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/login/google` | Initiates Google OAuth 2.0 flow | Public |
| `GET` | `/api/auth/callback/google` | Handles OAuth redirect & session creation | Public |
| `GET` | `/api/auth/me` | Fetches currently authenticated user profile & roles | Session |
| `POST` | `/api/auth/logout` | Revokes active session and clears auth cookie | Session |

### Catalog (`/api`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Lists products with filtering, search & pagination | Public |
| `GET` | `/api/products/:slug` | Retrieves single product details with all variants | Public |
| `GET` | `/api/categories` | Lists all product categories | Public |
| `GET` | `/api/profile-options` | Lists available roofing profiles and finishes | Public |

### Orders & Checkout (`/api`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Places a new order (validates stock & calculates total) | Customer |
| `GET` | `/api/account/orders` | Lists order history for current customer | Customer |
| `GET` | `/api/account/orders/:id` | Retrieves detailed order & delivery status | Customer |

### Fabrication Requests (`/api`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/fabrication-requests` | Submits a custom roofing fabrication quote request | Customer |
| `GET` | `/api/account/fabrication-requests` | Lists user's submitted fabrication requests | Customer |
| `GET` | `/api/account/fabrication-requests/:id` | Retrieves single custom fabrication quote details | Customer |

### Admin Management (`/api/admin`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/orders` | Lists and filters all customer orders | Admin |
| `PATCH` | `/api/admin/orders/:id/status` | Updates order fulfillment/payment status | Admin |
| `GET` | `/api/admin/fabrication-requests` | Reviews pending fabrication quote requests | Admin |
| `PATCH` | `/api/admin/fabrication-requests/:id/status` | Updates fabrication quote status & estimate | Admin |
| `POST` | `/api/admin/products` | Creates a new product and variants | Admin |
| `PATCH` | `/api/admin/products/:id` | Updates product and pricing information | Admin |

### Media (`/api/media`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/media/upload` | Uploads and optimizes product images / attachments | Admin / Customer |

---

## Scripts & CLI Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts development server with live reloading via `tsx` |
| `pnpm start` | Starts production server |
| `pnpm verify` | Runs complete check suite: typecheck, linting, unit tests, secret check |
| `pnpm typecheck` | Validates TypeScript types (`tsc --noEmit`) |
| `pnpm lint` | Runs ESLint rules including architectural boundary enforcement |
| `pnpm test` | Executes Jest unit test suite |
| `pnpm test:integration` | Executes integration tests against database fixtures |
| `pnpm openapi:generate` | Regenerates `openapi.json` from Zod contract definitions |
| `pnpm openapi:check` | Verifies that `openapi.json` matches current Zod schemas |
| `pnpm check:secrets` | Scans repository for leaked API keys or credentials |

---

## Containerization & Deployment

A multi-stage [Dockerfile](file:///c:/Users/Victor/Documents/Code/hng15/ecommerce_app/ecommerce-be/Dockerfile) is included for containerized deployments:

```bash
# Build the Docker image
docker build -t roofing-api .

# Run container on port 4000
docker run -p 4000:4000 --env-file .env roofing-api
```

### Production Checklist
- [x] Configure production `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`.
- [x] Set secure `CORS_ORIGINS` to allow only authorized frontend domains.
- [x] Provide valid SMTP app password credentials for email outbox dispatching.
- [x] Set `NODE_ENV=production`.

---

## License

This project is private and proprietary. All rights reserved.
