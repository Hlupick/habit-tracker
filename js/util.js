/* ============ утилиты ============ */
window.H = window.H || {};
(function (H) {
  "use strict";

  H.$ = (sel, root = document) => root.querySelector(sel);
  H.$$ = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));

  H.DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  H.DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  H.MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  H.MONTHS_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  H.MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  H.PALETTE = ['#4f46e5', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b'];
  H.EMOJIS = ['💧', '🏃', '📚', '🧘', '🥗', '💪', '😴', '✍️', '🎸', '🎯', '☀️', '🚭', '💊', '🦷', '🧠', '🧹'];
  H.ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  H.CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  H.uid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'h' + Math.random().toString(36).slice(2) + Date.now().toString(36));

  H.dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  H.parseDK = k => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  H.addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  H.todayStart = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  H.wdIdx = d => (d.getDay() + 6) % 7;                     // Пн = 0 … Вс = 6
  H.sameDay = (a, b) => H.dk(a) === H.dk(b);
  H.todayKey = () => H.dk(H.todayStart());

  // неделя с учётом настройки «первый день недели» (0 = вс, 1 = пн)
  H.startOfWeek = d => {
    const ws = (H.state && H.state.settings && typeof H.state.settings.weekStart === 'number')
      ? H.state.settings.weekStart : 1;
    const diff = (d.getDay() - ws + 7) % 7;
    return H.addDays(d, -diff);
  };

  H.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  H.hexA = (hex, a) => {
    let h = String(hex || '#4f46e5').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  H.fmtDM = key => {
    const d = H.parseDK(key);
    return `${d.getDate()} ${H.MONTHS_S[d.getMonth()]}`;
  };

  H.fmtLong = d => `${H.DAYS_FULL[H.wdIdx(d)]}, ${d.getDate()} ${H.MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  H.weekLabel = ws => {
    const we = H.addDays(ws, 6);
    if (ws.getMonth() === we.getMonth()) {
      return `${ws.getDate()}–${we.getDate()} ${H.MONTHS_S[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${ws.getDate()} ${H.MONTHS_S[ws.getMonth()]} – ${we.getDate()} ${H.MONTHS_S[we.getMonth()]} ${we.getFullYear()}`;
  };

  H.clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  H.isTyping = e => {
    const t = e.target;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };

  H.toast = (msg, opts) => {
    const root = H.$('#toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    if (opts && opts.action) {
      el.classList.add('toast-action');
      const btn = document.createElement('button');
      btn.className = 'toast-btn';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', () => { opts.action.run(); el.remove(); });
      el.appendChild(btn);
    }
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 260);
    }, opts && opts.ms ? opts.ms : 2400);
  };

  H.confetti = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f59e0b', '#f97316', '#ef4444', '#22c55e', '#4f46e5', '#0ea5e9', '#eab308'];
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.background = colors[i % colors.length];
      p.style.left = (50 + (Math.random() * 30 - 15)).toFixed(1) + '%';
      p.style.setProperty('--dx', (Math.random() * 280 - 140).toFixed(0) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * 0.18).toFixed(2) + 's';
      p.style.animationDuration = (0.9 + Math.random() * 0.5).toFixed(2) + 's';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 2000);
  };

  H.vibrate = ms => {
    try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* ignore */ }
  };

  H.debounce = (fn, ms) => {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  };

  H.isMobile = () => window.matchMedia('(max-width: 720px)').matches;
})(window.H);
