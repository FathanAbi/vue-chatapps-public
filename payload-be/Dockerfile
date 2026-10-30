# SEC-012: multi-stage build so dev dependencies and build tooling are not
# shipped in the runtime image.

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# --- deps: install exactly what the lockfile pins ---------------------------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- build: compile the Admin Panel and the server --------------------------
FROM base AS build
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- prod-deps: production dependencies only --------------------------------
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public 2>/dev/null || true
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
USER app
# The application listens on 3000 (see the compose port mapping / nginx proxy).
EXPOSE 3000
CMD ["npm", "run", "start"]
