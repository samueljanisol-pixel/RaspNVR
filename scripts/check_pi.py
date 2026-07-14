import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.17", username="pi", password="raspberry", timeout=20)
for cmd in [
    "systemctl is-active raspnvr mediamtx",
    "curl -s http://127.0.0.1:8080/api/system/status",
]:
    print("===", cmd)
    _, out, err = c.exec_command(cmd)
    print(out.read().decode())
    e = err.read().decode()
    if e:
        print(e)
c.close()
