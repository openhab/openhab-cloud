#!/usr/bin/env bash
# Tail Docker compose logs from all app servers in parallel.
# Usage: ./logs.sh [app|nginx|all] [lines]

set -euo pipefail

FILTER="${1:-all}"
LINES="${2:-50}"
COMPOSE_FILE="/opt/openhabcloud/docker-compose.yml"

cleanup() {
  kill 0 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

case "$FILTER" in
  app)   GREP="grep --line-buffered -v '^nginx'" ;;
  nginx) GREP="grep --line-buffered '^nginx'" ;;
  all)   GREP="cat" ;;
  *)     echo "Usage: $0 [app|nginx|all] [lines]"; exit 1 ;;
esac

HOSTS=$(ansible-inventory --list 2>/dev/null \
  | python3 -c "
import sys, json
inv = json.load(sys.stdin)
meta = inv.get('_meta', {}).get('hostvars', {})
for h in inv.get('appservers', {}).get('hosts', []):
    print(h, meta.get(h, {}).get('ansible_host', h))
")

while read -r name ip; do
  ssh -o StrictHostKeyChecking=no "root@${ip}" \
    "docker compose -f ${COMPOSE_FILE} logs -f --tail ${LINES}" \
    2>&1 | eval "$GREP" | awk -v h="$name" '{print "[" h "] " $0; fflush()}' &
done <<< "$HOSTS"

wait
