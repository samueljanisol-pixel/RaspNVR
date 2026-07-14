#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/raspnvr"
MEDIAMTX_VERSION="${MEDIAMTX_VERSION:-1.11.3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RECORDINGS_MOUNT="/mnt/raspnvr/recordings"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Exécutez ce script avec sudo."
  exit 1
fi

echo "==> Forcer apt en IPv4"
mkdir -p /etc/apt/apt.conf.d
echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99raspnvr-force-ipv4

echo "==> Paquets système"
apt-get update
apt-get install -y --fix-missing \
  python3 python3-venv python3-pip rsync ffmpeg curl avahi-daemon avahi-utils

ARCH="$(uname -m)"
case "${ARCH}" in
  aarch64|arm64) MTX_ARCH="arm64v8" ;;
  armv7l|armv6l) MTX_ARCH="arm32v7" ;;
  *)
    echo "Architecture non supportée: ${ARCH}"
    exit 1
    ;;
esac

echo "==> MediaMTX ${MEDIAMTX_VERSION} (${MTX_ARCH})"
mkdir -p "${INSTALL_DIR}/bin"
TMP="$(mktemp -d)"
curl -fsSL \
  "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz" \
  -o "${TMP}/mediamtx.tar.gz"
tar -xzf "${TMP}/mediamtx.tar.gz" -C "${TMP}"
install -m 755 "${TMP}/mediamtx" "${INSTALL_DIR}/bin/mediamtx"
rm -rf "${TMP}"

echo "==> Copie projet vers ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
rsync -a --exclude data --exclude .venv --exclude venv --exclude __pycache__ "${PROJECT_DIR}/" "${INSTALL_DIR}/"

echo "==> Environnement Python"
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install --prefer-binary -r "${INSTALL_DIR}/requirements.txt"

echo "==> Répertoires données et enregistrements"
mkdir -p "${INSTALL_DIR}/data" "${RECORDINGS_MOUNT}"
chown -R pi:pi "${INSTALL_DIR}" "${RECORDINGS_MOUNT}" /mnt/raspnvr

echo "==> mDNS (Avahi)"
CURRENT_HOST="$(hostnamectl status --static 2>/dev/null || hostname)"
if [[ "${CURRENT_HOST}" == "raspberrypi" ]]; then
  hostnamectl set-hostname raspnvr-mag01 || true
  grep -q "raspnvr-mag01" /etc/hosts || echo "127.0.1.1 raspnvr-mag01" >> /etc/hosts
fi
systemctl enable avahi-daemon
systemctl restart avahi-daemon || true

echo "==> Sudo hostname (sans mot de passe)"
chmod +x "${INSTALL_DIR}/deploy/set-hostname.sh"
cp "${INSTALL_DIR}/deploy/sudoers.raspnvr-hostname" /etc/sudoers.d/raspnvr-hostname
chmod 440 /etc/sudoers.d/raspnvr-hostname

echo "==> Cloudflare Tunnel (optionnel)"
chmod +x "${INSTALL_DIR}/deploy/install-cloudflared.sh"
bash "${INSTALL_DIR}/deploy/install-cloudflared.sh"

echo "==> Services systemd"
cp "${INSTALL_DIR}/deploy/mediamtx.service" /etc/systemd/system/mediamtx.service
cp "${INSTALL_DIR}/deploy/raspnvr.service" /etc/systemd/system/raspnvr.service
systemctl daemon-reload
systemctl enable mediamtx raspnvr
systemctl restart mediamtx
systemctl restart raspnvr

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Installation terminée."
echo "Interface : http://${IP}:8080"
echo "           http://raspnvr-mag01.local:8080"
echo "Statut    : systemctl status raspnvr mediamtx"
echo
echo "Branchez le SSD USB sur /mnt/raspnvr/recordings (ou enregistrements sur microSD pour test)."
