.PHONY: test build verify
test:
	mvn test
build:
	mvn package
verify:
	mvn verify
