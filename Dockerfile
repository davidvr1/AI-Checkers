# syntax=docker/dockerfile:1

# --- Stage 1: build the client bundle (needs the dev toolchain) ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: runtime -- the WebSocket server + the built static app ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
ENV RUNNING_IN_DOCKER=1

# Only production deps (express, ws, tsx). The server runs the TypeScript
# directly via tsx, so the source it imports is copied below.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The built client, the game/net source the server transpiles, and the entry.
COPY --from=builder /app/dist ./dist
COPY src ./src
COPY server ./server

EXPOSE 4173
CMD ["npm", "run", "server"]
