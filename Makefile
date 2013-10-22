SHELL := /bin/sh
.PHONY: test

test:
	find test/ -name "*.js" | xargs -n 1 node
