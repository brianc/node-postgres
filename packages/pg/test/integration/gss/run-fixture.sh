#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/work/fixture
mkdir -p "$root/kdc" "$root/socket" "$root/pgdata"
export KRB5_CONFIG="$root/krb5.conf"
export KRB5_KDC_PROFILE="$root/kdc.conf"
export KRB5CCNAME="FILE:$root/valid.ccache"

cat > "$KRB5_CONFIG" <<EOF
[libdefaults]
 default_realm = PGTEST.INVALID
 dns_lookup_kdc = false
 dns_lookup_realm = false
 dns_canonicalize_hostname = false
 rdns = false
 udp_preference_limit = 1
[realms]
 PGTEST.INVALID = {
  kdc = 127.0.0.1:61088
 }
EOF
chmod 644 "$KRB5_CONFIG"
cat > "$KRB5_KDC_PROFILE" <<EOF
[kdcdefaults]
 kdc_ports = 61088
 kdc_tcp_ports = 61088
[realms]
 PGTEST.INVALID = {
  database_name = $root/kdc/principal
  key_stash_file = $root/kdc/stash
  max_life = 1d
 }
EOF

master=$(openssl rand -hex 24)
ticket_password=$(openssl rand -hex 24)
kdb5_util create -s -r PGTEST.INVALID -P "$master" > "$root/kdc-setup.log"
kadmin.local -q "addprinc -pw $ticket_password fixtureuser@PGTEST.INVALID" >> "$root/kdc-setup.log" 2>&1
kadmin.local -q 'addprinc -randkey postgres/localhost@PGTEST.INVALID' >> "$root/kdc-setup.log" 2>&1
kadmin.local -q "ktadd -k $root/server.keytab postgres/localhost@PGTEST.INVALID" >> "$root/kdc-setup.log" 2>&1

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=Local GSS fixture CA' \
  -keyout "$root/ca.key" -out "$root/ca.crt" > "$root/certificate.log" 2>&1
openssl req -newkey rsa:2048 -nodes -subj '/CN=localhost' \
  -keyout "$root/server.key" -out "$root/server.csr" >> "$root/certificate.log" 2>&1
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > "$root/cert.ext"
openssl x509 -req -in "$root/server.csr" -CA "$root/ca.crt" -CAkey "$root/ca.key" \
  -CAcreateserial -days 1 -extfile "$root/cert.ext" -out "$root/server.crt" >> "$root/certificate.log" 2>&1

touch "$root/postgres.log"
chown postgres:postgres "$root/postgres.log" "$root/socket" "$root/pgdata" "$root/server.keytab" "$root/server.key" "$root/server.crt"
chmod 755 "$root"
pgbin=$(dirname "$(find /usr/lib/postgresql -name postgres -type f | head -1)")
runuser -u postgres -- "$pgbin/initdb" -D "$root/pgdata" -A trust > "$root/postgres-setup.log"
cat >> "$root/pgdata/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 55439
unix_socket_directories = '$root/socket'
ssl = on
ssl_cert_file = '$root/server.crt'
ssl_key_file = '$root/server.key'
krb_server_keyfile = '$root/server.keytab'
EOF
runuser -u postgres -- "$pgbin/pg_ctl" -D "$root/pgdata" -l "$root/postgres.log" start -w >> "$root/postgres-setup.log"
kdc_pid=
sshd_pid=
tunnel_pid=
cleanup() {
  if [ -n "$tunnel_pid" ]; then kill "$tunnel_pid" 2>/dev/null || true; wait "$tunnel_pid" 2>/dev/null || true; fi
  if [ -n "$sshd_pid" ]; then kill "$sshd_pid" 2>/dev/null || true; wait "$sshd_pid" 2>/dev/null || true; fi
  if ! runuser -u postgres -- "$pgbin/pg_ctl" -D "$root/pgdata" stop -m fast -w >> "$root/postgres-setup.log" 2>&1; then
    printf 'PostgreSQL fixture teardown failed; inspect postgres-setup.log\n' >&2
  fi
  if [ -n "$kdc_pid" ]; then kill "$kdc_pid" 2>/dev/null || true; wait "$kdc_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
runuser -u postgres -- psql -h "$root/socket" -p 55439 -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE ROLE pgrepro LOGIN; CREATE ROLE rejectedrole LOGIN;' >> "$root/postgres-setup.log"
runuser -u postgres -- createdb -h "$root/socket" -p 55439 -O pgrepro gssrepro
printf 'local all all trust\nhost all all 127.0.0.1/32 gss include_realm=1 map=fixture\n' > "$root/pgdata/pg_hba.conf"
printf 'fixture fixtureuser@PGTEST.INVALID pgrepro\n' > "$root/pgdata/pg_ident.conf"
chown postgres:postgres "$root/pgdata/pg_hba.conf" "$root/pgdata/pg_ident.conf"
runuser -u postgres -- "$pgbin/pg_ctl" -D "$root/pgdata" reload >> "$root/postgres-setup.log"

krb5kdc -n > "$root/kdc.log" 2>&1 &
kdc_pid=$!
sleep 1
printf '%s\n' "$ticket_password" | kinit -c "$root/expired.ccache" -l 1s fixtureuser@PGTEST.INVALID > "$root/expired-ticket.log" 2>&1
sleep 2
printf '%s\n' "$ticket_password" | kinit -c "$root/valid.ccache" fixtureuser@PGTEST.INVALID > "$root/valid-ticket.log" 2>&1
unset master ticket_password

mkdir -p /run/sshd
ssh-keygen -q -t ed25519 -N '' -f "$root/ssh-client"
ssh-keygen -q -t ed25519 -N '' -f "$root/ssh-host"
cat > "$root/sshd.conf" <<EOF
ListenAddress 127.0.0.1
Port 61122
HostKey $root/ssh-host
AuthorizedKeysFile $root/ssh-client.pub
PidFile $root/sshd.pid
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
AllowUsers root
EOF
printf '[127.0.0.1]:61122 %s\n' "$(cat "$root/ssh-host.pub")" > "$root/known-hosts"
/usr/sbin/sshd -D -f "$root/sshd.conf" > "$root/sshd.log" 2>&1 &
sshd_pid=$!
node <<'JS'
const net = require('net')
const deadline = Date.now() + 5000
function probe() {
  const socket = net.connect(61122, '127.0.0.1', () => socket.end())
  socket.once('error', (error) => {
    if (Date.now() < deadline) setTimeout(probe, 50)
    else { console.error(error.message); process.exitCode = 1 }
  })
}
probe()
JS
ssh -N -p 61122 -i "$root/ssh-client" -o UserKnownHostsFile="$root/known-hosts" \
  -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:55440:127.0.0.1:55439 root@127.0.0.1 > "$root/tunnel.log" 2>&1 &
tunnel_pid=$!
sleep 1
kill -0 "$tunnel_pid"

export PGHOST=localhost PGPORT=55439 PGUSER=pgrepro PGDATABASE=gssrepro PGGSSENCMODE=disable
psql "sslmode=verify-full sslrootcert=$root/ca.crt" -w -t -A \
  -c "SELECT gss_authenticated, encrypted FROM pg_catalog.pg_stat_gssapi WHERE pid=pg_backend_pid()" \
  > /work/libpq-gss-control.txt
node /work/current/packages/pg/test/integration/gss/run-real-checks.js
node /work/current/packages/pg/test/integration/gss/regressions.js
