// Placement test: walks up the frequency bands with "know / don't know" answers,
// mixing in made-up words to correct for over-claiming.

(function (root) {
  const BAND = 500;
  const REAL_PER_BAND = 4;
  const PASS = 0.75; // adjusted share of known words that counts a band as known
  const CONTINUE = 0.5; // below this, stop testing higher bands

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function create(words, pseudo) {
    const maxRank = words.reduce((m, w) => Math.max(m, w.rank), 0);
    return {
      words,
      pseudo: shuffle(pseudo.slice()),
      bands: Math.ceil(maxRank / BAND),
      band: 0,
      queue: [],
      results: [], // per band: { hits, shown }
      fakeYes: 0,
      fakeShown: 0,
      finished: false,
    };
  }

  function fillBand(t) {
    const lo = t.band * BAND;
    const pool = t.words.filter((w) => w.rank > lo && w.rank <= lo + BAND);
    const real = shuffle(pool.slice()).slice(0, REAL_PER_BAND).map((w) => ({ text: w.en, real: true }));
    const items = real.slice();
    if (t.pseudo.length) items.push({ text: t.pseudo.pop(), real: false });
    t.queue = shuffle(items);
    t.results[t.band] = { hits: 0, shown: real.length };
  }

  function current(t) {
    if (t.finished) return null;
    if (!t.queue.length) {
      if (t.band >= t.bands) {
        t.finished = true;
        return null;
      }
      fillBand(t);
    }
    return t.queue[0];
  }

  function falseAlarmRate(t) {
    return t.fakeShown ? t.fakeYes / t.fakeShown : 0;
  }

  function adjusted(hits, shown, f) {
    if (!shown) return 0;
    const h = hits / shown;
    return f >= 1 ? 0 : Math.max(0, (h - f) / (1 - f));
  }

  function answer(t, knows) {
    const item = t.queue.shift();
    if (!item) return;
    if (item.real) {
      if (knows) t.results[t.band].hits += 1;
    } else {
      t.fakeShown += 1;
      if (knows) t.fakeYes += 1;
    }
    if (!t.queue.length) {
      const r = t.results[t.band];
      const score = adjusted(r.hits, r.shown, falseAlarmRate(t));
      t.band += 1;
      if (score < CONTINUE || t.band >= t.bands) t.finished = true;
    }
  }

  // Highest rank to treat as already known: the end of the last band, counting
  // from the first, whose adjusted score passes.
  function knownBelow(t) {
    const f = falseAlarmRate(t);
    let below = 0;
    for (let b = 0; b < t.results.length; b++) {
      const r = t.results[b];
      if (!r || adjusted(r.hits, r.shown, f) < PASS) break;
      below = (b + 1) * BAND;
    }
    return below;
  }

  function progress(t) {
    return Math.min(1, t.band / Math.max(1, t.bands));
  }

  const api = { create, current, answer, knownBelow, progress, BAND };
  if (typeof module !== "undefined") module.exports = api;
  else root.Placement = api;
})(this);
