# syntax=docker/dockerfile:1

# Stage 1: Base image with pnpm enabled
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# Stage 2: Install dependencies
FROM base AS dependencies
WORKDIR /app

# Copy dependency definitions and workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies including sharp native binaries and devDependencies for tsx execution
RUN pnpm install --frozen-lockfile

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for container HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules from dependencies stage
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules

# Copy app code and configs
COPY --chown=node:node package.json pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

# Run as non-root user
USER node

EXPOSE 4000

# Healthcheck against Express health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-4000}/health || exit 1

# Start the application via tsx execution
CMD ["pnpm", "start"]
