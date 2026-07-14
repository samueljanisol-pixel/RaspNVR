#!/usr/bin/env python3
"""Déploie RaspNVR sur un Raspberry Pi via SSH/SFTP."""

from __future__ import annotations

import argparse
import os
import stat
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import paramiko
except ImportError:
    print("Installation de paramiko…")
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REMOTE_DIR = "/tmp/raspnvr-deploy"
INSTALL_CMD = f"sudo bash {REMOTE_DIR}/deploy/install.sh"

EXCLUDE_DIRS = {".venv", "venv", "__pycache__", ".git", "data", ".cursor", "node_modules", ".next"}
EXCLUDE_FILES = {".env"}


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
        return True
    return path.name in EXCLUDE_FILES


def upload_file(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    data = local.read_bytes()
    if local.suffix in {".sh", ".service"} or local.name.startswith("sudoers.") or local.name.startswith("install-") or local.name.endswith(".yml"):
        data = data.replace(b"\r\n", b"\n")
    with sftp.open(remote, "wb") as remote_file:
        remote_file.write(data)


def upload_tree(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    for root, dirs, files in os.walk(local):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        rel = Path(root).relative_to(local)
        remote_root = f"{remote}/{rel}".replace("\\", "/").rstrip("/")
        if rel.parts:
            try:
                sftp.mkdir(remote_root)
            except OSError:
                pass
        for name in files:
            lp = Path(root) / name
            if should_skip(lp):
                continue
            rp = f"{remote_root}/{name}".replace("\\", "/")
            upload_file(sftp, lp, rp)


def run(client: paramiko.SSHClient, command: str) -> None:
    print(f"\n$ {command}")
    stdin, stdout, stderr = client.exec_command(command, get_pty=True)
    stdin.close()
    for line in iter(stdout.readline, ""):
        print(line, end="")
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)
    if stdout.channel.recv_exit_status() != 0:
        raise SystemExit(f"Commande échouée: {command}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="192.168.0.17")
    parser.add_argument("--user", default="pi")
    parser.add_argument("--password", default="raspberry")
    args = parser.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connexion à {args.user}@{args.host}…")
    client.connect(args.host, username=args.user, password=args.password, timeout=20)

    sftp = client.open_sftp()

    def mkdir_p(path: str) -> None:
        parts = path.strip("/").split("/")
        cur = ""
        for part in parts:
            cur += f"/{part}"
            try:
                sftp.mkdir(cur)
            except OSError:
                pass

    mkdir_p(REMOTE_DIR)
    print(f"Upload {PROJECT_ROOT} -> {REMOTE_DIR}")
    upload_tree(sftp, PROJECT_ROOT, REMOTE_DIR)
    sftp.close()

    run(client, f"chmod +x {REMOTE_DIR}/deploy/install.sh")
    run(client, INSTALL_CMD)
    client.close()
    print(f"\nOK — Ouvrez http://{args.host}:8080")


if __name__ == "__main__":
    main()
