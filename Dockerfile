FROM node:22-alpine AS base

# --- Stage 1: Install dependencies ---
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace package manifests
COPY packages/cli/package.json packages/cli/

# Install all dependencies (including workspace packages)
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build the application ---
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY . .

# Build the CLI workspace package first (Next.js imports from its dist/)
RUN pnpm --filter reeldocs build

# Build arguments for public env vars (needed at build time by Next.js)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm build

# --- Stage 3: Production runtime ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
