SHELL := /bin/sh

connectionString=postgres://

params := $(connectionString)

node-command := xargs -n 1 -I file node file $(params)

.PHONY : test test-connection test-integration bench test-native \
	 publish update-npm

all:
	npm install

help:
	@echo "make test-all [connectionString=postgres://<your connection string>]"

test: test-unit

test-all: test-unit test-integration test-native test-worker


update-npm:
	@npm i npm --global

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

test-unit:
	@chmod 600 test/unit/client/pgpass.file
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@echo "***Testing connection***"
	@node script/create-test-tables.js $(params)

test-native: test-connection
	@echo "***Testing native bindings***"
ifeq ($(TEST_SKIP_NATIVE), true)
	@echo "***Skipping tests***"
else
	@find test/native -name "*-tests.js" | $(node-command)
	@find test/integration -name "*-tests.js" | $(node-command) native
endif

test-integration: test-connection
	@echo "***Testing Pure Javascript***"
	@find test/integration -name "*-tests.js" | $(node-command)

test-binary: test-connection
	@echo "***Testing Pure Javascript (binary)***"
	@find test/integration -name "*-tests.js" | $(node-command) binary

test-pool:
	@find test/integration/connection-pool -name "*.js" | $(node-command) binary

test-worker:
  # this command only runs in node 18.x and above since there are 
	# worker specific items missing from the node environment in lower versions
	@if [[ $(shell node --version | sed 's/v//' | cut -d'.' -f1) -ge 18 ]]; then \
		echo "***Testing Cloudflare Worker support***"; \
		yarn vitest run -c test/vitest.config.mts test/cloudflare/ --no-watch -- $(params); \
	else \
		echo "Skipping test-worker: Node.js version is less than 18."; \
	fi
