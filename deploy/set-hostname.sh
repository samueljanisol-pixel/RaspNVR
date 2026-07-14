#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Exécutez avec sudo."
  exit 1
fi

HOST="${1:-}"
if [[ -z "${HOST}" ]]; then
  echo "Usage: set-hostname.sh <hostname>"
  exit 1
fi

hostnamectl set-hostname "${HOST}"

HOSTS="/etc/hosts"
if [[ -f "${HOSTS}" ]]; then
  if grep -q "^127.0.1.1" "${HOSTS}"; then
    sed -i "s/^127.0.1.1.*/127.0.1.1 ${HOST}/" "${HOSTS}"
  else
    echo "127.0.1.1 ${HOST}" >> "${HOSTS}"
  fi
fi

systemctl restart avahi-daemon 2>/dev/null || true
echo "Hostname défini : ${HOST}"
