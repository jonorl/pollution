FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
# prisma.config.ts insists on DATABASE_URL being set, although generate never connects.
RUN DATABASE_URL=postgresql://build@localhost/build npm run build

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
EXPOSE 8084

USER node

CMD ["node", "dist/server.js"]
