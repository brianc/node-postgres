.PHONY: test
test:
	npm test

.PHONY: patch
patch: test
	npm version patch -m "Bump version"
	git push origin master --tags
	npm publish

.PHONY: minor
minor: test
	npm version minor -m "Bump version"
	git push origin master --tags
	npm publish
