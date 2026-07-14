import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.17", username="pi", password="raspberry", timeout=20)
cmds = [
    "journalctl -u raspnvr -n 30 --no-pager",
    "ls -la /mnt/raspnvr/recordings/cam_2/ 2>/dev/null | head -10",
    "ps aux | grep ffmpeg | grep -v grep",
]
for cmd in cmds:
    print("===", cmd)
    _, out, _ = c.exec_command(cmd)
    print(out.read().decode("utf-8", errors="replace"))
c.close()
