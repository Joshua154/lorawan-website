FROM node:20-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
# Install build tools for optional legacy SQLite migration support.
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run the Next.js build
RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Create the data directory and ensure proper permissions for optional legacy imports
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# We aren't doing STANDALONE output here gracefully out of the box,
# so we preserve the standard Node modules and start script.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Safely copy the public directory if it exists
COPY --from=builder /app/public* ./public/

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
