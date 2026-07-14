#!/usr/bin/env bash
# Installe cloudflared et configure le service tunnel (optionnel).
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Exécutez avec sudo."
  exit 1
fi

ARCH="$(uname -m)"
case "${ARCH}" in
  aarch64|arm64) CF_ARCH="arm64" ;;
  x86_64|amd64) CF_ARCH="amd64" ;;
  armv7l|armv6l) CF_ARCH="arm" ;;
  *)
    echo "Architecture non supportée: ${ARCH}"
    exit 1
    ;;
esac

echo "==> cloudflared (${CF_ARCH})"
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

INSTALL_DIR="/opt/raspnvr"
cp "${INSTALL_DIR}/deploy/cloudflared.service" /etc/systemd/system/cloudflared.service
cp "${INSTALL_DIR}/deploy/cloudflared-quick.service" /etc/systemd/system/cloudflared-quick.service
chmod +x "${INSTALL_DIR}/deploy/sync-tunnel-url.sh"

ENV_FILE="${INSTALL_DIR}/data/cloudflared.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<'EOF'
# Mode token (production) — dashboard Cloudflare Zero Trust > Tunnels
# CLOUDFLARE_TUNNEL_TOKEN=eyJ...
#
# Mode quick (test) — laisser le token commenté, utiliser cloudflared-quick.service
EOF
  chown pi:pi "${ENV_FILE}"
fi

echo "==> cloudflared (token ou quick tunnel)"
systemctl daemon-reload
systemctl disable cloudflared-quick 2>/dev/null || true
systemctl disable cloudflared 2>/dev/null || true

if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "${ENV_FILE}" 2>/dev/null; then
  systemctl enable cloudflared
  systemctl restart cloudflared || true
  echo "Tunnel token actif (cloudflared.service)"
else
  systemctl enable cloudflared-quick
  systemctl restart cloudflared-quick || true
  bash "${INSTALL_DIR}/deploy/sync-tunnel-url.sh" cloudflared-quick || true
  echo "Quick tunnel actif (trycloudflare.com) — URL dans ${INSTALL_DIR}/data/tunnel_url"
fi

echo "==> URL tunnel publique (optionnelle)"
TUNNEL_ENV="${INSTALL_DIR}/data/tunnel_url"
if [[ ! -f "${TUNNEL_ENV}" ]]; then
  echo "# https://mag01.votredomaine.fr" > "${TUNNEL_ENV}.example"
  chown pi:pi "${TUNNEL_ENV}.example"
  echo "Copiez l'URL publique du tunnel dans ${TUNNEL_ENV} (une ligne)"
fi
