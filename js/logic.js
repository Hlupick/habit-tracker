/* ============ логика: серии, статистика, достижения ============ */
(function (H) {
  "use strict";

  /* ---------- базовые состояния дня ---------- */
  H.value = (h, key) => (h.type === 'count' ? Math.max(0, Number(h.log[key]) || 0) : (h.log[key] ? 1 : 0));
  H.done = (h, key) => (h.type === 'count' ? H.value(h, key) >= (h.target || 1) : !!h.log[key]);
  H.isMin = (h, key) => !!h.min[key];
  H.isFrozen = (h, key) => !!h.frozen[key];
  H.satisfied = (h, key) => H.done(h, key) || H.isMin(h, key);

  H.scheduledOn = (h, date) => h.mode === 'week' || h.days.indexOf(H.wdIdx(date)) !== -1;

  H.activeHabits = () => H.state.habits.filter(h => !h.archived);

  H.freezeBudget = function (h, date) {
    const y = date.getFullYear(), m = date.getMonth();
    let used = 0;
    Object.keys(h.frozen).forEach(k => {
      const d = H.parseDK(k);
      if (d.getFullYear() === y && d.getMonth() === m) used++;
    });
    const max = 2;
    return { used, max, left: Math.max(0, max - used) };
  };

  /* ---------- неделя ---------- */
  H.countWeekDone = function (h, ws) {
    let n = 0;
    for (let i = 0; i < 7; i++) if (H.done(h, H.dk(H.addDays(ws, i)))) n++;
    return n;
  };

  H.countWeekFrozen = function (h, ws) {
    let n = 0;
    for (let i = 0; i < 7; i++) if (H.isFrozen(h, H.dk(H.addDays(ws, i)))) n++;
    return n;
  };

  H.weekMet = function (h, ws) {
    return H.countWeekDone(h, ws) + H.countWeekFrozen(h, ws) >= h.perWeek;
  };

  H.weekStats = function (h, ws) {
    const tk = H.todayKey();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = H.addDays(ws, i);
      const key = H.dk(date);
      days.push({
        date, key,
        scheduled: H.scheduledOn(h, date),
        done: H.done(h, key),
        min: H.isMin(h, key),
        frozen: H.isFrozen(h, key),
        value: H.value(h, key),
        note: h.notes[key] || '',
        future: key > tk
      });
    }
    const done = days.filter(d => d.done).length;
    const target = h.mode === 'week' ? h.perWeek : days.filter(d => d.scheduled).length;
    return { days, done, target };
  };

  /* ---------- серии ---------- */
  H.streak = function (h) {
    const today = H.todayStart();
    const tk = H.dk(today);

    if (h.mode === 'week') {
      let count = 0;
      let ws = H.startOfWeek(today);
      const cur = H.dk(ws);
      for (let g = 0; g < 400; g++) {
        if (H.weekMet(h, ws)) count++;
        else if (H.dk(ws) !== cur) break;
        ws = H.addDays(ws, -7);
        if (H.dk(H.addDays(ws, 6)) < h.createdAt) break;
      }
      return count;
    }

    let count = 0;
    let d = today;
    for (let g = 0; g < 4000; g++) {
      const key = H.dk(d);
      if (key < h.createdAt) break;
      if (h.days.indexOf(H.wdIdx(d)) !== -1) {
        if (H.satisfied(h, key)) count++;
        else if (H.isFrozen(h, key)) { /* пауза, серия не рвётся */ }
        else if (key !== tk) break;
      }
      d = H.addDays(d, -1);
    }
    return count;
  };

  H.best = function (h) {
    const tk = H.todayKey();
    if (h.mode === 'week') {
      let best = 0, cur = 0;
      let ws = H.startOfWeek(H.parseDK(h.createdAt));
      const curKey = H.dk(H.startOfWeek(H.todayStart()));
      for (let g = 0; g < 600 && H.dk(ws) <= tk; g++) {
        if (H.weekMet(h, ws)) { cur++; best = Math.max(best, cur); }
        else if (H.dk(ws) !== curKey) cur = 0;
        ws = H.addDays(ws, 7);
      }
      return best;
    }
    let best = 0, cur = 0;
    for (let d = H.parseDK(h.createdAt); H.dk(d) <= tk; d = H.addDays(d, 1)) {
      const key = H.dk(d);
      if (h.days.indexOf(H.wdIdx(d)) === -1) continue;
      if (H.satisfied(h, key)) { cur++; best = Math.max(best, cur); }
      else if (!H.isFrozen(h, key)) cur = 0;
    }
    return best;
  };

  H.streakAtRisk = function (h) {
    if (H.streak(h) <= 0) return false;
    const t = H.todayStart();
    const tk = H.dk(t);
    if (h.mode === 'days') return h.days.indexOf(H.wdIdx(t)) !== -1 && !H.satisfied(h, tk) && !H.isFrozen(h, tk);

    const done = H.countWeekDone(h, H.startOfWeek(t)) + H.countWeekFrozen(h, H.startOfWeek(t));
    if (done >= h.perWeek) return false;
    return h.perWeek - done >= 7 - H.wdIdx(t);
  };

  H.fireColor = function (s) {
    if (s >= 100) return '#be123c';
    if (s >= 30) return '#dc2626';
    if (s >= 14) return '#ea580c';
    if (s >= 7) return '#f97316';
    if (s >= 3) return '#f59e0b';
    return '#a1a1aa';
  };

  /* ---------- идеальные дни ---------- */
  H.dayRatio = function (key) {
    const date = H.parseDK(key);
    const habits = H.activeHabits();
    let due = 0, done = 0;
    habits.forEach(h => {
      if (!H.scheduledOn(h, date)) return;
      due++;
      if (H.done(h, key)) done++;
    });
    return { due, done };
  };

  H.perfectDay = function (key) {
    const r = H.dayRatio(key);
    return r.due > 0 && r.done === r.due;
  };

  H.weekPerfectDays = function (ws) {
    let n = 0;
    for (let i = 0; i < 7; i++) if (H.perfectDay(H.dk(H.addDays(ws, i)))) n++;
    return n;
  };

  /* ---------- челлендж недели ---------- */
  H.weekIndex = ws => Math.floor(H.addDays(ws, 4).getTime() / (7 * 864e5));

  H.challenge = function (ws) {
    const kind = ((H.weekIndex(ws) % 3) + 3) % 3;

    if (kind === 0) {
      let progress = 0;
      H.activeHabits().forEach(h => {
        for (let i = 0; i < 7; i++) if (H.satisfied(h, H.dk(H.addDays(ws, i)))) progress++;
      });
      return { id: 'marks', icon: '🎯', title: '12 отметок за неделю', target: 12, progress, desc: 'Любые выполненные привычки' };
    }

    if (kind === 1) {
      const progress = H.weekPerfectDays(ws);
      return { id: 'perfect', icon: '✨', title: '3 идеальных дня', target: 3, progress, desc: 'Закрыть все привычки дня' };
    }

    let progress = 0;
    for (let i = 0; i < 7; i++) {
      const key = H.dk(H.addDays(ws, i));
      if (H.activeHabits().some(h => H.satisfied(h, key))) progress++;
    }
    return { id: 'consistency', icon: '📅', title: '5 дней активности', target: 5, progress, desc: 'Отмечайтесь хотя бы раз в день' };
  };

  /* ---------- сводные показатели ---------- */
  H.insights = function () {
    if (H._insRev === H._rev && H._ins) return H._ins;

    const habits = H.activeHabits();
    let marks = 0, mins = 0, freezes = 0, notes = 0, countDays = 0;
    habits.forEach(h => {
      Object.keys(h.log).forEach(k => {
        if (H.done(h, k)) marks++;
        else if (h.type === 'count' && Number(h.log[k]) > 0) countDays++;
      });
      mins += Object.keys(h.min).length;
      freezes += Object.keys(h.frozen).length;
      notes += Object.keys(h.notes).length;
    });

    let bestStreak = 0, maxCurrent = 0;
    habits.forEach(h => {
      bestStreak = Math.max(bestStreak, H.best(h));
      maxCurrent = Math.max(maxCurrent, H.streak(h));
    });

    // идеальные дни
    let perfect = 0, day5 = false;
    if (habits.length) {
      const start = habits.reduce((m, h) => (h.createdAt < m ? h.createdAt : m), habits[0].createdAt);
      const end = H.todayKey();
      for (let d = H.parseDK(start), g = 0; H.dk(d) <= end && g < 4000; d = H.addDays(d, 1), g++) {
        const key = H.dk(d);
        const r = H.dayRatio(key);
        if (r.due > 0 && r.done === r.due) perfect++;
        if (r.done >= 5) day5 = true;
      }
    }

    let comeback = false;
    const tk = H.todayKey();
    const y1 = H.dk(H.addDays(H.todayStart(), -1));
    const y2 = H.dk(H.addDays(H.todayStart(), -2));
    habits.forEach(h => {
      if (comeback) return;
      if (!H.satisfied(h, tk) || H.satisfied(h, y1) || H.satisfied(h, y2)) return;
      const older = Object.keys(h.log).some(k => k < y2 && h.log[k]);
      if (older && h.createdAt <= y2) comeback = true;
    });

    const achievementsCount = Object.keys(H.state.achievements || {}).length;
    const xp = marks * 10 + mins * 4 + perfect * 20 + achievementsCount * 30;
    const level = Math.floor(xp / 150) + 1;

    const ins = {
      marks, mins, freezes, notes, countDays, perfect, day5, comeback,
      bestStreak, maxCurrent, level, xp,
      levelXp: xp % 150, levelNeed: 150,
      habits: habits.length,
      challengeDone: H.challenge(H.startOfWeek(H.todayStart())).progress >= H.challenge(H.startOfWeek(H.todayStart())).target
    };
    H._ins = ins;
    H._insRev = H._rev;
    return ins;
  };

  H.levelInfo = function () {
    const ins = H.insights();
    return { level: ins.level, xp: ins.xp, inLevel: ins.levelXp, need: ins.levelNeed, pct: Math.round(ins.levelXp / ins.levelNeed * 100) };
  };

  /* ---------- достижения ---------- */
  H.ACHIEVEMENTS = [
    { id: 'first', icon: '🌱', title: 'Первые шаги', desc: 'Первая выполненная привычка', test: i => i.marks >= 1 },
    { id: 'streak3', icon: '⚡', title: 'Разгон', desc: '3 дня подряд', test: i => i.bestStreak >= 3 },
    { id: 'week', icon: '🗓', title: 'Неделя силы', desc: '7 дней подряд', test: i => i.bestStreak >= 7 },
    { id: 'm14', icon: '🔥', title: 'Две недели', desc: '14 дней подряд', test: i => i.bestStreak >= 14 },
    { id: 'm30', icon: '🏅', title: 'Месяц дисциплины', desc: '30 дней подряд', test: i => i.bestStreak >= 30 },
    { id: 'm100', icon: '💎', title: 'Сотка', desc: '100 дней подряд', test: i => i.bestStreak >= 100 },
    { id: 'perfect', icon: '✨', title: 'Идеальный день', desc: 'Закрыть все привычки дня', test: i => i.perfect >= 1 },
    { id: 'pw', icon: '🏆', title: 'Идеальная неделя', desc: 'Семь идеальных дней подряд', test: i => i.perfectWeek },
    { id: 'marks100', icon: '📌', title: 'Сто отметок', desc: '100 выполненных дней', test: i => i.marks >= 100 },
    { id: 'habits5', icon: '🧩', title: 'Коллекционер', desc: '5 привычек одновременно', test: i => i.habits >= 5 },
    { id: 'notes10', icon: '📝', title: 'Дневник', desc: '10 заметок к дням', test: i => i.notes >= 10 },
    { id: 'freeze', icon: '❄️', title: 'Страховка', desc: 'Использовать заморозку', test: i => i.freezes >= 1 },
    { id: 'comeback', icon: '💪', title: 'Возвращение', desc: 'Вернуться после паузы', test: i => i.comeback },
    { id: 'day5', icon: '🌟', title: 'Пять за день', desc: '5 привычек за один день', test: i => i.day5 },
    { id: 'level5', icon: '⭐', title: 'Пятый уровень', desc: 'Набрать 600 опыта', test: i => i.xp >= 600 },
    { id: 'challenge', icon: '🎯', title: 'Челлендж', desc: 'Выполнить челлендж недели', test: i => i.challengeDone }
  ];

  H.achievementState = function () {
    const ins = H.insights();
    // идеальная неделя считается по прошлым неделям
    ins.perfectWeek = false;
    const habits = H.activeHabits();
    if (habits.length) {
      const start = H.startOfWeek(H.parseDK(habits.reduce((m, h) => (h.createdAt < m ? h.createdAt : m), habits[0].createdAt)));
      const cur = H.startOfWeek(H.todayStart());
      for (let ws = start; H.dk(ws) < H.dk(cur); ws = H.addDays(ws, 7)) {
        let dueDays = 0, perf = 0;
        for (let i = 0; i < 7; i++) {
          const key = H.dk(H.addDays(ws, i));
          const r = H.dayRatio(key);
          if (r.due > 0) { dueDays++; if (r.done === r.due) perf++; }
        }
        if (dueDays >= 5 && perf === dueDays) { ins.perfectWeek = true; break; }
      }
    }

    return H.ACHIEVEMENTS.map(a => ({
      id: a.id, icon: a.icon, title: a.title, desc: a.desc,
      unlocked: !!H.state.achievements[a.id],
      date: H.state.achievements[a.id] || null,
      ready: !!a.test(ins)
    }));
  };

  H.checkAchievements = function (silent) {
    const list = H.achievementState();
    const fresh = [];
    list.forEach(a => {
      if (a.ready && !H.state.achievements[a.id]) {
        H.state.achievements[a.id] = H.todayKey();
        fresh.push(a);
      }
    });
    if (fresh.length) {
      H.save({ noBackup: true });
      if (!silent) {
        fresh.forEach(a => H.toast(`${a.icon} Достижение: ${a.title}`));
        H.confetti();
      }
    }
    return fresh;
  };

  /* ---------- сохранение изменения ---------- */
  H.commit = function (opts) {
    H._rev++;
    H.save();
    if (!(opts && opts.silent)) H.checkAchievements(!!(opts && opts.silentAch));
    H.render();
  };
})(window.H);
