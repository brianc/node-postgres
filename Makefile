SHELL := /bin/bash

connectionString=postgres://

params := $(connectionString)

node-command := xargs -n 1 -I file node file $(params)

.PHONY : test test-connection test-integration bench test-native \
	build/default/binding.node jshint upgrade-pg publish

all:
	npm install

help:
	@echo "make prepare-test-db [connectionString=postgres://<your connection string>]"
	@echo "make test-all [connectionString=postgres://<your connection string>]"

test: test-unit 

test-all: jshint test-unit test-integration test-native test-binary

test-travis: test-all upgrade-pg
	@make test-all connectionString=postgres://postgres@localhost:5433/postgres

upgrade-pg:
	@chmod 755 script/travis-pg-9.2-install.sh
	@./script/travis-pg-9.2-install.sh

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

build/default/binding.node:
	@node-gyp rebuild

test-unit:
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@echo "***Testing connection***"
	@node script/test-connection.js $(params)

test-connection-binary:
	@echo "***Testing binary connection***"
	@node script/test-connection.js $(params) binary

test-native: build/default/binding.node
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

publish:
	@rm -r build || (exit 0)
	@npm publish
