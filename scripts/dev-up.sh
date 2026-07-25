#!/usr/bin/env bash
# Levanta backend + frontend en dev, cada uno en su PROPIO process group.
#
# El §11.7 del CLAUDE.md documenta el modo de falla que esto elimina: un
# `start:dev` lanzado por una herramienta que después termina deja el proceso
# aferrado al :3000 con el PPID reasignado a /init. Matar "el padre" ya no
# alcanza y el proceso viejo sigue sirviendo un dist/ que no volverá a leer.
#
# Acá el teardown NO depende del parentesco: cada server arranca con setsid
# (grupo propio) y su PGID queda en .dev/*.pgid. dev-down.sh mata el grupo
# entero, sin importar quién sea el padre en ese momento.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO/.dev"
mkdir -p "$RUN_DIR"

# Idempotencia: si quedó algo de una corrida anterior, se baja primero. Sin
# esto el arranque "funciona" pero el EADDRINUSE queda enterrado en el log y
# el navegador sigue hablando con el proceso viejo (§11.7, variante 1).
"$REPO/scripts/dev-down.sh" --quiet

start() {
  local name="$1" dir="$2" port="$3"
  shift 3
  local log="$RUN_DIR/$name.log"

  : >"$log"
  ( cd "$dir" && exec setsid "$@" ) >>"$log" 2>&1 &
  local child=$!

  # El PGID es lo único que sirve para el teardown. setsid hace al hijo líder
  # de su propio grupo, así que PGID == su PID; se lee de /proc en vez de
  # asumirlo.
  sleep 0.5
  local pgid
  pgid="$(ps -o pgid= -p "$child" 2>/dev/null | tr -d ' ' || true)"
  if [[ -z "$pgid" ]]; then
    echo "  ✗ $name no arrancó — ver $log" >&2
    return 1
  fi
  echo "$pgid" >"$RUN_DIR/$name.pgid"

  printf '  … %s (pgid %s) esperando :%s' "$name" "$pgid" "$port"
  for _ in $(seq 1 90); do
    if ss -tln 2>/dev/null | grep -q ":$port "; then
      printf ' ✓\n'
      return 0
    fi
    if ! kill -0 "-$pgid" 2>/dev/null; then
      printf ' ✗ murió\n'
      tail -25 "$log" >&2
      return 1
    fi
    sleep 1
    printf '.'
  done
  printf ' ✗ timeout\n'
  tail -25 "$log" >&2
  return 1
}

echo "Levantando dev servers…"
start backend  "$REPO/backend"  3000 pnpm run start:dev
start frontend "$REPO/frontend" 5173 pnpm run dev
echo
echo "  backend   http://localhost:3000/api/health   ·   swagger /docs"
echo "  frontend  http://localhost:5173"
echo "  logs      .dev/backend.log · .dev/frontend.log"
echo "  bajar     ./scripts/dev-down.sh"
