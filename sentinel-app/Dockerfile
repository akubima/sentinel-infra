# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build Nuxt application
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

# Copy output from builder
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

# Run as non-root user
RUN addgroup -S sentinel && adduser -S sentinel -G sentinel
USER sentinel

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
