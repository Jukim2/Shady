.PHONY: samples smoke batch test clean

samples:
	python scripts/generate_sample_targets.py

smoke: samples
	python src/shadow_factory.py configs/smoke.yaml --zip

batch: samples
	python src/shadow_factory.py configs/production.yaml --zip

test: samples
	python tests/test_smoke.py

clean:
	python -c "from pathlib import Path; import shutil; [shutil.rmtree(p) for p in (Path('output'), Path('smoke_output')) if p.exists()]"
