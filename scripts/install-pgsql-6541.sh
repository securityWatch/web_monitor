#!/bin/bash
# PostgreSQL 16 安装脚本 - 对外端口 6541
# 用法: sudo bash install-pgsql-6541.sh
set -e

PG_PORT=6541
PG_PASSWORD="${PG_PASSWORD}"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib

PG_VERSION=$(ls /etc/postgresql/ | sort -nr | head -1)
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

sed -i "s/^#listen_addresses = 'localhost'.*/listen_addresses = '*'/" "$PG_CONF"
sed -i "s/^port = 5432/port = ${PG_PORT}/" "$PG_CONF"

if ! grep -q "PulseWatch remote access" "$PG_HBA"; then
  cat >> "$PG_HBA" <<EOF

# PulseWatch remote access
host    all             all             0.0.0.0/0               scram-sha-256
host    all             all             ::/0                    scram-sha-256
EOF
fi

sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${PG_PASSWORD}';"
systemctl enable postgresql
systemctl restart postgresql@${PG_VERSION}-main

echo "PostgreSQL ${PG_VERSION} listening on port ${PG_PORT}"
ss -tlnp | grep ":${PG_PORT}"
