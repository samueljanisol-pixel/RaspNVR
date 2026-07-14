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

ENV_FILE="${INSTALL_DIR}/data/cloudflared.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<'EOF'
# Token tunnel Cloudflare (dashboard Zero Trust > Tunnels)
# CLOUDFLARE_TUNNEL_TOKEN=eyJ...
EOF
  chown pi:pi "${ENV_FILE}"
fi

echo "==> cloudflared.service (désactivé tant que CLOUDFLARE_TUNNEL_TOKEN absent)"
systemctl daemon-reload
if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "${ENV_FILE}" 2>/dev/null; then
  systemctl enable cloudflared
  systemctl restart cloudflared || true
else
  systemctl disable cloudflared 2>/dev/null || true
  echo "Ajoutez CLOUDFLARE_TUNNEL_TOKEN dans ${ENV_FILE} puis: sudo systemctl enable --now cloudflared"
fi

echo "==> URL tunnel publique (optionnelle)"
TUNNEL_ENV="${INSTALL_DIR}/data/tunnel_url"
if [[ ! -f "${TUNNEL_ENV}" ]]; then
  echo "# https://mag01.votredomaine.fr" > "${TUNNEL_ENV}.example"
  chown pi:pi "${TUNNEL_ENV}.example"
  echo "Copiez l'URL publique du tunnel dans ${TUNNEL_ENV} (une ligne)"
fi
