"""Replace associations for given words in content/*.txt.

Input: a UTF-8 file with lines "word | new association". Usage:
python tools/set_assoc.py fixes.txt
"""

import sys
from pathlib import Path

fixes = {}
for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    if "|" in line and not line.startswith("#"):
        word, assoc = line.split("|", 1)
        fixes[word.strip().lower()] = assoc.strip()

done = set()
for path in sorted(Path("content").glob("*.txt")):
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        parts = line.split("|")
        if len(parts) == 7 and parts[1].strip().lower() in fixes:
            word = parts[1].strip().lower()
            parts[3] = " " + fixes[word] + " "
            lines[i] = "|".join(parts)
            done.add(word)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"updated {len(done)} of {len(fixes)}")
missing = set(fixes) - done
if missing:
    print("not found:", ", ".join(sorted(missing)))
