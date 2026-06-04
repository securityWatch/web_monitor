#!/usr/bin/env python3
"""Deploy PulseWatch to remote server via SSH (password auth)."""
import os
import sys
import tarfile
import io
import time
from urllib.parse import quote

try:
    import paramiko
except ImportError:
    os.system(f"{sys.executable} -m pip install paramiko -q")
    import paramiko

HOST = os.environ.get("DEPLOY_HOST")
USER = os.environ.get("DEPLOY_USER", "ubuntu")
PASSWORD = os.environ.get("DEPLOY_PASSWORD")
APP_DIR = "/opt/pulsewatch"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXCLUDE = {
    "node_modules", ".next", ".git", "环境信息", ".env",
    "pulsewatch-api.exe", "__pycache__", ".cursor",
}


def run(client, cmd, sudo=False):
    if sudo:
        cmd = f"echo '{PASSWORD}' | sudo -S bash -c {repr(cmd)}"
    print(f">>> {cmd[:120]}...")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out[-2000:])
    if code != 0:
        print(f"WARN/ERR ({code}): {err[-500:]}", file=sys.stderr)
    return code, out


def make_tarball():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE]
            for fn in filenames:
                if fn.endswith(".exe") or fn == ".env":
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                if any(x in rel for x in EXCLUDE):
                    continue
                tar.add(full, arcname=f"pulsewatch/{rel}")
    buf.seek(0)
    return buf


def main():
    print(f"Connecting to {USER}@{HOST}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(client, f"mkdir -p {APP_DIR}", sudo=True)

    # Install prerequisites
    run(client, "apt-get update -qq && apt-get install -y -qq docker.io docker-compose-plugin nginx python3 2>/dev/null || true", sudo=True)
    run(client, "systemctl enable docker nginx && systemctl start docker nginx", sudo=True)
    run(client, "usermod -aG docker ubuntu || true", sudo=True)

    # Create database
    run(client, "sudo -u postgres psql -p 6541 -tc \"SELECT 1 FROM pg_database WHERE datname='pulsewatch'\" | grep -q 1 || sudo -u postgres psql -p 6541 -c \"CREATE DATABASE pulsewatch;\"", sudo=True)

    # Upload tarball
    print("Uploading project...")
    tar_buf = make_tarball()
    sftp = client.open_sftp()
    remote_tar = "/tmp/pulsewatch-deploy.tar.gz"
    sftp.putfo(tar_buf, remote_tar)
    sftp.close()

    run(client, f"rm -rf {APP_DIR}/* && tar -xzf {remote_tar} -C / && mv /pulsewatch/* {APP_DIR}/ && rmdir /pulsewatch 2>/dev/null; rm -f {remote_tar}", sudo=True)
    run(client, f"chown -R ubuntu:ubuntu {APP_DIR}", sudo=True)

    pg_password = os.environ.get("PG_PASSWORD")
    if not pg_password and not os.environ.get("DATABASE_URL"):
        print("Set PG_PASSWORD or DATABASE_URL before deploying.", file=sys.stderr)
        sys.exit(1)
    db_url = os.environ.get("DATABASE_URL") or (
        f"postgresql://postgres:{quote(pg_password, safe='')}@127.0.0.1:6541/pulsewatch"
    )

    # Create .env
    env_cmd = f"""cat > {APP_DIR}/.env << 'ENVEOF'
DATABASE_URL={db_url}
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
PORT=4000
CORS_ORIGIN=http://{HOST}
NEXT_PUBLIC_API_URL=http://{HOST}:4000
SMTP_MODE=console
NODE_ENV=production
ENVEOF"""
    run(client, env_cmd.replace("$(openssl rand -hex 32)", "`openssl rand -hex 32`"))

    # Build and start
    run(client, f"cd {APP_DIR} && docker compose -f deploy/docker-compose.prod.yml --env-file .env build 2>&1 | tail -20")
    run(client, f"cd {APP_DIR} && docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d")
    run(client, f"cp {APP_DIR}/deploy/nginx.conf /etc/nginx/sites-available/pulsewatch && ln -sf /etc/nginx/sites-available/pulsewatch /etc/nginx/sites-enabled/pulsewatch && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx", sudo=True)

    time.sleep(5)
    run(client, "curl -s http://127.0.0.1:4000/health || true")
    run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/en || true")

    client.close()
    print(f"\n✅ Deploy complete: http://{HOST}/en")


if __name__ == "__main__":
    main()
