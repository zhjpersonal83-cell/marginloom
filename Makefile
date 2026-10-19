.PHONY: test build verify
test:
	mvn test
build:
	mvn package
verify:
	mvn verify

.PHONY: reproduce research-test
reproduce:
	python3 src/main/Python/ml/build.py
	python3 src/main/Python/ml/segmentation/run_segmentation.py
	python3 tools/export_models.py
research-test:
	python3 -m unittest discover -s src/main/Python/ml -v
