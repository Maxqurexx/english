// Scheduling: the review ladder, daily limits and what to study today.
// Pure functions over the saved state, so the logic can be tested in Node.

(function (root) {
  // Days to wait after each successful recall. Step 0 means "check again tomorrow".
  const INTERVALS = [1, 3, 7, 21, 60, 180];
  // A word counts as learned once it is recalled after the 7-day wait.
  const LEARNED_STEP = 2;
  const REVIEWS_PER_NEW_WORD = 6;

  function dayNumber(date) {
    const d = date || new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  function dayKey(day) {
    return new Date(day * 86400000).toISOString().slice(0, 10);
  }

  function emptyState() {
    return {
      v: 1,
      settings: { newPerDay: 10 },
      placement: { done: false, knownBelow: 0 },
      words: {},
      days: {},
    };
  }

  function today(state, day) {
    const key = dayKey(day);
    if (!state.days[key]) state.days[key] = { n: 0, r: 0, ms: 0 };
    return state.days[key];
  }

  function reviewLimit(state) {
    return state.settings.newPerDay * REVIEWS_PER_NEW_WORD;
  }

  // Words due for review today, most fragile first, trimmed to what is left of today's limit.
  function dueReviews(state, day) {
    const left = Math.max(0, reviewLimit(state) - today(state, day).r);
    const due = [];
    for (const id in state.words) {
      const w = state.words[id];
      if (w.known || w.done || w.s === undefined) continue;
      if (w.due <= day) due.push({ id: Number(id), s: w.s, due: w.due });
    }
    due.sort((a, b) => a.s - b.s || a.due - b.due);
    return due.slice(0, left).map((x) => x.id);
  }

  // The next unseen words by frequency, skipping what the placement test marked as known.
  function nextNewWords(state, words, count) {
    const out = [];
    for (const w of words) {
      if (out.length >= count) break;
      if (w.rank <= state.placement.knownBelow) continue;
      if (state.words[w.id]) continue;
      out.push(w.id);
    }
    return out;
  }

  function newLeftToday(state, day) {
    return Math.max(0, state.settings.newPerDay - today(state, day).n);
  }

  function markIntroduced(state, id, day) {
    state.words[id] = { s: 0, due: day + INTERVALS[0], seen: day };
    today(state, day).n += 1;
  }

  // `learnt` marks a word that was being learned before it was marked as known
  // (as opposed to one the learner already knew the first time they saw it).
  function markKnown(state, id, day) {
    const prev = state.words[id];
    state.words[id] = { known: true, at: day, learnt: !!prev && !prev.known };
  }

  // Undo "already know": the word becomes unseen again and comes back as a new word.
  function unmarkKnown(state, id) {
    if (state.words[id] && state.words[id].known) delete state.words[id];
  }

  // Only words that were learned in the app, not ones known at first sight.
  function knownIds(state) {
    return Object.keys(state.words)
      .filter((id) => state.words[id].known && state.words[id].learnt)
      .map(Number)
      .sort((a, b) => (state.words[b].at || 0) - (state.words[a].at || 0));
  }

  function learnedIds(state) {
    return Object.keys(state.words)
      .filter((id) => !state.words[id].known && (state.words[id].learned || state.words[id].done))
      .map(Number)
      .sort((a, b) => (state.words[b].learned || 0) - (state.words[a].learned || 0));
  }

  // Same-day check right after learning. The word is due tomorrow either way;
  // `chk` records that today's check is done so an interrupted session can resume.
  function markChecked(state, id, day) {
    const w = state.words[id];
    if (!w) return;
    w.due = day + INTERVALS[0];
    w.chk = day;
  }

  // Words met today whose same-day check is still missing (the session was left early).
  function pendingChecks(state, day) {
    const out = [];
    for (const id in state.words) {
      const w = state.words[id];
      if (!w.known && w.seen === day && w.chk !== day) out.push(Number(id));
    }
    return out;
  }

  // Words met today, for the "today's words" practice.
  function todaysWords(state, day) {
    const out = [];
    for (const id in state.words) {
      const w = state.words[id];
      if (!w.known && w.seen === day) out.push(Number(id));
    }
    return out;
  }

  // Words started but not yet learned, newest first.
  function inProgressIds(state) {
    return Object.keys(state.words)
      .filter((id) => {
        const w = state.words[id];
        return !w.known && !w.learned && !w.done;
      })
      .map(Number)
      .sort((a, b) => (state.words[b].seen || 0) - (state.words[a].seen || 0));
  }

  function markReviewed(state, id, recalled, day) {
    const w = state.words[id];
    if (!w || w.known) return;
    today(state, day).r += 1;
    if (recalled) {
      if (w.s >= LEARNED_STEP && !w.learned) w.learned = day;
      w.s += 1;
      if (w.s >= INTERVALS.length) {
        w.done = true;
        delete w.due;
      } else {
        w.due = day + INTERVALS[w.s];
      }
    } else {
      w.s = Math.max(0, w.s - 1);
      w.due = day + 1;
    }
  }

  // Learned through the ladder, plus words marked as known while being learned.
  function learnedCount(state) {
    let n = 0;
    for (const id in state.words) {
      const w = state.words[id];
      if (w.known ? w.learnt : w.learned || w.done) n++;
    }
    return n;
  }

  function inProgressCount(state) {
    return inProgressIds(state).length;
  }

  // Rough daily minutes for a slider value: a new word ~15 s to meet plus ~5 s
  // for the same-day check, each review ~5 s.
  function estimateMinutes(newPerDay) {
    const seconds = newPerDay * 20 + newPerDay * (REVIEWS_PER_NEW_WORD - 1) * 5;
    return Math.max(1, Math.round(seconds / 60));
  }

  function weekStats(state, day) {
    let n = 0;
    let ms = 0;
    for (let d = day - 6; d <= day; d++) {
      const s = state.days[dayKey(d)];
      if (s) {
        n += s.n;
        ms += s.ms;
      }
    }
    return { newWords: n, minutesPerDay: Math.round(ms / 7 / 60000) };
  }

  function streak(state, day) {
    let d = day;
    const active = (x) => {
      const s = state.days[dayKey(x)];
      return s && (s.n > 0 || s.r > 0);
    };
    if (!active(d)) d -= 1; // today not started yet does not break the streak
    let n = 0;
    while (active(d)) {
      n++;
      d--;
    }
    return n;
  }

  const api = {
    INTERVALS, dayNumber, dayKey, emptyState, today, reviewLimit, dueReviews,
    nextNewWords, newLeftToday, markIntroduced, markKnown, markChecked,
    pendingChecks, todaysWords, inProgressIds, unmarkKnown, knownIds, learnedIds,
    markReviewed, learnedCount, inProgressCount, estimateMinutes, weekStats, streak,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.SRS = api;
})(this);
