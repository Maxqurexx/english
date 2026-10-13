"""Build a frequency-ordered list of English base words from the wordfreq data.

Merges simple inflections into their base form (runs, running, ran -> run is not
handled, but runs/running/walked -> run/walk are), drops junk tokens, and writes
tools/wordlist.tsv: rank<TAB>word. Content (translations, associations) is written
separately per word; this script only decides which words and in what order.

Usage: python tools/build_wordlist.py [count]
"""

import re
import sys
from pathlib import Path

from wordfreq import top_n_list

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
OUT = Path(__file__).with_name("wordlist.tsv")

forms = top_n_list("en", 40000)
position = {w: i for i, w in enumerate(forms)}

WORD_RE = re.compile(r"^[a-z]+$")
KEEP_SHORT = {"a", "i"}


def base_of(w):
    """Return a more frequent base form for an inflected word, or None."""
    candidates = []
    if w.endswith("ies") and len(w) > 4:
        candidates.append(w[:-3] + "y")
    if w.endswith("es") and len(w) > 3:
        candidates.append(w[:-2])
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        candidates.append(w[:-1])
    if w.endswith("ied") and len(w) > 4:
        candidates.append(w[:-3] + "y")
    if w.endswith("ed") and len(w) > 4:
        candidates += [w[:-2], w[:-1]]
        if len(w) > 5 and w[-3] == w[-4]:
            candidates.append(w[:-3])  # stopped -> stop
    if w.endswith("ing") and len(w) > 5:
        candidates += [w[:-3], w[:-3] + "e"]
        if w[-4] == w[-5]:
            candidates.append(w[:-4])  # running -> run
    for c in candidates:
        if c in position and position[c] < position[w]:
            return c
    return None


seen = set()
result = []
for w in forms:
    if not WORD_RE.match(w):
        continue
    if len(w) < 2 and w not in KEEP_SHORT:
        continue
    b = base_of(w)
    word = b or w
    if word in seen:
        continue
    seen.add(word)
    result.append(word)
    if len(result) >= TARGET:
        break

OUT.write_text("".join(f"{i + 1}\t{w}\n" for i, w in enumerate(result)), encoding="utf-8")
print(f"wrote {len(result)} words to {OUT}")
