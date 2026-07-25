#!/usr/bin/env bash
# Baja backend + frontend por PROCESS GROUP, no por parentesco.
#
# Dos pasadas a propósito:
#   1. Por PGID guardado en .dev/*.pgid — mata el árbol entero (pnpm, sh -c,
#      nest/vite) de una, incluso si el padre original ya murió.
#   2. Barrido por PUERTO — red de seguridad para huérfanos de corridas viejas
#      que nunca dejaron pgid (el caso que venía mordiendo: lanzados a mano o
#      por otra herramienta).
# Sin la pasada 2 el script mentiría: reportaría "todo abajo" con un proceso
# ajeno todavía escuchando en :3000.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO/.dev"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1
say() { [[ $QUIET -eq 1 ]] || echo "$@"; }

# SIGTERM y, si resiste, SIGKILL. El backend YA resistió un SIGTERM antes
# (quedó huérfano al morir su padre), así que el escalado no es teórico.
kill_group() {
  local pgid="$1"
  kill -0 "-$pgid" 2>/dev/null || return 1
  kill -TERM "-$pgid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "-$pgid" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -KILL "-$pgid" 2>/dev/null
  sleep 0.5
  return 0
}

for name in backend frontend; do
  f="$RUN_DIR/$name.pgid"
  [[ -f "$f" ]] || continue
  pgid="$(cat "$f")"
  if kill_group "$pgid"; then
    say "  ✓ $name (pgid $pgid) bajado"
  else
    say "  · $name (pgid $pgid) ya no corría"
  fi
  rm -f "$f"
done

# Barrido por puerto: cualquier cosa que siga escuchando, con pgid o sin él.
for port in 3000 5173; do
  pids="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)"
  [[ -z "$pids" ]] && continue
  for pid in $pids; do
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    say "  ! huérfano en :$port (pid $pid, pgid ${pgid:-?}) — matando"
    [[ -n "$pgid" ]] && kill_group "$pgid" || { kill -KILL "$pid" 2>/dev/null; }
  done
done

for port in 3000 5173; do
  if ss -tln 2>/dev/null | grep -q ":$port "; then
    echo "  ✗ :$port SIGUE ocupado" >&2
    exit 1
  fi
done
say "  :3000 y :5173 libres"
