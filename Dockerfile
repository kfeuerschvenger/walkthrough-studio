# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22.23.4-alpine3.24

# ---------- deps: every dependency, for the build ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- prod-deps: runtime dependencies only ----------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- build: SPA bundle and compiled server ----------
FROM deps AS build
WORKDIR /app

# Vite inlines VITE_* values at build time, so they are build arguments.
# The default house is the bundled demo; to use a private model, mount it
# at /models and build with VITE_HOUSE_URL=/models/House.fbx.
ARG VITE_HOUSE_URL=/demo/house.glb
ARG VITE_HOUSE_SPAWN=
ARG VITE_HOUSE_GROUND_HINTS=
ARG VITE_SUN_PATH_ROTATION_DEG=
ARG VITE_SITE_URL=
ENV VITE_HOUSE_URL=${VITE_HOUSE_URL} \
    VITE_HOUSE_SPAWN=${VITE_HOUSE_SPAWN} \
    VITE_HOUSE_GROUND_HINTS=${VITE_HOUSE_GROUND_HINTS} \
    VITE_SUN_PATH_ROTATION_DEG=${VITE_SUN_PATH_ROTATION_DEG} \
    VITE_SITE_URL=${VITE_SITE_URL}

COPY . .
RUN npm run build && npm run build:server

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATA_DIR=/data \
    MODELS_DIR=/models

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# The `node` user ships with the base image. A named volume mounted on an
# existing, owned directory inherits its ownership on first use.
RUN mkdir -p /data && chown node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "dist-server/server/server.js"]
