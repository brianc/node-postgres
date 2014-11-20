SHELL := /bin/sh

connectionString=postgres://

params := $(connectionString)

node-command := xargs -n 1 -I file node file $(params)

.PHONY : test test-connection test-integration bench test-native \
	 jshint publish test-missing-native update-npm

all:
	npm install

help:
	@echo "make prepare-test-db [connectionString=postgres://<your connection string>]"
	@echo "make test-all [connectionString=postgres://<your connection string>]"

test: test-unit

test-all: jshint test-missing-native test-unit test-integration test-native test-binary


udpate-npm:
	@npm i npm --global

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

test-unit:
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@echo "***Testing connection***"
	@node script/test-connection.js $(params)

test-connection-binary:
	@echo "***Testing binary connection***"
	@node script/test-connection.js $(params) binary

test-missing-native:
	@echo "***Testing optional native install***"
	@rm -rf node_modules/pg-native
	@node test/native/missing-native.js
	@npm install pg-native@1.4.0
	@node test/native/missing-native.js
	@rm -rf node_modules/pg-native

node_modules/pg-native/index.js:
	@npm i pg-native

test-native: node_modules/pg-native/index.js
	@echo "***Testing native bindings***"
	@find test/native -name "*-tests.js" | $(node-command)
	@find test/integration -name "*-tests.js" | $(node-command) native

test-integration: test-connection
	@echo "***Testing Pure Javascript***"
	@find test/integration -name "*-tests.js" | $(node-command)

test-binary: test-connection-binary
	@echo "***Testing Pure Javascript (binary)***"
	@find test/integration -name "*-tests.js" | $(node-command) binary

prepare-test-db:
	@echo "***Preparing the database for tests***"
	@find script/create-test-tables.js  | $(node-command)

jshint:
	@echo "***Starting jshint***"
	@./node_modules/.bin/jshint lib
