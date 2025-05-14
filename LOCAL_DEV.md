# Local development

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
