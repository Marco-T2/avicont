FROM node:24-alpine AS builder

WORKDIR /app

# Provisioning de pnpm en Docker (NO corepack: se remueve en Node 25).
RUN npm i -g pnpm@11.2.2

# pnpm necesita los tres archivos de config para un install reproducible:
# package.json (deps), pnpm-lock.yaml (versiones pineadas) y
# pnpm-workspace.yaml (allowBuilds + cooldown).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --frozen-lockfile EXPLÍCITO: Docker no setea CI=true, así que pnpm no lo
# infiere solo. Sin esto, pnpm podría intentar resolver/actualizar el árbol.
# Va antes de copiar el schema: la capa de install cachea solo por el lockfile.
RUN pnpm install --frozen-lockfile

# El generate depende SOLO de prisma/ (schema + migrations). Copiarlo justo
# antes del generate ata la invalidación de cache de Docker al schema: si el
# schema cambia, el Prisma Client se regenera; si no, se reusa el cacheado.
# Si esto va después de `COPY . .`, Docker puede servir un generate cacheado de
# una build previa con schema viejo y el client queda desincronizado (delegate
# undefined en runtime → 500). Ver CLAUDE.md / gotcha docker-stale-prisma-client.
COPY prisma ./prisma/
RUN pnpm run prisma:generate

COPY . .

RUN pnpm run build

FROM node:24-alpine AS runner

WORKDIR /app

# Zona horaria fija en UTC: todo timestamp se persiste en UTC; la conversión a
# America/La_Paz es responsabilidad de la capa de presentación (CLAUDE.md §4.6).
ENV TZ=UTC

COPY --from=builder /app/dist ./dist
# Los symlinks de pnpm son relativos dentro de node_modules/.pnpm: copiar el
# node_modules entre stages funciona sin re-instalar.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Regenerar el Prisma Client EN el stage runner, sobre el filesystem final.
# El generate del builder produce un client que, al copiarse entre stages con
# COPY --from, queda desincronizado: require('@prisma/client') resuelve a
# default.js con un DMMF viejo (sin los campos nuevos del schema) aunque
# .prisma/client/index.js sí los tenga → PrismaClientValidationError "Unknown
# argument" en runtime, incluso tras un build --no-cache. Regenerar acá ata el
# client al filesystem exacto que lo ejecuta. Ver gotcha docker-stale-prisma-client.
RUN node_modules/.bin/prisma generate

EXPOSE 3000

# El runner no instala pnpm: se invoca el binario local de prisma directamente
# (ya copiado desde el builder) para no engordar la imagen final.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
