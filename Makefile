SHELL := /bin/bash

user=postgres
password=1234
host=localhost
port=5432
database=postgres
verbose=false

params := -u $(user) --password $(password) -p $(port) -d $(database) -h $(host) --verbose $(verbose)

node-command := xargs -n 1 -I file node file $(params)

.PHONY : test test-connection test-integration bench test-native build/default/binding.node
test: test-unit 

test-all: test-unit test-integration test-native test-binary

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

build/default/binding.node:
	@node-waf configure build

test-unit:
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@node script/test-connection.js $(params)

test-connection-binary:
	@node script/test-connection.js $(params) --binary true

test-native: build/default/binding.node
	@echo "***Testing native bindings***"
	@find test/native -name "*-tests.js" | $(node-command)
	@find test/integration -name "*-tests.js" | $(node-command) --native true

test-integration: test-connection
	@echo "***Testing Pure Javascript***"
	@find test/integration -name "*-tests.js" | $(node-command)

test-binary: test-connection-binary
	@echo "***Testing Pure Javascript (binary)***"
	@find test/integration -name "*-tests.js" | $(node-command) --binary true
