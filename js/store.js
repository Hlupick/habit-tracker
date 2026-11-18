/* ============ данные ============ */
(function (H) {
  "use strict";

  const KEY = 'habitTracker.v2';
  const OLD_KEY = 'habitTracker.v1';
  const BK_KEY = 'habitTracker.backups';
  const UNDO_LIMIT = 40;

  const DEFAULT_SETTINGS = {
    theme: 'light',
    weekStart: 1,          // 1 = понедельник, 0 = воскресенье
    compact: false,
    reminders: false,
    lastSummary: null,
    lastBackup: null,
    lastView: null
  };

  H.newHabit = (over) => Object.assign({
    id: H.uid(),
    name: '',
    emoji: '✨',
    color: '#4f46e5',
    category: '',
    type: 'check',          // check | count
    target: 1,
    unit: '',
    step: 1,
    mode: 'days',           // days | week
    days: H.ALL_DAYS.slice(),
    perWeek: 7,
    createdAt: H.todayKey(),
    reminder: '',
    archived: false,
    log: {},                // key -> 1 (галочка) или число (count)
    min: {},                // key -> true (минимальная версия)
    frozen: {},             // key -> true (заморозка)
    notes: {}               // key -> текст
  }, over || {});

  function blankState() {
    return {
      version: 2,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      xpAwarded: 0,
      achievements: {},
      habits: []
    };
  }

  function migrateV1(v1) {
    const st = blankState();
    st.settings.theme = v1.theme === 'dark' ? 'dark' : 'light';
    (v1.habits || []).forEach(h => {
      const log = {};
      Object.keys(h.log || {}).forEach(k => { if (h.log[k]) log[k] = 1; });
      st.habits.push(H.newHabit({
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        color: h.color,
        mode: h.mode === 'week' ? 'week' : 'days',
        days: Array.isArray(h.days) && h.days.length ? h.days.slice() : H.ALL_DAYS.slice(),
        perWeek: H.clamp(Number(h.perWeek) || 3, 1, 7),
        createdAt: h.createdAt || H.todayKey(),
        log
      }));
    });
    return st;
  }

  function sanitizeHabit(raw) {
    const h = H.newHabit();
    h.id = raw.id || H.uid();
    h.name = String(raw.name || 'Привычка').slice(0, 60);
    h.emoji = String(raw.emoji || '✨').slice(0, 4);
    h.color = /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : H.PALETTE[0];
    h.category = String(raw.category || '').slice(0, 20);
    h.type = raw.type === 'count' ? 'count' : 'check';
    h.target = Math.max(1, Number(raw.target) || 1);
    h.unit = String(raw.unit || '').slice(0, 10);
    h.step = Math.max(1, Number(raw.step) || 1);
    h.mode = raw.mode === 'week' ? 'week' : 'days';
    const days = Array.isArray(raw.days) ? raw.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 7) : [];
    h.days = days.length ? Array.from(new Set(days)).sort((a, b) => a - b) : H.ALL_DAYS.slice();
    h.perWeek = H.clamp(Number(raw.perWeek) || 3, 1, 7);
    h.createdAt = /^\d{4}-\d{2}-\d{2}$/.test(raw.createdAt || '') ? raw.createdAt : H.todayKey();
    h.reminder = /^\d{2}:\d{2}$/.test(raw.reminder || '') ? raw.reminder : '';
    h.archived = !!raw.archived;

    const clean = (obj, valueFn) => {
      const out = {};
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.keys(obj).forEach(k => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
          const v = valueFn(obj[k]);
          if (v !== undefined) out[k] = v;
        });
      }
      return out;
    };

    h.log = clean(raw.log, v => (h.type === 'count' ? (Number(v) > 0 ? Number(v) : undefined) : (v ? 1 : undefined)));
    h.min = clean(raw.min, v => (v ? true : undefined));
    h.frozen = clean(raw.frozen, v => (v ? true : undefined));
    h.notes = clean(raw.notes, v => (typeof v === 'string' && v.trim() ? v.slice(0, 500) : undefined));
    return h;
  }

  H._rev = 0;
  H._insRev = -1;
  H._ins = null;

  H.load = function () {
    let data = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) { data = null; }

    if (!data) {
      try {
        const old = localStorage.getItem(OLD_KEY);
        if (old) {
          const parsed = JSON.parse(old);
          if (parsed && Array.isArray(parsed.habits)) data = migrateV1(parsed);
        }
      } catch (e) { /* ignore */ }
    }

    if (!data) data = H.seed ? H.seed() : blankState();

    const st = blankState();
    st.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    st.settings.theme = st.settings.theme === 'dark' ? 'dark' : 'light';
    st.settings.weekStart = st.settings.weekStart === 0 ? 0 : 1;
    st.settings.compact = !!st.settings.compact;
    st.achievements = (data.achievements && typeof data.achievements === 'object') ? data.achievements : {};
    st.habits = Array.isArray(data.habits) ? data.habits.map(sanitizeHabit) : [];

    H.state = st;
    return st;
  };

  H.save = function (opts) {
    H._rev++;
    try {
      localStorage.setItem(KEY, JSON.stringify(H.state));
    } catch (e) {
      H.toast('Не удалось сохранить данные');
    }
    if (!(opts && opts.noBackup)) H.dailyBackup();
  };

  /* ---------- отмена действий ---------- */
  H._undo = [];

  H.pushUndo = function () {
    try {
      H._undo.push(JSON.stringify(H.state));
      if (H._undo.length > UNDO_LIMIT) H._undo.shift();
    } catch (e) { /* ignore */ }
  };

  H.canUndo = () => H._undo.length > 0;

  H.undo = function () {
    const prev = H._undo.pop();
    if (!prev) { H.toast('Нечего отменять'); return false; }
    H.state = JSON.parse(prev);
    H.save({ noBackup: true });
    H.render();
    H.toast('Действие отменено');
    return true;
  };

  /* ---------- ежедневный бэкап ---------- */
  H.dailyBackup = function () {
    const today = H.todayKey();
    if (H.state.settings.lastBackup === today) return;
    H.state.settings.lastBackup = today;
    try {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(BK_KEY) || '[]'); } catch (e) { list = []; }
      list = list.filter(b => b && b.date && b.date !== today);
      list.unshift({ date: today, data: JSON.stringify(H.state) });
      while (list.length > 7) list.pop();
      localStorage.setItem(BK_KEY, JSON.stringify(list));
      localStorage.setItem(KEY, JSON.stringify(H.state));
    } catch (e) { /* ignore */ }
  };

  H.listBackups = function () {
    try {
      const list = JSON.parse(localStorage.getItem(BK_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  };

  H.restoreBackup = function (date) {
    const item = H.listBackups().find(b => b.date === date);
    if (!item) { H.toast('Копия не найдена'); return false; }
    try {
      const data = JSON.parse(item.data);
      H.pushUndo();
      H.state = Object.assign(blankState(), data);
      H.state.habits = (data.habits || []).map(sanitizeHabit);
      H.save({ noBackup: true });
      H.render();
      H.toast('Восстановлено из копии ' + H.fmtDM(date));
      return true;
    } catch (e) {
      H.toast('Не удалось восстановить копию');
      return false;
    }
  };

  H.exportJSON = function () {
    const blob = new Blob([JSON.stringify(H.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `habits-${H.todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    H.toast('Файл сохранён');
  };

  H.exportCSV = function () {
    const rows = [['Дата', 'Привычка', 'Категория', 'Статус', 'Значение', 'Цель', 'Заметка']];
    H.state.habits.forEach(h => {
      const keys = new Set([].concat(Object.keys(h.log), Object.keys(h.min), Object.keys(h.frozen), Object.keys(h.notes)));
      Array.from(keys).sort().forEach(k => {
        let status = '';
        if (H.done(h, k)) status = 'выполнено';
        else if (H.isMin(h, k)) status = 'минимум';
        else if (H.isFrozen(h, k)) status = 'пропуск';
        else status = 'частично';
        const val = h.type === 'count' ? (Number(h.log[k]) || 0) : (h.log[k] ? 1 : 0);
        rows.push([k, h.name, h.category || '', status, val, h.type === 'count' ? h.target : '', (h.notes[k] || '').replace(/\n/g, ' ')]);
      });
    });
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `habits-${H.todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    H.toast('CSV сохранён');
  };

  H.importData = function (text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('bad json'); }
    if (!data || !Array.isArray(data.habits)) throw new Error('bad format');
    const st = blankState();
    st.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    st.achievements = (data.achievements && typeof data.achievements === 'object') ? data.achievements : {};
    st.habits = data.habits.map(sanitizeHabit);
    H.pushUndo();
    H.state = st;
    H.save();
    H.checkAchievements(true);
    H.render();
  };

  /* ---------- шаблоны ---------- */
  H.TEMPLATES = [
    {
      id: 'health', name: 'Здоровье', icon: '💚',
      items: [
        { name: 'Пить воду', emoji: '💧', color: '#0ea5e9', category: 'Здоровье', type: 'count', target: 2000, unit: 'мл', step: 250 },
        { name: 'Зарядка', emoji: '💪', color: '#4f46e5', category: 'Здоровье', mode: 'days', days: [0, 2, 4], perWeek: 3 },
        { name: 'Сон 8 часов', emoji: '😴', color: '#8b5cf6', category: 'Здоровье' }
      ]
    },
    {
      id: 'mind', name: 'Спокойствие', icon: '🧘',
      items: [
        { name: 'Медитация', emoji: '🧘', color: '#14b8a6', category: 'Разум', type: 'count', target: 10, unit: 'мин', step: 5 },
        { name: 'Дневник', emoji: '✍️', color: '#f59e0b', category: 'Разум' },
        { name: 'Без соцсетей до обеда', emoji: '📵', color: '#64748b', category: 'Разум' }
      ]
    },
    {
      id: 'growth', name: 'Учёба', icon: '📚',
      items: [
        { name: 'Чтение', emoji: '📚', color: '#22c55e', category: 'Учёба', type: 'count', target: 20, unit: 'стр', step: 5 },
        { name: 'Английский', emoji: '🧠', color: '#0ea5e9', category: 'Учёба', mode: 'days', days: [0, 1, 2, 3, 4], perWeek: 5 },
        { name: 'Повторение', emoji: '🔁', color: '#f43f5e', category: 'Учёба', mode: 'week', perWeek: 3 }
      ]
    },
    {
      id: 'sport', name: 'Спорт', icon: '🏃',
      items: [
        { name: 'Тренировка', emoji: '🏋️', color: '#4f46e5', category: 'Спорт', mode: 'week', perWeek: 4 },
        { name: '10 000 шагов', emoji: '🚶', color: '#22c55e', category: 'Спорт', type: 'count', target: 10000, unit: 'шаг', step: 1000 },
        { name: 'Растяжка', emoji: '🤸', color: '#14b8a6', category: 'Спорт' }
      ]
    }
  ];

  H.applyTemplate = function (id) {
    const tpl = H.TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    H.pushUndo();
    tpl.items.forEach(item => {
      H.state.habits.push(H.newHabit(Object.assign({}, item)));
    });
    H.save();
    H.render();
    H.toast(`Добавлено: ${tpl.name} (${tpl.items.length})`);
    H.confetti();
  };

  H.seed = function () {
    const st = blankState();
    st.settings.theme = 'light';
    const mk = (name, emoji, color, extra) => H.newHabit(Object.assign({ name, emoji, color, category: '' }, extra || {}));
    st.habits = [
      mk('Пить воду', '💧', '#0ea5e9', { type: 'count', target: 2000, unit: 'мл', step: 250, category: 'Здоровье' }),
      mk('Зарядка', '💪', '#4f46e5', { days: [0, 2, 4], perWeek: 3, category: 'Здоровье' }),
      mk('Чтение 20 минут', '📚', '#22c55e', { type: 'count', target: 20, unit: 'стр', step: 5, category: 'Учёба' })
    ];
    return st;
  };

  H.blank = blankState;
})(window.H);
