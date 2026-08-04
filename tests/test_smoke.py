#!/usr/bin/env python3
import json, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(ROOT/"src/shadow_factory.py"),str(ROOT/"configs/smoke.yaml")],cwd=ROOT,check=True)
manifest=json.loads((ROOT/"smoke_output/batch_manifest.json").read_text())
assert manifest["counts"]["ERROR"]==0
assert manifest["counts"]["FAIL"]==0
print("smoke test passed",manifest["counts"])
