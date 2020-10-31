DESTDIR ::= /var/lib/postgres/data
POSTGRES_USER ::= postgres
POSTGRES_GROUP ::= postgres
DATABASE_HOST ::= localhost
DATABASE_USER ::= postgres

all: \
	test-server-ca.crt \
	test-client-ca.crt \
	test-server.key \
	test-server.crt \
	test-client.key \
	test-client.crt

clean:
	rm -f \
		test-server-ca.key \
		test-client-ca.key \
		test-server-ca.crt \
		test-client-ca.crt \
		test-server.key \
		test-server.crt \
		test-client.key \
		test-client.crt

install: test-server.crt test-server.key test-client-ca.crt
	install \
		--owner=$(POSTGRES_USER) \
		--group=$(POSTGRES_GROUP) \
		--mode=0600 \
		-t $(DESTDIR) \
		$^

test-%-ca.crt: test-%-ca.key
	openssl req -new -x509 \
		-subj '/CN=node-postgres test $* CA' \
		-days 3650 \
		-key $< \
		-out $@

test-server.csr: test-server.key
	openssl req -new \
		-subj '/CN=$(DATABASE_HOST)' \
		-key $< \
		-out $@

test-client.csr: test-client.key
	openssl req -new \
		-subj '/CN=$(DATABASE_USER)' \
		-key $< \
		-out $@

test-%.crt: test-%.csr test-%-ca.crt test-%-ca.key
	openssl x509 -req \
		-CA test-$*-ca.crt \
		-CAkey test-$*-ca.key \
		-set_serial 1 \
		-days 3650 \
		-in $< \
		-out $@

%.key:
	openssl genpkey \
		-algorithm EC \
		-pkeyopt ec_paramgen_curve:prime256v1 \
		-out $@

.PHONY: all clean install
.SECONDARY: test-server-ca.key test-client-ca.key
.INTERMEDIATE: test-server.csr test-client.csr
.POSIX:
