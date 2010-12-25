SHELL := /bin/bash

user=postgres
password=1234
host=localhost
port=5432
database=postgres
verbose=false

params := -u $(user) --password $(password) -p $(port) -d $(database) -h $(host) --verbose $(verbose)

test-connection:
	@node script/test-connection.js $(params)

test-unit:
	@find test/unit -name "*-tests.js" | xargs -n 1 -I file node file $(params)

test-integration: test-connection
	@find test/integration -name "*-tests.js" | xargs -n 1 -I file node file $(params)

test-all: test-unit test-integration
test: test-unit

.PHONY : test
