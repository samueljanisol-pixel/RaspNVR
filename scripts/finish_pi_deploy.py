#!/usr/bin/env python3
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.0.17", username="pi", password="raspberry", timeout=20)

cmds = [
    "sudo cp /opt/raspnvr/deploy/mediamtx.service /etc/systemd/system/mediamtx.service",
    "sudo cp /opt/raspnvr/deploy/raspnvr.service /etc/systemd/system/raspnvr.service",
    "sudo systemctl daemon-reload",
    "sudo systemctl restart mediamtx",
    "sudo systemctl restart raspnvr",
    "sudo systemctl restart cloudflared-quick 2>/dev/null || sudo systemctl restart cloudflared 2>/dev/null || true",
    "systemctl is-active mediamtx raspnvr cloudflared-quick cloudflared 2>/dev/null || true",
    "curl -sf -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:8080/ || echo FAIL",
    "head -20 /opt/raspnvr/deploy/mediamtx.yml",
]

for cmd in cmds:
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out)
    if err.strip():
        print(err)

client.close()
print("\nOK")
