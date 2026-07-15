#!/usr/bin/env python3
"""Resynchronise l'URL tunnel Cloudflare sur le Pi et force la publication au central."""
import sys
import time

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "192.168.0.17"
USER = "pi"
PASSWORD = "raspberry"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=20)

cmds = [
    "sudo bash /opt/raspnvr/deploy/sync-tunnel-url.sh cloudflared-quick || sudo bash /tmp/raspnvr-deploy/deploy/sync-tunnel-url.sh cloudflared-quick",
    "sleep 5",
    "cat /opt/raspnvr/data/tunnel_url",
    'T=$(cat /opt/raspnvr/data/tunnel_url); curl -s -o /dev/null -w "tunnel_hls=%{http_code}" "$T/api/hls/cam2/index.m3u8"; echo',
    "curl -s http://127.0.0.1:8080/api/agent/status | python3 -m json.tool",
]

for cmd in cmds:
    print(f"\n$ {cmd}")
    _, o, e = c.exec_command(cmd, get_pty=True)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out)
    if err.strip():
        print(err, file=sys.stderr)

c.close()
