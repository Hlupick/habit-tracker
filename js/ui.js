/* ============ интерфейс ============ */
(function (H) {
  "use strict";

  H.view = 'week';
  H.filter = 'all';
  H.viewWeek = null;
  H.viewMonth = null;
  H._dragId = null;

  const SHORT_VAL = v => (v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace('.', ',') + 'к' : String(v));

  /* ================= общий рендер ================= */
  H.render = function () {
    const st = H.state;
    if (!H.viewWeek) H.viewWeek = H.startOfWeek(H.todayStart());
    if (!H.viewMonth) { const t = H.todayStart(); H.viewMonth = new Date(t.getFullYear(), t.getMonth(), 1); }

    document.documentElement.dataset.theme = st.settings.theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('compact', !!st.settings.compact);

    const t = H.todayStart();
    const tk = H.dk(t);
    const due = H.activeHabits().filter(h => H.scheduledOn(h, t));
    const doneToday = due.filter(h => H.done(h, tk)).length;

    H.$('#topSub').textContent = `${H.DAYS_FULL[H.wdIdx(t)]}, ${t.getDate()} ${H.MONTHS[t.getMonth()]} · ${doneToday} из ${due.length}`;
    H.$('#themeBtn').textContent = st.settings.theme === 'dark' ? '☀️' : '🌙';

    const lv = H.levelInfo();
    const chip = H.$('#levelChip');
    chip.innerHTML = `<span class="lv">${lv.level}</span><i class="lv-bar"><b style="width:${lv.pct}%"></b></i>`;
    chip.title = `Уровень ${lv.level} · ${lv.xp} опыта · до следующего ${lv.need - lv.inLevel}`;

    H.$$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === H.view));
    H.$$('.mnav').forEach(b => b.classList.toggle('active', b.dataset.view === H.view));
    H.$$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + H.view));

    if (H.view === 'week') H.renderWeek();
    else if (H.view === 'today') H.renderToday();
    else if (H.view === 'month') H.renderMonth();
    else H.renderStats();
  };

  /* ================= неделя ================= */
  H.renderWeek = function () {
    const st = H.state;
    const ws = H.viewWeek;
    const tk = H.todayKey();
    const curWs = H.dk(H.startOfWeek(H.todayStart()));
    const cats = Array.from(new Set(H.activeHabits().map(h => h.category).filter(Boolean)));
    const visible = H.activeHabits().filter(h => H.filter === 'all' || h.category === H.filter);

    H.$('#view-week').innerHTML = `
      ${H.summaryHTML()}
      ${H.heroHTML()}
      ${H.challengeHTML(ws)}
      <div class="toolbar">
        <div class="week-nav">
          <button class="icon-btn" data-act="prevWeek" aria-label="Предыдущая неделя">‹</button>
          <div class="week-label">${H.weekLabel(ws)}</div>
          <button class="icon-btn" data-act="nextWeek" aria-label="Следующая неделя" ${H.dk(ws) >= curWs ? 'disabled' : ''}>›</button>
        </div>
        <div class="toolbar-right">
          <button class="btn" data-act="todayWeek" ${H.dk(ws) === curWs ? 'disabled' : ''}>Сегодня</button>
          <button class="btn primary" data-act="newHabit">+ Привычка</button>
        </div>
      </div>
      ${H.tilesHTML()}
      ${cats.length ? `<div class="filters">
        <button class="chip-filter ${H.filter === 'all' ? 'on' : ''}" data-act="filter" data-cat="all">Все</button>
        ${cats.map(c => `<button class="chip-filter ${H.filter === c ? 'on' : ''}" data-act="filter" data-cat="${H.esc(c)}">${H.esc(c)}</button>`).join('')}
      </div>` : ''}
      <div class="board">
        <div class="board-scroll"><div class="inner">
          ${H.gridHeadHTML(ws, tk)}
          <div class="habits" id="habits">
            ${visible.length
              ? visible.map(h => H.habitRowHTML(h, ws, tk)).join('')
              : (H.activeHabits().length
                ? `<div class="empty"><div class="big">🔍</div><p>В этой категории пока пусто.</p><button class="btn" data-act="filter" data-cat="all" style="margin-top:12px">Показать все</button></div>`
                : H.emptyWeekHTML())}
          </div>
          <div class="add-row">
            <input class="quick-emoji" id="quickEmoji" value="✨" maxlength="4" aria-label="Иконка">
            <input class="quick-name" id="quickName" maxlength="60" autocomplete="off" placeholder="Новая привычка — название и Enter">
            <button class="btn primary" data-act="quickAdd" style="height:32px">Добавить</button>
          </div>
        </div></div>
      </div>`;
  };

  H.emptyWeekHTML = () => `
    <div class="empty">
      <div class="big">🌱</div>
      <p><b>Пока нет привычек.</b><br>Добавьте первую или возьмите готовый набор.</p>
      <button class="btn" data-act="templates" style="margin-top:12px">Готовые наборы</button>
    </div>`;

  H.gridHeadHTML = function (ws, tk) {
    let out = '<div></div>';
    for (let i = 0; i < 7; i++) {
      const d = H.addDays(ws, i);
      const isToday = H.dk(d) === tk;
      out += `<div class="head-day${isToday ? ' today' : ''}">
        <span class="name">${H.DAYS_SHORT[H.wdIdx(d)]}</span>
        <span class="num">${d.getDate()}</span>
      </div>`;
    }
    return `<div class="week-head">${out}</div>`;
  };

  H.tilesHTML = function () {
    const tk = H.todayKey();
    const t = H.todayStart();
    const habits = H.activeHabits();
    const due = habits.filter(h => H.scheduledOn(h, t));
    const doneToday = habits.filter(h => H.done(h, tk)).length;
    const ins = H.insights();

    let planned = 0, done = 0;
    habits.forEach(h => {
      if (h.mode === 'week') {
        planned += h.perWeek;
        done += Math.min(h.perWeek, H.countWeekDone(h, H.viewWeek));
      } else {
        for (let i = 0; i < 7; i++) {
          const d = H.addDays(H.viewWeek, i);
          const k = H.dk(d);
          if (k > tk) continue;
          if (h.days.indexOf(H.wdIdx(d)) !== -1) { planned++; if (H.done(h, k)) done++; }
        }
      }
    });
    const pct = planned ? Math.round(done / planned * 100) : 0;

    return `<section class="stats">
      <div class="stat"><div class="stat-label">Привычек</div><div class="stat-value">${habits.length}</div></div>
      <div class="stat"><div class="stat-label">Сегодня</div><div class="stat-value">${doneToday}<small>/ ${due.length}</small></div></div>
      <div class="stat" title="Лучший результат за всё время"><div class="stat-label">Рекорд</div><div class="stat-value">${ins.bestStreak}</div></div>
      <div class="stat"><div class="stat-label">Неделя</div><div class="stat-value">${pct}%</div></div>
    </section>`;
  };

  H.heroHTML = function () {
    const habits = H.activeHabits();
    if (!habits.length) return '';
    let top = habits[0], topCur = H.streak(top);
    habits.forEach(h => { const s = H.streak(h); if (s > topCur) { topCur = s; top = h; } });

    const record = H.best(top);
    const fire = H.fireColor(topCur);
    const risk = H.streakAtRisk(top);
    const chips = [3, 7, 14, 30, 60, 100].map(m =>
      `<span class="chip${topCur >= m ? ' on' : ''}" title="${m} дней подряд">${m}</span>`).join('');

    let note, warn = false;
    if (risk) { note = 'Отметьте сегодня, чтобы не потерять серию'; warn = true; }
    else if (topCur > 0 && topCur < record) note = `До рекорда ${record} — ${record - topCur}`;
    else if (topCur > 0) note = 'Это ваш лучший результат. Так держать!';
    else note = 'Отметьте день — и начнётся серия';

    const sub = topCur > 0
      ? `${H.esc(top.emoji)} ${H.esc(top.name)} · рекорд ${record}`
      : 'Пока нет активной серии';

    return `<section class="hero${warn ? ' risk' : ''}${topCur === 0 ? ' zero' : ''}" style="--fire:${fire}">
      <div class="hero-left">
        <span class="hero-flame">🔥</span>
        <div class="hero-num">${topCur}</div>
        <div class="hero-labels">
          <div class="hero-label">Текущая серия</div>
          <div class="hero-sub">${sub}</div>
        </div>
      </div>
      <div class="hero-right">
        <div class="hero-chips">${chips}</div>
        <div class="hero-note${warn ? ' warn' : ''}">${note}</div>
      </div>
    </section>`;
  };

  H.challengeHTML = function (ws) {
    const c = H.challenge(ws);
    const done = c.progress >= c.target;
    const pct = Math.min(100, Math.round(c.progress / c.target * 100));
    return `<section class="challenge${done ? ' done' : ''}">
      <div class="ch-icon">${done ? '✅' : c.icon}</div>
      <div class="ch-body">
        <div class="ch-top"><b>${c.title}</b><span>${Math.min(c.progress, c.target)}/${c.target}</span></div>
        <div class="ch-bar"><i style="width:${pct}%"></i></div>
        <div class="ch-desc">${done ? 'Челлендж недели выполнен 🎉' : c.desc}</div>
      </div>
    </section>`;
  };

  H.summaryHTML = function () {
    const st = H.state;
    const curWs = H.startOfWeek(H.todayStart());
    if (H.dk(H.viewWeek) !== H.dk(curWs)) return '';
    if (st.settings.lastSummary === H.dk(curWs)) return '';

    const prev = H.addDays(curWs, -7);
    let marks = 0;
    H.activeHabits().forEach(h => {
      for (let i = 0; i < 7; i++) if (H.satisfied(h, H.dk(H.addDays(prev, i)))) marks++;
    });
    if (!marks) return '';
    const perfect = H.weekPerfectDays(prev);

    return `<section class="summary">
      <div class="sum-text">
        <b>Итоги прошлой недели</b>
        <span>${marks} ${plural(marks, 'отметка', 'отметки', 'отметок')}${perfect ? ` · ${perfect} идеальных ${plural(perfect, 'день', 'дня', 'дней')}` : ''}</span>
      </div>
      <button class="icon-btn ghost" data-act="dismissSummary" aria-label="Скрыть">✕</button>
    </section>`;
  };

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  H.plural = plural;

  /* ---------- строка привычки ---------- */
  H.habitRowHTML = function (h, ws, tk) {
    const w = H.weekStats(h, ws);
    const st = H.streak(h);
    const best = H.best(h);
    const risk = H.streakAtRisk(h);
    const fire = H.fireColor(st);
    const pct = w.target ? Math.min(100, Math.round(w.done / w.target * 100)) : 0;
    const budget = H.freezeBudget(h, H.todayStart());

    const cells = w.days.map((d, i) => H.cellHTML(h, d, tk, risk)).join('');

    const badge = st > 0
      ? `<span class="streak${risk ? ' risk' : ''}" style="--fire:${fire}" title="Серия: ${st} · рекорд: ${best}">🔥 ${st}</span>`
      : '';

    const meta = h.type === 'count'
      ? `<span>${w.done}/${w.target} · цель ${SHORT_VAL(h.target)}${h.unit ? ' ' + H.esc(h.unit) : ''}</span>`
      : `<span>${w.done}/${w.target}</span>`;

    return `<div class="habit" data-id="${h.id}" style="--c:${h.color}">
      <div class="h-main" draggable="true">
        <div class="h-emoji" style="background:${H.hexA(h.color, .13)}">${H.esc(h.emoji)}</div>
        <div class="h-text">
          <div class="h-name-row">
            <div class="h-name" title="${H.esc(h.name)}">${H.esc(h.name)}</div>
            ${badge}
          </div>
          <div class="h-meta" title="Выполнено ${w.done} из ${w.target}">
            ${meta}${h.category ? `<span class="sep">·</span><span class="cat">${H.esc(h.category)}</span>` : ''}
            <span class="h-bar"><i style="width:${pct}%;background:${h.color}"></i></span>
          </div>
        </div>
        <div class="h-tools">
          <button class="mini" data-act="editHabit" data-id="${h.id}" title="Изменить">✎</button>
          <button class="mini" data-act="archiveHabit" data-id="${h.id}" title="В архив">⤵</button>
        </div>
      </div>
      ${cells}
    </div>`;
  };

  H.cellHTML = function (h, d, tk, risk) {
    const cls = ['cell'];
    if (d.done) cls.push('done');
    else if (d.min) cls.push('min');
    else if (d.frozen) cls.push('frozen');
    if (d.future) cls.push('future');
    if (!d.scheduled) cls.push('off');
    if (d.key === tk) cls.push('today');
    if (d.note) cls.push('has-note');
    if (risk && d.key === tk && !d.done && !d.min && !d.frozen) cls.push('risk');

    let style = `--c:${h.color}`;
    if (h.type === 'count' && !d.done && d.value > 0) {
      const f = Math.min(100, Math.round(d.value / (h.target || 1) * 100));
      style += `;background:linear-gradient(to top, ${H.hexA(h.color, .28)} ${f}%, transparent ${f}%)`;
    }

    const bits = [];
    if (d.done) bits.push('выполнено');
    else if (d.min) bits.push('минимум');
    else if (d.frozen) bits.push('заморозка');
    else if (h.type === 'count' && d.value > 0) bits.push(`${d.value} из ${h.target}`);
    if (d.note) bits.push('заметка');

    const label = `${H.DAYS_FULL[H.wdIdx(d.date)]}, ${d.date.getDate()} ${H.MONTHS[d.date.getMonth()]}${bits.length ? ' — ' + bits.join(', ') : ''}`;

    let inner = '';
    if (d.done) inner = H.CHECK_SVG;
    else if (d.min) inner = '<span class="cell-mark">½</span>';
    else if (d.frozen) inner = '<span class="cell-mark">❄</span>';

    const disabled = d.future || !d.scheduled;
    return `<button class="${cls.join(' ')}" style="${style}" data-act="cell" data-id="${h.id}" data-key="${d.key}"
      aria-label="${label}" ${disabled ? 'disabled' : ''}>${inner}${d.note ? '<i class="note-dot"></i>' : ''}</button>`;
  };

  /* ================= сегодня ================= */
  H.renderToday = function () {
    const t = H.todayStart();
    const tk = H.dk(t);
    const habits = H.activeHabits();
    const due = habits.filter(h => H.scheduledOn(h, t));
    const done = due.filter(h => H.done(h, tk)).length;

    const list = due.length ? due.map(h => {
      const st = H.streak(h);
      const fire = H.fireColor(st);
      const val = H.value(h, tk);
      const isDone = H.done(h, tk);
      const isMin = H.isMin(h, tk);
      const pct = h.type === 'count' ? Math.min(100, Math.round(val / (h.target || 1) * 100)) : (isDone ? 100 : 0);

      return `<div class="tcard${isDone ? ' done' : ''}${isMin ? ' min' : ''}" style="--c:${h.color}">
        <div class="tc-head">
          <span class="tc-emoji" style="background:${H.hexA(h.color, .13)}">${H.esc(h.emoji)}</span>
          <div class="tc-name">
            <b>${H.esc(h.name)}</b>
            <span>${h.type === 'count'
              ? `${SHORT_VAL(val)} / ${SHORT_VAL(h.target)}${h.unit ? ' ' + H.esc(h.unit) : ''}`
              : (isMin ? 'минимум засчитан' : isDone ? 'выполнено' : 'не отмечено')}</span>
          </div>
          ${st > 0 ? `<span class="streak" style="--fire:${fire}">🔥 ${st}</span>` : ''}
          <button class="mini" data-act="dayMenu" data-id="${h.id}" data-key="${tk}" title="Ещё">⋯</button>
        </div>
        ${h.type === 'count' ? `<div class="tc-bar"><i style="width:${pct}%"></i></div>` : ''}
        <div class="tc-actions">
          <button class="btn ${isDone ? 'primary' : ''}" data-act="quickDone" data-id="${h.id}">
            ${isDone ? '✓ Выполнено' : h.type === 'count' ? '+ Добавить' : 'Отметить'}
          </button>
          ${isDone && h.type === 'count' ? '' : `<button class="btn" data-act="dayMenu" data-id="${h.id}" data-key="${tk}">Детали</button>`}
        </div>
      </div>`;
    }).join('') : (habits.length
      ? `<div class="empty"><div class="big">🌤</div><p>На сегодня свободно — привычек по расписанию нет.</p></div>`
      : `<div class="empty"><div class="big">🌱</div><p>Пока нет привычек.<br>Добавьте первую или возьмите готовый набор.</p>
         <button class="btn" data-act="templates" style="margin-top:12px">Готовые наборы</button></div>`);

    H.$('#view-today').innerHTML = `
      <div class="today-head">
        <h2>${H.DAYS_FULL[H.wdIdx(t)]}, ${t.getDate()} ${H.MONTHS[t.getMonth()]}</h2>
        <p>${due.length ? `${done} из ${due.length} закрыто` : 'ничего не запланировано'}</p>
      </div>
      ${due.length && done === due.length ? `<div class="all-done">🎉 Все привычки на сегодня закрыты!</div>` : ''}
      <div class="today-list">${list}</div>
      <button class="btn wide" data-act="newHabit">+ Добавить привычку</button>`;
  };

  /* ================= месяц ================= */
  H.renderMonth = function () {
    const y = H.viewMonth.getFullYear(), m = H.viewMonth.getMonth();
    const first = new Date(y, m, 1);
    const ws = H.startOfWeek(first);
    const tk = H.todayKey();
    const labels = [];
    for (let i = 0; i < 7; i++) labels.push(H.DAYS_SHORT[H.wdIdx(H.addDays(ws, i))]);

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = H.addDays(ws, i);
      const key = H.dk(d);
      const other = d.getMonth() !== m;
      const r = H.dayRatio(key);
      const ratio = r.due ? r.done / r.due : 0;
      const lvl = r.due ? Math.max(1, Math.ceil(ratio * 4)) : 0;
      const future = key > tk;
      cells += `<button class="mday${other ? ' other' : ''}${key === tk ? ' today' : ''}${future ? ' future' : ''} lvl-${future ? 0 : lvl}"
        data-act="openDayWeek" data-key="${key}" ${future ? 'disabled' : ''} aria-label="${key}">
        <span>${d.getDate()}</span>${r.due && !future ? `<i class="mdots">${'•'.repeat(Math.min(3, r.due))}</i>` : ''}
      </button>`;
    }

    H.$('#view-month').innerHTML = `
      <div class="toolbar">
        <div class="week-nav">
          <button class="icon-btn" data-act="prevMonth">‹</button>
          <div class="week-label">${H.MONTHS_NOM[m]} ${y}</div>
          <button class="icon-btn" data-act="nextMonth" ${(y > new Date().getFullYear()) || (y === new Date().getFullYear() && m >= new Date().getMonth()) ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="month">
        <div class="month-head">${labels.map(l => `<span>${l}</span>`).join('')}</div>
        <div class="month-grid">${cells}</div>
        <div class="legend">
          <span>меньше</span><i class="lg lvl-1"></i><i class="lg lvl-2"></i><i class="lg lvl-3"></i><i class="lg lvl-4"></i><span>больше</span>
        </div>
      </div>`;
  };

  /* ================= аналитика ================= */
  H.renderStats = function () {
    const ins = H.insights();
    const lv = H.levelInfo();
    const tk = H.todayKey();
    const habits = H.activeHabits();

    // 12 недель
    const weeks = [];
    for (let i = 11; i >= 0; i--) weeks.push(H.addDays(H.startOfWeek(H.todayStart()), -7 * i));

    const rows = habits.map(h => {
      const bars = weeks.map(ws => {
        const w = H.weekStats(h, ws);
        const pct = w.target ? Math.min(100, Math.round(w.done / w.target * 100)) : 0;
        return `<i class="bar" style="height:${Math.max(3, pct)}%;background:${pct >= 100 ? h.color : H.hexA(h.color, .35)}" title="${H.weekLabel(ws)}: ${pct}%"></i>`;
      }).join('');
      return `<div class="wk-row">
        <span class="wk-name" title="${H.esc(h.name)}">${H.esc(h.emoji)} ${H.esc(h.name)}</span>
        <span class="wk-bars">${bars}</span>
      </div>`;
    }).join('') || '<p class="muted">Добавьте привычки, чтобы увидеть динамику.</p>';

    // провалы по дням недели
    let missBars = '';
    if (habits.length) {
      const startWs = H.addDays(H.startOfWeek(H.todayStart()), -7 * 7);
      const per = [0, 0, 0, 0, 0, 0, 0], tot = [0, 0, 0, 0, 0, 0, 0];
      habits.forEach(h => {
        for (let i = 0; i < 56; i++) {
          const d = H.addDays(startWs, i);
          const key = H.dk(d);
          if (key > tk) break;
          if (!H.scheduledOn(h, d)) continue;
          const wd = H.wdIdx(d);
          tot[wd]++;
          if (!H.done(h, key) && !H.isMin(h, key) && !H.isFrozen(h, key)) per[wd]++;
        }
      });
      missBars = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const pct = tot[i] ? Math.round(per[i] / tot[i] * 100) : 0;
        return `<div class="wd-col"><div class="wd-bar"><i style="height:${Math.max(2, pct)}%"></i></div>
          <span>${H.DAYS_SHORT[i]}</span><b>${pct}%</b></div>`;
      }).join('');
    }

    // тепловая карта года по выбранной привычке
    const sel = H.heatHabit || (habits[0] && habits[0].id);
    const selHabit = habits.find(h => h.id === sel) || habits[0];
    let heat = '';
    if (selHabit) {
      const end = H.startOfWeek(H.todayStart());
      const start = H.addDays(end, -7 * 52);
      const cols = [];
      for (let w = 0; w < 53; w++) {
        let col = '';
        for (let d = 0; d < 7; d++) {
          const date = H.addDays(start, w * 7 + d);
          const key = H.dk(date);
          if (key > tk) { col += '<i class="hm empty"></i>'; continue; }
          const done = H.done(selHabit, key), min = H.isMin(selHabit, key), fr = H.isFrozen(selHabit, key);
          const sch = H.scheduledOn(selHabit, date);
          let lvl = 0;
          if (done) lvl = 4; else if (min) lvl = 3; else if (fr) lvl = 2; else if (sch) lvl = 1;
          col += `<i class="hm lvl-${lvl}" title="${key}"></i>`;
        }
        cols.push(`<span class="hm-col">${col}</span>`);
      }
      heat = `<div class="heat-wrap">${cols.join('')}</div>`;
    }

    const ach = H.achievementState().map(a => `
      <div class="ach${a.unlocked ? ' on' : ''}${a.ready && !a.unlocked ? ' ready' : ''}" title="${H.esc(a.desc)}">
        <div class="ach-icon">${a.unlocked ? a.icon : '•'}</div>
        <div class="ach-name">${H.esc(a.title)}</div>
        <div class="ach-desc">${a.unlocked ? 'получено ' + H.fmtDM(a.date) : H.esc(a.desc)}</div>
      </div>`).join('');

    const unlocked = Object.keys(H.state.achievements || {}).length;

    H.$('#view-stats').innerHTML = `
      <div class="level-card">
        <div class="lc-left">
          <div class="lc-lv">${lv.level}</div>
          <div>
            <b>Уровень ${lv.level}</b>
            <span>${lv.xp} опыта · ещё ${lv.need - lv.inLevel} до ${lv.level + 1}</span>
          </div>
        </div>
        <div class="lc-bar"><i style="width:${lv.pct}%"></i></div>
      </div>

      <section class="stats">
        <div class="stat"><div class="stat-label">Отметок</div><div class="stat-value">${ins.marks}</div></div>
        <div class="stat"><div class="stat-label">Идеальных дней</div><div class="stat-value">${ins.perfect}</div></div>
        <div class="stat"><div class="stat-label">Лучшая серия</div><div class="stat-value">${ins.bestStreak}</div></div>
        <div class="stat"><div class="stat-label">Достижений</div><div class="stat-value">${unlocked}<small>/ ${H.ACHIEVEMENTS.length}</small></div></div>
      </section>

      ${H.challengeHTML(H.viewWeek)}

      <section class="card">
        <h3>Последние 12 недель</h3>
        <div class="wk-chart">${rows}</div>
      </section>

      ${missBars ? `<section class="card">
        <h3>Пропуски по дням недели</h3>
        <p class="muted small">За последние 8 недель</p>
        <div class="wd-chart">${missBars}</div>
      </section>` : ''}

      ${heat ? `<section class="card">
        <div class="card-head">
          <h3>Карта года</h3>
          <select id="heatSelect" data-act="heatSelect">
            ${habits.map(h => `<option value="${h.id}" ${h.id === selHabit.id ? 'selected' : ''}>${H.esc(h.emoji + ' ' + h.name)}</option>`).join('')}
          </select>
        </div>
        <div class="heat-scroll">${heat}</div>
        <div class="legend"><span>реже</span><i class="lg lvl-1"></i><i class="lg lvl-2"></i><i class="lg lvl-3"></i><i class="lg lvl-4"></i><span>чаще</span></div>
      </section>` : ''}

      <section class="card">
        <h3>Достижения</h3>
        <div class="ach-grid">${ach}</div>
      </section>`;
  };

  /* ================= настройки ================= */
  H.openSettings = function () {
    const s = H.state.settings;
    const backups = H.listBackups();
    const archived = H.state.habits.filter(h => h.archived);
    const body = H.$('#settingsBody');

    body.innerHTML = `
      <div class="set-group">
        <h4>Оформление</h4>
        <div class="set-row">
          <span>Тема</span>
          <div class="seg small" id="setTheme">
            <button type="button" data-act="setTheme" data-theme="light" class="${s.theme === 'light' ? 'active' : ''}">Светлая</button>
            <button type="button" data-act="setTheme" data-theme="dark" class="${s.theme === 'dark' ? 'active' : ''}">Тёмная</button>
          </div>
        </div>
        <div class="set-row">
          <span>Первый день недели</span>
          <div class="seg small" id="setWeekStart">
            <button type="button" data-act="setWeekStart" data-ws="1" class="${s.weekStart === 1 ? 'active' : ''}">Пн</button>
            <button type="button" data-act="setWeekStart" data-ws="0" class="${s.weekStart === 0 ? 'active' : ''}">Вс</button>
          </div>
        </div>
        <label class="set-row switch-row">
          <span>Компактные клетки</span>
          <input type="checkbox" data-act="setCompact" ${s.compact ? 'checked' : ''}>
        </label>
      </div>

      <div class="set-group">
        <h4>Напоминания</h4>
        <label class="set-row switch-row">
          <span>Включить уведомления</span>
          <input type="checkbox" data-act="setReminders" ${s.reminders ? 'checked' : ''}>
        </label>
        <p class="hint">Уведомление приходит, когда приложение открыто (или сразу при запуске, если время прошло). На телефоне — после установки на главный экран.</p>
        <button class="btn" data-act="askPermission">Разрешить уведомления</button>
      </div>

      <div class="set-group">
        <h4>Данные</h4>
        <div class="btn-row">
          <button class="btn" data-act="exportJson">Экспорт JSON</button>
          <button class="btn" data-act="exportCsv">Экспорт CSV</button>
          <button class="btn" data-act="importJson">Импорт</button>
        </div>
        <p class="hint">Данные хранятся в этом браузере. Для переноса на телефон используйте экспорт и импорт.</p>
      </div>

      <div class="set-group">
        <h4>Резервные копии</h4>
        ${backups.length ? backups.map(b => `
          <div class="set-row backup-row">
            <span>${H.fmtDM(b.date)} <em>${b.date === H.todayKey() ? 'начало дня' : ''}</em></span>
            <button class="btn small" data-act="restore" data-date="${b.date}">Восстановить</button>
          </div>`).join('') : '<p class="hint">Копии создаются автоматически раз в день (хранятся 7 дней).</p>'}
      </div>

      <div class="set-group">
        <h4>Архив привычек ${archived.length ? `(${archived.length})` : ''}</h4>
        ${archived.length ? archived.map(h => `
          <div class="set-row backup-row">
            <span>${H.esc(h.emoji)} ${H.esc(h.name)}</span>
            <button class="btn small" data-act="unarchive" data-id="${h.id}">Вернуть</button>
          </div>`).join('') : '<p class="hint">Архив пуст. Привычку можно отправить в архив из редактора — история сохранится.</p>'}
      </div>

      <div class="set-group">
        <h4>Приложение</h4>
        ${H._installPrompt
          ? '<button class="btn" data-act="install">Установить на это устройство</button>'
          : (window.isSecureContext
            ? '<p class="hint">Откройте меню браузера ⋮ → «Установить приложение» (или «Добавить на главный экран»).</p>'
            : '<p class="hint">Установка работает только по адресу <b>https://</b>. Сейчас страница открыта по ' + location.protocol + ' — пользоваться можно, а установить нельзя. Инструкция — в README.</p>')}
      </div>

      <div class="set-group">
        <h4>Ещё</h4>
        <div class="btn-row">
          <button class="btn" data-act="templates">Готовые наборы</button>
          <button class="btn danger" data-act="resetAll">Сбросить всё</button>
        </div>
      </div>

      <div class="set-group">
        <h4>Горячие клавиши</h4>
        <div class="keys">
          <span><kbd>1</kbd>–<kbd>9</kbd> отметить привычку сегодня</span>
          <span><kbd>N</kbd> новая привычка</span>
          <span><kbd>←</kbd> <kbd>→</kbd> неделя</span>
          <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> отменить действие</span>
        </div>
      </div>`;

    const dlg = H.$('#settings');
    if (!dlg.open) dlg.showModal();
  };

  /* ================= шаблоны ================= */
  H.openTemplates = function () {
    H.$('#templatesBody').innerHTML = `
      <p class="hint" style="margin-top:0">Выберите набор — привычки добавятся сразу, их можно отредактировать.</p>
      <div class="tpl-list">
        ${H.TEMPLATES.map(t => `
          <button class="tpl" data-act="applyTemplate" data-id="${t.id}">
            <span class="tpl-icon">${t.icon}</span>
            <span class="tpl-body"><b>${t.name}</b><em>${t.items.map(i => i.emoji + ' ' + i.name).join(' · ')}</em></span>
          </button>`).join('')}
      </div>`;
    H.$('#templates').showModal();
  };

  /* ================= редактор ================= */
  let draft = null;
  let editingId = null;

  const el = id => document.getElementById(id);

  H.openEditor = function (id) {
    const h = id ? H.state.habits.find(x => x.id === id) : null;
    editingId = id || null;
    draft = h
      ? JSON.parse(JSON.stringify(h))
      : H.newHabit({ color: H.PALETTE[H.state.habits.length % H.PALETTE.length] });

    el('editorTitle').textContent = h ? 'Изменить привычку' : 'Новая привычка';
    el('eName').value = draft.name;
    el('eEmoji').value = draft.emoji;
    el('eCategory').value = draft.category;
    el('eTarget').value = draft.target;
    el('eUnit').value = draft.unit;
    el('eStep').value = draft.step;
    el('eReminder').value = draft.reminder || '';
    el('eDelete').style.display = h ? '' : 'none';
    el('eArchive').style.display = h ? '' : 'none';
    el('eArchive').textContent = h && h.archived ? 'Вернуть из архива' : 'В архив';

    const cats = Array.from(new Set(H.state.habits.map(x => x.category).filter(Boolean)));
    el('categoryList').innerHTML = cats.map(c => `<option value="${H.esc(c)}">`).join('');

    H.renderEditor();
    H.$('#editor').showModal();
    setTimeout(() => el('eName').focus(), 40);
  };

  H.renderEditor = function () {
    if (!draft) return;
    el('eEmoji').value = draft.emoji;
    el('eColors').innerHTML = H.PALETTE.map(c =>
      `<button type="button" class="swatch${c === draft.color ? ' active' : ''}" data-act="pickColor" data-color="${c}"
        style="background:${c};color:${c}" aria-label="Цвет ${c}"></button>`).join('');
    el('eEmojiList').innerHTML = H.EMOJIS.map(e =>
      `<button type="button" data-act="pickEmoji" data-emoji="${e}">${e}</button>`).join('');
    H.$$('#eTypeSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === draft.type));
    el('eCountPane').classList.toggle('show', draft.type === 'count');
    H.$$('#eModeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === draft.mode));
    el('eDaysPane').classList.toggle('show', draft.mode === 'days');
    el('eWeekPane').classList.toggle('show', draft.mode === 'week');
    el('ePerWeek').textContent = draft.perWeek;
    el('eDays').innerHTML = H.DAYS_SHORT.map((d, i) =>
      `<button type="button" data-act="pickDay" data-day="${i}" class="${draft.days.indexOf(i) !== -1 ? 'on' : ''}">${d}</button>`).join('');
  };

  H.saveEditor = function () {
    const name = el('eName').value.trim();
    if (!name) { H.toast('Введите название'); el('eName').focus(); return; }
    if (draft.mode === 'days' && draft.days.length === 0) { H.toast('Выберите хотя бы один день'); return; }

    const fields = {
      name,
      emoji: (el('eEmoji').value.trim() || '✨').slice(0, 4),
      category: el('eCategory').value.trim().slice(0, 20),
      color: draft.color,
      type: draft.type,
      target: Math.max(1, Number(el('eTarget').value) || 1),
      unit: el('eUnit').value.trim().slice(0, 10),
      step: Math.max(1, Number(el('eStep').value) || 1),
      mode: draft.mode,
      days: draft.days.slice().sort((a, b) => a - b),
      perWeek: draft.perWeek,
      reminder: el('eReminder').value || ''
    };
    if (fields.mode === 'days' && !fields.days.length) fields.days = H.ALL_DAYS.slice();

    H.pushUndo();
    if (editingId) {
      const h = H.state.habits.find(x => x.id === editingId);
      if (h) Object.assign(h, fields);
      H.toast('Сохранено');
    } else {
      H.state.habits.push(H.newHabit(fields));
      H.toast('Привычка добавлена');
      H.confetti();
    }
    H.$('#editor').close();
    H.commit();
  };

  H.deleteHabit = function (id) {
    const h = H.state.habits.find(x => x.id === id);
    if (!h) return;
    H.pushUndo();
    H.state.habits = H.state.habits.filter(x => x.id !== id);
    H.$('#editor').close();
    H.commit();
    H.toast('Привычка удалена', { action: { label: 'Отменить', run: () => H.undo() } });
  };

  H.archiveHabit = function (id) {
    const h = H.state.habits.find(x => x.id === id);
    if (!h) return;
    H.pushUndo();
    h.archived = !h.archived;
    H.$('#editor').close();
    H.commit();
    H.toast(h.archived ? 'Привычка в архиве' : 'Привычка возвращена');
  };

  /* ================= попап дня ================= */
  H.closePop = function () {
    const root = H.$('#popRoot');
    if (root) root.innerHTML = '';
    H._popOpen = false;
  };

  H.openDayMenu = function (id, key, anchor) {
    const h = H.state.habits.find(x => x.id === id);
    if (!h) return;
    const d = H.parseDK(key);
    const done = H.done(h, key);
    const min = H.isMin(h, key);
    const frozen = H.isFrozen(h, key);
    const budget = H.freezeBudget(h, d);
    const note = h.notes[key] || '';
    const tk = H.todayKey();
    const isFuture = key > tk;

    const root = H.$('#popRoot');
    root.innerHTML = `<div class="pop-backdrop" data-act="closePop"></div>
      <div class="pop" id="dayPop" role="dialog" aria-label="День привычки">
        <div class="pop-head">
          <span class="tc-emoji" style="background:${H.hexA(h.color, .13)}">${H.esc(h.emoji)}</span>
          <div class="pop-title"><b>${H.esc(h.name)}</b><span>${H.DAYS_SHORT[H.wdIdx(d)]}, ${d.getDate()} ${H.MONTHS[d.getMonth()]}</span></div>
          <button class="icon-btn ghost" data-act="closePop" aria-label="Закрыть">✕</button>
        </div>

        ${h.type === 'count' ? `
        <div class="pop-value">
          <button class="step" data-act="valStep" data-step="-${h.step}">−</button>
          <div class="val-num"><b>${H.value(h, key)}</b><span>/ ${h.target}${h.unit ? ' ' + H.esc(h.unit) : ''}</span></div>
          <button class="step" data-act="valStep" data-step="${h.step}">+</button>
        </div>
        <div class="pop-grid">
          <button class="btn small" data-act="valSet" data-value="${h.target}">Цель</button>
          <button class="btn small" data-act="valSet" data-value="0">Сбросить</button>
        </div>` : ''}

        <div class="pop-grid">
          <button class="btn small ${done ? 'primary' : ''}" data-act="dayDone">${done ? '✓ Выполнено' : 'Отметить'}</button>
          <button class="btn small ${min ? 'primary' : ''}" data-act="dayMin" ${h.type === 'count' ? 'disabled' : ''}>Минимум</button>
          <button class="btn small ${frozen ? 'primary' : ''}" data-act="dayFrozen" ${budget.left === 0 && !frozen ? 'disabled' : ''}>❄ Пропуск (${budget.left}/${budget.max})</button>
          <button class="btn small" data-act="dayClear">Снять</button>
        </div>

        ${isFuture ? '<p class="hint">Будущий день — отметить нельзя.</p>' : ''}

        <label class="pop-note">
          <span>Заметка</span>
          <textarea id="dayNote" rows="3" maxlength="500" placeholder="Что получилось, что мешало…">${H.esc(note)}</textarea>
        </label>

        <div class="pop-foot">
          <button class="btn danger small" data-act="dayDeleteNote">Очистить заметку</button>
          <div class="spacer"></div>
          <button class="btn primary small" data-act="savePop">Готово</button>
        </div>
      </div>`;

    H._popOpen = true;
    H._popRef = { id, key };

    // позиционирование
    const pop = H.$('#dayPop');
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      const pw = Math.min(330, window.innerWidth - 24);
      pop.style.width = pw + 'px';
      let left = r.left + r.width / 2 - pw / 2;
      left = H.clamp(left, 12, window.innerWidth - pw - 12);
      const ph = pop.offsetHeight || 320;
      let top = r.bottom + 8;
      if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    } else {
      pop.classList.add('center');
    }
  };

  H.renderHeatSelect = function () {
    const sel = document.getElementById('heatSelect');
    if (sel) return;
  };

  /* ================= доступ к черновику редактора ================= */
  H.editor = {
    get id() { return editingId; },
    get draft() { return draft; },
    setColor(c) { if (draft) { draft.color = c; H.renderEditor(); } },
    setEmoji(e) { if (draft) { draft.emoji = e; H.renderEditor(); } },
    setType(t) { if (draft) { draft.type = t; H.renderEditor(); } },
    setMode(m) { if (draft) { draft.mode = m; H.renderEditor(); } },
    stepPerWeek(n) { if (draft) { draft.perWeek = H.clamp(draft.perWeek + n, 1, 7); H.renderEditor(); } },
    toggleDay(i) {
      if (!draft) return;
      if (draft.days.indexOf(i) !== -1) {
        if (draft.days.length === 1) { H.toast('Нужен хотя бы один день'); return; }
        draft.days = draft.days.filter(d => d !== i);
      } else {
        draft.days = draft.days.concat(i).sort((a, b) => a - b);
      }
      H.renderEditor();
    }
  };
})(window.H);
