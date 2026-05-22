FROM node:24-alpine AS builder

WORKDIR /app

# Provisioning de pnpm en Docker (NO corepack: se remueve en Node 25).
RUN npm i -g pnpm@11.2.2

# pnpm necesita los tres archivos de config para un install reproducible:
# package.json (deps), pnpm-lock.yaml (versiones pineadas) y
# pnpm-workspace.yaml (allowBuilds + cooldown).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# --frozen-lockfile EXPLÍCITO: Docker no setea CI=true, así que pnpm no lo
# infiere solo. Sin esto, pnpm podría intentar resolver/actualizar el árbol.
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run prisma:generate
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

EXPOSE 3000

# El runner no instala pnpm: se invoca el binario local de prisma directamente
# (ya copiado desde el builder) para no engordar la imagen final.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
