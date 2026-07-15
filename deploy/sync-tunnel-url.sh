#!/usr/bin/env bash
# Extrait l'URL trycloudflare depuis les logs et la publie pour l'agent.
set -euo pipefail

TUNNEL_FILE="/opt/raspnvr/data/tunnel_url"
SERVICE="${1:-cloudflared-quick}"

read_latest_url() {
  journalctl -u "${SERVICE}" -b --no-pager -o cat 2>/dev/null \
    | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' \
    | tail -1 || true
}

for _ in $(seq 1 45); do
  URL="$(read_latest_url)"
  if [[ -n "${URL}" ]]; then
    CURRENT=""
    [[ -f "${TUNNEL_FILE}" ]] && CURRENT="$(tr -d '\r\n' < "${TUNNEL_FILE}")"
    if [[ "${CURRENT}" != "${URL}" ]]; then
      echo "${URL}" > "${TUNNEL_FILE}"
      chown pi:pi "${TUNNEL_FILE}"
      echo "Tunnel URL: ${URL}"
      systemctl restart raspnvr || true
    fi
    exit 0
  fi
  sleep 2
done

echo "URL tunnel introuvable dans journalctl -u ${SERVICE}" >&2
exit 1
