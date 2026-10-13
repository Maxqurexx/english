// Screens and session flow. State is saved to localStorage after every answer.

(function () {
  const STORE_KEY = "english.v1";
  const WORDS = window.WORDS_RAW.map(([rank, en, ru, assoc, ex, exRu, icon]) => ({
    id: rank, rank, en, ru, assoc, ex, exRu, icon,
  })).sort((a, b) => a.rank - b.rank);
  const BY_ID = new Map(WORDS.map((w) => [w.id, w]));
  const app = document.getElementById("app");

  let state = load();
  let session = null;
  let test = null;
  let lastAction = 0;

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(SRS.emptyState(), JSON.parse(raw));
    } catch (e) { /* start fresh */ }
    return SRS.emptyState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = () => SRS.dayNumber();
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function render(html) {
    app.innerHTML = html;
    app.classList.remove("fade-in");
    void app.offsetWidth; // restart the fade animation
    app.classList.add("fade-in");
    window.scrollTo(0, 0);
  }
  function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  function trackTime() {
    const now = Date.now();
    if (lastAction) SRS.today(state, day()).ms += Math.min(now - lastAction, 60000);
    lastAction = now;
  }

  // ---------- speech ----------
  let voice = null;
  function pickVoice() {
    const voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    const prefer = ["Samantha", "Google US English", "Ava", "Allison", "Daniel", "Karen"];
    voice = prefer.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean)
      || voices.find((v) => /en[-_]US/i.test(v.lang)) || voices[0] || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
  }
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    if (voice) u.voice = voice;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  // ---------- welcome + placement test ----------
  function showWelcome() {
    render(`
      <div class="hero" style="align-items:flex-start;text-align:left;gap:16px">
        <h1 class="title">English</h1>
        <p class="lead">Самые нужные слова, которые остаются в голове.</p>
        <p class="lead" style="color:var(--muted)">Сначала короткий тест на 2–3 минуты, чтобы не учить то, что ты уже знаешь. Отмечай слова, которые точно понимаешь. Не уверен — жми «Не знаю».</p>
      </div>
      <div class="actions"><button class="btn" id="start">Начать тест</button></div>
    `);
    on("start", startTest);
  }

  function startTest() {
    test = Placement.create(WORDS, window.PSEUDOWORDS);
    showTestItem();
  }

  function showTestItem() {
    const item = Placement.current(test);
    if (!item) return finishTest();
    render(`
      <div class="bar"><span>Проверка уровня</span><span></span></div>
      <div class="progress"><i style="width:${Math.round(Placement.progress(test) * 100)}%"></i></div>
      <div class="hero"><div class="word">${esc(item.text)}</div></div>
      <div class="actions">
        <button class="btn ghost" id="no">Не знаю</button>
        <button class="btn" id="yes">Знаю</button>
      </div>
    `);
    on("no", () => { Placement.answer(test, false); showTestItem(); });
    on("yes", () => { Placement.answer(test, true); showTestItem(); });
  }

  function finishTest() {
    const below = Placement.knownBelow(test);
    state.placement = { done: true, knownBelow: below };
    save();
    const text = below
      ? `Похоже, ты уже знаешь примерно <b>${below}</b> самых частых слов. Их пропускаем и начинаем со следующих.`
      : "Начнём с самых частых слов. Если попадётся знакомое, жми «Уже знаю», и оно больше не появится.";
    render(`
      <div class="hero" style="align-items:flex-start;text-align:left;gap:16px">
        <h1 class="title">Готово</h1>
        <p class="lead">${text}</p>
      </div>
      <div class="actions"><button class="btn" id="go">Начать учиться</button></div>
    `);
    on("go", showHome);
  }

  // ---------- home ----------
  function showHome() {
    const d = day();
    const newLeft = Math.min(SRS.newLeftToday(state, d), SRS.nextNewWords(state, WORDS, 1e9).length);
    const reviews = SRS.dueReviews(state, d).length;
    const nothingLeft = newLeft === 0 && reviews === 0;
    const streak = SRS.streak(state, d);
    const learned = SRS.learnedCount(state);
    render(`
      <div class="bar">
        <span>${streak ? `${streak} ${plural(streak, "день", "дня", "дней")} подряд` : ""}</span>
        <button class="icon-btn" id="settings" aria-label="Настройки"><i class="ti ti-settings"></i></button>
      </div>
      <div class="hero">
        <div class="big">${learned}</div>
        <div class="label">${plural(learned, "слово выучено", "слова выучено", "слов выучено")}</div>
      </div>
      <div class="stats">
        <div class="stat"><b>${SRS.inProgressCount(state)}</b><span>учу сейчас</span></div>
        <div class="stat"><b>${newLeft}</b><span>новых на сегодня</span></div>
        <div class="stat"><b>${reviews}</b><span>повторить</span></div>
      </div>
      <div class="actions" style="flex-direction:column">
        ${nothingLeft
          ? `<button class="btn" id="more">Ещё ${state.settings.newPerDay} ${plural(state.settings.newPerDay, "слово", "слова", "слов")}</button>`
          : `<button class="btn" id="start">Начать</button>`}
        <button class="link" id="share">Поделиться прогрессом</button>
      </div>
    `);
    on("settings", showSettings);
    on("start", () => startSession(false));
    on("more", () => startSession(true));
    on("share", shareProgress);
  }

  // ---------- session ----------
  function startSession(extra) {
    const d = day();
    const count = extra ? state.settings.newPerDay : SRS.newLeftToday(state, d);
    const fresh = SRS.nextNewWords(state, WORDS, count).filter((id) => BY_ID.has(id));
    const reviews = SRS.dueReviews(state, d).filter((id) => BY_ID.has(id));
    const dir = () => (Math.random() < 0.5 ? "en" : "ru");
    const queue = [
      ...fresh.map((id) => ({ type: "intro", id })),
      ...shuffle(fresh.slice()).map((id) => ({ type: "check", id, dir: dir() })),
      ...shuffle(reviews).map((id) => ({ type: "review", id, dir: dir() })),
    ];
    if (!queue.length) {
      if (!extra && SRS.nextNewWords(state, WORDS, 1).length) return startSession(true);
      return showAllDone();
    }
    session = { queue, i: 0, newCount: 0, reviewCount: 0, recalled: 0 };
    lastAction = Date.now();
    showItem();
  }

  function phaseInfo() {
    const item = session.queue[session.i];
    const group = item.type === "intro" ? ["intro"] : item.type === "check" ? ["check"] : ["review", "again"];
    const all = session.queue.filter((q) => group.includes(q.type));
    const pos = session.queue.slice(0, session.i + 1).filter((q) => group.includes(q.type)).length;
    const name = item.type === "intro" ? "Новые слова" : item.type === "check" ? "Проверка" : "Повторение";
    return { name, pos, total: all.length };
  }

  function topBar() {
    const p = phaseInfo();
    const pct = Math.round((session.i / session.queue.length) * 100);
    return `
      <div class="bar">
        <button class="icon-btn" id="close" aria-label="На главную"><i class="ti ti-chevron-left"></i></button>
        <span>${p.name} · ${p.pos} / ${p.total}</span>
        <span style="width:24px"></span>
      </div>
      <div class="progress"><i style="width:${pct}%"></i></div>`;
  }

  function wordFace(w, withHint) {
    return `
      <i class="ti ti-${esc(w.icon || "point")} pic" aria-hidden="true"></i>
      <div class="word">${esc(w.en)}</div>
      <button class="speak" id="speak" aria-label="Послушать"><i class="ti ti-volume"></i></button>
      <div class="trans">${esc(w.ru)}</div>
      <div class="assoc">${esc(w.assoc)}</div>
      <div class="example">${esc(w.ex)}<span>${esc(w.exRu)}</span></div>
      ${withHint || ""}`;
  }

  function showItem() {
    if (session.i >= session.queue.length) return finishSession();
    const item = session.queue[session.i];
    const w = BY_ID.get(item.id);
    if (item.type === "intro") return showIntro(w);
    showRecall(w, item);
  }

  function showIntro(w) {
    render(`
      ${topBar()}
      <div class="stage">
        <button class="know-link" id="known">Уже знаю</button>
        <div class="card flat"><div class="face">${wordFace(w)}</div></div>
      </div>
      <div class="actions"><button class="btn" id="next">Дальше</button></div>
    `);
    speak(w.en);
    on("speak", () => speak(w.en));
    on("close", leaveSession);
    on("known", () => {
      trackTime();
      SRS.markKnown(state, w.id);
      session.queue = session.queue.filter((q, k) => k <= session.i || q.id !== w.id);
      save();
      advance();
    });
    on("next", () => {
      trackTime();
      SRS.markIntroduced(state, w.id, day());
      session.newCount += 1;
      save();
      advance();
    });
  }

  function showRecall(w, item) {
    const ruFirst = item.dir === "ru";
    const front = ruFirst
      ? `<div class="label">Как сказать по-английски?</div><div class="word ru">${esc(w.ru)}</div>`
      : `<div class="label">Что это значит?</div><div class="word">${esc(w.en)}</div>
         <button class="speak" id="speak-front" aria-label="Послушать"><i class="ti ti-volume"></i></button>`;
    render(`
      ${topBar()}
      <div class="stage">
        <button class="know-link" id="known">Уже знаю</button>
        <div class="card" id="card">
          <div class="face front">${front}<div class="tap-hint">Нажми, чтобы перевернуть</div></div>
          <div class="face back">${wordFace(w)}</div>
        </div>
      </div>
      <div class="actions" id="answers" style="visibility:hidden">
        <button class="btn ghost" id="forgot">Не вспомнил</button>
        <button class="btn" id="recalled">Вспомнил</button>
      </div>
    `);
    if (!ruFirst) speak(w.en);
    const card = document.getElementById("card");
    let flipped = false;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".speak")) return;
      if (flipped) return;
      flipped = true;
      card.classList.add("flipped");
      document.getElementById("answers").style.visibility = "visible";
      if (ruFirst) speak(w.en);
    });
    on("speak", () => speak(w.en));
    on("speak-front", () => speak(w.en));
    on("close", leaveSession);
    on("known", () => {
      trackTime();
      SRS.markKnown(state, w.id);
      session.queue = session.queue.filter((q, k) => k <= session.i || q.id !== w.id);
      save();
      advance();
    });
    on("forgot", () => answer(item, false));
    on("recalled", () => answer(item, true));
  }

  function answer(item, recalled) {
    trackTime();
    const d = day();
    if (item.type === "check") SRS.markChecked(state, item.id, d);
    if (item.type === "review") {
      SRS.markReviewed(state, item.id, recalled, d);
      session.reviewCount += 1;
    }
    if (recalled) session.recalled += 1;
    // A missed word comes back once more at the end of the session.
    if (!recalled && item.type !== "again") {
      session.queue.push({ type: "again", id: item.id, dir: item.dir === "en" ? "ru" : "en" });
    }
    save();
    advance();
  }

  function advance() {
    session.i += 1;
    showItem();
  }

  function leaveSession() {
    trackTime();
    save();
    session = null;
    showHome();
  }

  function finishSession() {
    const s = session;
    session = null;
    save();
    const learned = SRS.learnedCount(state);
    render(`
      <div class="hero" style="gap:16px">
        <h1 class="title">Готово</h1>
        <p class="lead">${s.newCount ? `Новых слов: <b>${s.newCount}</b>. ` : ""}${s.reviewCount ? `Повторено: <b>${s.reviewCount}</b>. ` : ""}Всего выучено: <b>${learned}</b>.</p>
      </div>
      <div class="actions" style="flex-direction:column">
        <button class="btn" id="home">На главную</button>
        <button class="link" id="share">Поделиться прогрессом</button>
      </div>
    `);
    on("home", showHome);
    on("share", shareProgress);
  }

  function showAllDone() {
    render(`
      <div class="hero" style="gap:16px">
        <h1 class="title">Слова закончились</h1>
        <p class="lead">Ты прошёл все слова, которые сейчас есть в приложении. Скоро добавим новые.</p>
      </div>
      <div class="actions"><button class="btn" id="home">На главную</button></div>
    `);
    on("home", showHome);
  }

  // ---------- settings ----------
  function showSettings() {
    const n = state.settings.newPerDay;
    render(`
      <div class="bar">
        <button class="icon-btn" id="back" aria-label="Назад"><i class="ti ti-chevron-left"></i></button>
        <span>Настройки</span>
        <span style="width:24px"></span>
      </div>
      <div class="section">
        <div class="row"><span>Новых слов в день</span><b id="n">${n}</b></div>
        <input type="range" id="slider" min="5" max="50" step="1" value="${n}" aria-label="Новых слов в день">
        <div class="label" style="text-align:left" id="est"></div>
      </div>
      <div class="section">
        <button class="btn ghost" id="retest">Пройти тест уровня заново</button>
      </div>
    `);
    const slider = document.getElementById("slider");
    const update = () => {
      const v = Number(slider.value);
      document.getElementById("n").textContent = v;
      document.getElementById("est").textContent = `Примерно ${SRS.estimateMinutes(v)} мин в день вместе с повторениями`;
    };
    update();
    slider.addEventListener("input", update);
    slider.addEventListener("change", () => {
      state.settings.newPerDay = Number(slider.value);
      save();
    });
    on("back", showHome);
    on("retest", startTest);
  }

  // ---------- share ----------
  async function shareProgress() {
    const d = day();
    const week = SRS.weekStats(state, d);
    const learned = SRS.learnedCount(state);
    const W = 1080, H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d");
    try {
      await Promise.all([document.fonts.load('600 80px "Unbounded"'), document.fonts.load('500 40px "Manrope"')]);
    } catch (e) { /* fall back to system fonts */ }
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#1d1d1f";
    c.font = '600 56px "Unbounded", sans-serif';
    c.fillText("ENGLISH", 96, 170);
    c.fillStyle = "#86868b";
    c.font = '500 40px "Manrope", sans-serif';
    c.fillText("Мой прогресс за неделю", 96, 240);
    const rows = [
      [String(week.newWords), "новых слов за неделю"],
      [String(week.minutesPerDay), "минут в день"],
      [String(learned), "слов выучено всего"],
    ];
    rows.forEach(([num, label], k) => {
      const y = 520 + k * 270;
      c.fillStyle = "#1d1d1f";
      c.font = '600 150px "Unbounded", sans-serif';
      c.fillText(num, 96, y);
      c.fillStyle = "#86868b";
      c.font = '500 40px "Manrope", sans-serif';
      c.fillText(label, 100, y + 64);
    });
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = new File([blob], "english-progress.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { /* user closed the share sheet */ }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "english-progress.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- start ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  if (state.placement.done) showHome();
  else showWelcome();
})();
