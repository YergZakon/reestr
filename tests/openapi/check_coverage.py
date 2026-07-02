"""CI-гейт: docs/openapi.yaml покрывает ровно те операции, что экспортируют route.ts.
Падает (exit 1) при любом расхождении код↔спека в обе стороны.
Запуск из корня веб-репо: python tests/openapi/check_coverage.py
"""
import os
import re
import sys

import yaml

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)

spec = yaml.safe_load(open("docs/openapi.yaml", encoding="utf-8"))
spec_ops = set()
for p, item in spec["paths"].items():
    for m in item:
        if m in ("get", "post", "put", "delete", "patch"):
            spec_ops.add((m.upper(), p))

actual = set()
for root, _, files in os.walk("src/app/api"):
    if "route.ts" in files:
        rel = "/" + os.path.relpath(root, "src/app").replace(os.sep, "/")
        rel = rel.replace("[id]", "{id}")
        src = open(os.path.join(root, "route.ts"), encoding="utf-8").read()
        for m in re.findall(r"export (?:async )?function (GET|POST|PUT|DELETE|PATCH)", src):
            actual.add((m, rel))

missing = actual - spec_ops
extra = spec_ops - actual
print(f"операций: код={len(actual)} спека={len(spec_ops)}")
if missing:
    print("НЕ покрыто спекой:", *sorted(missing), sep="\n  ")
if extra:
    print("Лишнее в спеке (нет в коде):", *sorted(extra), sep="\n  ")
if missing or extra:
    sys.exit(1)
print("OpenAPI ↔ код: полное соответствие.")
