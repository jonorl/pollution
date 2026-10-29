FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
# prisma.config.ts insists on POLLUTION_DB_URL being set, although generate never connects.
RUN POLLUTION_DB_URL=postgresql://build@localhost/build npm run build

FROM node:22-alpine
WORKDIR /app

# The Prisma schema engine (used by `prisma migrate deploy`) needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
# --ignore-scripts skips the engine download that `prisma migrate` needs; fetch it now
# while still root, as the `node` user can't write to node_modules at runtime.
RUN npm rebuild @prisma/engines prisma

COPY --from=build /app/dist ./dist
# Kept in the image so migrations can be applied from the running container.
COPY prisma ./prisma
COPY prisma.config.ts ./

ENV NODE_ENV=production
# The deploy passes the commit being built; /health reports it so the smoke test can tell the new container is live.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
EXPOSE 8084

# Lets `docker ps` show whether the API can still reach its database. busybox wget ships with the alpine image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT_POLLUTION:-3000}/health" > /dev/null || exit 1

USER node

CMD ["node", "dist/server.js"]
