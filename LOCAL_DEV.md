# Local development

## In a container

The quickest way to get a server the whole suite can run against, SSL included, is the
script that starts the same image CI uses. It works with either podman or docker, and
prints the environment variables to export:

```sh
packages/pg/script/test-server.sh        # start it
packages/pg/script/test-server.sh stop   # remove it again
```

SSL is worth having even if you are not working on it, since the SCRAM channel binding
tests are skipped without it. Pass `POSTGRES_VERSION` to test against another release,
e.g. `POSTGRES_VERSION=13 packages/pg/script/test-server.sh`.

## On the host

Steps to install and configure Postgres on Mac for developing against locally

1. Install homebrew
2. Install postgres
   ```sh
   brew install postgresql
   ```
3. Create a database
   ```sh
   createdb test
   ```
4. Create SSL certificates
   ```sh
   cd /opt/homebrew/var/postgresql@14
   openssl genrsa -aes128 2048 > server.key
   openssl rsa -in server.key -out server.key
   chmod 400 server.key
   openssl req -new -key server.key -days 365 -out server.crt -x509
   cp server.crt root.crt
   ```
5. Update config in `/opt/homebrew/var/postgresql@14/postgresql.conf`

   ```conf
   listen_addresses = '*'

   password_encryption = md5

   ssl = on
   ssl_ca_file = 'root.crt'
   ssl_cert_file = 'server.crt'
   ssl_crl_file = ''
   ssl_crl_dir = ''
   ssl_key_file = 'server.key'
   ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL' # allowed SSL ciphers
   ssl_prefer_server_ciphers = on
   ```

6. Start Postgres server
   ```sh
   /opt/homebrew/opt/postgresql@14/bin/postgres -D /opt/homebrew/var/postgresql@14
   ```
