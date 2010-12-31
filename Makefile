SHELL := /bin/bash

user=postgres
password=1234
host=localhost
port=5432
database=postgres
verbose=false

params := -u $(user) --password $(password) -p $(port) -d $(database) -h $(host) --verbose $(verbose)

node-command := xargs -n 1 -I file node file $(params)

.PHONY : test test-connection test-integration bench
test: test-unit 

test-all: test-unit test-integration

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

test-unit:
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@node script/test-connection.js $(params)

test-integration: test-connection
	@find test/integration -name "*-tests.js" | $(node-command)
