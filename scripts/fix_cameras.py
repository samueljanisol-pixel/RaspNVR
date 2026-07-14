import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.17", username="pi", password="raspberry", timeout=20)

cmds = [
    "curl -s -X DELETE http://127.0.0.1:8080/api/cameras/1",
    "curl -s -X POST http://127.0.0.1:8080/api/cameras/2/restart",
]
for cmd in cmds:
    print("===", cmd)
    _, out, _ = c.exec_command(cmd)
    print(out.read().decode())

import time
time.sleep(8)

_, out, _ = c.exec_command("ls -lh /mnt/raspnvr/recordings/cam_2/ | tail -5")
print("=== segments")
print(out.read().decode())
_, out, _ = c.exec_command("ps aux | grep ffmpeg | grep -v grep")
print("=== ffmpeg")
print(out.read().decode())
c.close()
