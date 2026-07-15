#!/usr/bin/env python3
import paramiko
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.0.17", username="pi", password="raspberry", timeout=20)

cmds = [
    "sleep 3",
    "systemctl is-active mediamtx raspnvr",
    "curl -sf -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:8080/ || echo FAIL",
    "curl -sf -o /dev/null -w 'HLS %{http_code}' http://127.0.0.1:8888/cam2/index.m3u8 || echo HLS_FAIL",
    "journalctl -u mediamtx -n 15 --no-pager",
    "journalctl -u raspnvr -n 10 --no-pager",
]

for cmd in cmds:
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out)

client.close()
