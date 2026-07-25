#!/usr/bin/env bash
# Diagnóstico de §11.7: ¿el proceso que escucha tiene el código que compilaste?
#
# El chequeo decisivo NO es el log ni el PPID, es comparar el ARRANQUE del
# proceso contra la fecha del dist/. Si el dist/ es más nuevo, el proceso no lo
# tiene — Node ya cargó el JS en memoria y no lo relee. Un `grep EADDRINUSE`
# que da 0 NO descarta nada (variante 2: sin watcher no hay reinicios que
# loguear).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Docker ==="
docker compose -f "$REPO/docker-compose.yml" ps --format "table {{.Service}}\t{{.Status}}" 2>/dev/null | tail -n +1

for port in 3000 5173; do
  echo
  echo "=== :$port ==="
  pid="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)"
  if [[ -z "$pid" ]]; then
    echo "  libre"
    continue
  fi
  ps -o pid,ppid,lstart,cmd -p "$pid" 2>/dev/null | tail -n +2 | sed 's/^/  /'
  ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [[ "$ppid" == "1" ]]; then
    echo "  ⚠ PPID=1 → huérfano (informativo: el teardown por pgid no lo necesita)"
  fi

  if [[ "$port" == "3000" ]]; then
    started_epoch="$(date -d "$(ps -o lstart= -p "$pid" 2>/dev/null)" +%s 2>/dev/null || echo 0)"
    newest="$(find "$REPO/backend/dist" -name '*.js' -newermt "@$started_epoch" 2>/dev/null | head -3)"
    if [[ -n "$newest" ]]; then
      echo "  ✗ dist/ MÁS NUEVO que el proceso — NO tiene tus cambios. Ej:"
      echo "$newest" | sed 's/^/      /'
      echo "      → ./scripts/dev-down.sh && ./scripts/dev-up.sh"
    else
      echo "  ✓ dist/ no tiene nada posterior al arranque"
    fi
  fi
done
