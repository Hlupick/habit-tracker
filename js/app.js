/* ============ приложение: события и запуск ============ */
(function (H) {
  "use strict";

  const el = id => document.getElementById(id);
  let popAnchor = null;
  let lpTimer = null, lpFired = false;
  let lastDay = null;

  /* ---------- вспомогательные ---------- */
  const findHabit = id => H.state.habits.find(h => h.id === id);

  function toastUndo(msg) {
    H.toast(msg, { action: { label: 'Отменить', run: () => H.undo() } });
  }

  function toggleCheck(h, key) {
    if (key > H.todayKey()) return;
    const before = H.streak(h);
    H.pushUndo();
    if (H.done(h, key)) {
      delete h.log[key];
      delete h.min[key];
    } else {
      h.log[key] = 1;
      delete h.min[key];
      delete h.frozen[key];
    }
    const after = H.streak(h);
    H.vibrate(8);
    H.commit();

    if (after > before && h.log[key]) {
      const ms = [3, 7, 14, 21, 30, 60, 90, 180, 365];
      if (ms.indexOf(after) !== -1) {
        H.toast(`🏅 Серия ${after} — отличная работа!`);
        H.confetti();
      }
    } else if (after < before && before >= 3) {
      H.toast('Серия прервана. Начните заново 💪');
    }
  }

  function quickDone(id) {
    const h = findHabit(id);
    if (!h) return;
    const tk = H.todayKey();
    if (h.type === 'count') {
      const anchor = document.querySelector(`[data-act="quickDone"][data-id="${id}"]`);
      H.openDayMenu(id, tk, anchor);
      return;
    }
    toggleCheck(h, tk);
  }

  function quickAdd() {
    const nameInput = el('quickName');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const emoji = (el('quickEmoji').value || '✨').trim().slice(0, 4);
    H.pushUndo();
    H.state.habits.push(H.newHabit({
      name, emoji,
      color: H.PALETTE[H.state.habits.length % H.PALETTE.length]
    }));
    H.commit();
    H.toast('Привычка добавлена');
    const again = el('quickName');
    if (again) again.focus();
  }

  /* ---------- попап дня ---------- */
  function popState() {
    if (!H._popRef) return null;
    const h = findHabit(H._popRef.id);
    if (!h) return null;
    return { h, key: H._popRef.key };
  }

  function popRefresh() {
    const s = popState();
    if (!s) return;
    const num = document.querySelector('#dayPop .val-num b');
    if (num) num.textContent = H.value(s.h, s.key);
    const target = s.h.target || 1;
    document.querySelectorAll('#dayPop [data-act="valSet"]').forEach(b => {
      b.classList.toggle('primary', Number(b.dataset.value) === H.value(s.h, s.key));
    });
  }

  function popMutate(fn) {
    const s = popState();
    if (!s) return;
    H.pushUndo();
    fn(s.h, s.key);
    H.commit();
    H.closePop();
  }

  function popClose() {
    const s = popState();
    H.closePop();
    if (s) H.render();
  }

  function saveNote(value) {
    const s = popState();
    if (!s) return;
    if (value.trim()) s.h.notes[s.key] = value.slice(0, 500);
    else delete s.h.notes[s.key];
    H.save({ noBackup: true });
  }

  /* ---------- напоминания ---------- */
  H.reminderTick = function () {
    const s = H.state.settings;
    if (!s.reminders) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const tk = H.todayKey();
    H._notified = H._notified || {};

    H.activeHabits().forEach(h => {
      if (!h.reminder) return;
      const parts = h.reminder.split(':').map(Number);
      const remMin = parts[0] * 60 + parts[1];
      const diff = nowMin - remMin;
      if (diff < 0 || diff > 120) return;
      if (!H.scheduledOn(h, now)) return;
      if (H.satisfied(h, tk) || H.isFrozen(h, tk)) return;
      const mark = h.id + '|' + tk;
      if (H._notified[mark]) return;
      H._notified[mark] = true;
      try {
        new Notification('Пора отметить: ' + h.name, {
          body: `${h.emoji} Серия ${H.streak(h)} — не потеряйте её`,
          icon: 'icons/icon-192.png',
          tag: mark
        });
      } catch (e) { /* ignore */ }
    });
  };

  /* ---------- сервис-воркер и установка ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore */ });
  }

  function installPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      H._installPrompt = e;
    });
  }

  /* ---------- запуск ---------- */
  function boot() {
    H.load();
    H.view = H.state.settings.lastView || (H.isMobile() ? 'today' : 'week');
    H.checkAchievements(true);
    H.render();
    lastDay = H.todayKey();

    el('editorForm').addEventListener('submit', e => { e.preventDefault(); H.saveEditor(); });
    el('eDelete').addEventListener('click', () => {
      const id = H.editor.id;
      if (!id) return;
      if (!confirm('Удалить привычку вместе со всей историей?')) return;
      H.deleteHabit(id);
    });
    el('eArchive').addEventListener('click', () => {
      const id = H.editor.id;
      if (!id) return;
      H.archiveHabit(id);
    });
    el('eTypeSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-type]');
      if (b) H.editor.setType(b.dataset.type);
    });
    el('eModeSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) H.editor.setMode(b.dataset.mode);
    });

    H.reminderTick();
    setInterval(H.reminderTick, 30000);
    setInterval(() => {
      const today = H.todayKey();
      if (today !== lastDay) {
        lastDay = today;
        H.viewWeek = H.startOfWeek(H.todayStart());
        H.render();
      }
    }, 60000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) H.reminderTick();
    });

    registerSW();
    installPrompt();
  }

  /* ---------- клики ---------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    switch (act) {
      case 'view':
        H.view = btn.dataset.view;
        H.filter = 'all';
        H.state.settings.lastView = H.view;
        H.save({ noBackup: true });
        H.closePop();
        H.render();
        break;

      case 'theme':
        H.state.settings.theme = H.state.settings.theme === 'dark' ? 'light' : 'dark';
        H.save({ noBackup: true });
        H.render();
        break;

      case 'settings':
        H.openSettings();
        break;

      case 'templates':
        H.openTemplates();
        break;

      case 'prevWeek':
        H.viewWeek = H.addDays(H.viewWeek, -7);
        H.render();
        break;

      case 'nextWeek': {
        const next = H.addDays(H.viewWeek, 7);
        if (H.dk(next) <= H.dk(H.startOfWeek(H.todayStart()))) {
          H.viewWeek = next;
          H.render();
        }
        break;
      }

      case 'todayWeek':
        H.viewWeek = H.startOfWeek(H.todayStart());
        H.render();
        break;

      case 'newHabit':
        H.openEditor(null);
        break;

      case 'quickAdd':
        quickAdd();
        break;

      case 'filter':
        H.filter = btn.dataset.cat;
        H.render();
        break;

      case 'dismissSummary':
        H.state.settings.lastSummary = H.dk(H.startOfWeek(H.todayStart()));
        H.save({ noBackup: true });
        H.render();
        break;

      case 'cell': {
        if (lpFired) { lpFired = false; break; }
        const h = findHabit(btn.dataset.id);
        if (!h) break;
        if (h.type === 'count') H.openDayMenu(h.id, btn.dataset.key, btn);
        else toggleCheck(h, btn.dataset.key);
        break;
      }

      case 'quickDone':
        quickDone(btn.dataset.id);
        break;

      case 'dayMenu': {
        const anchor = btn.closest('.tcard') || btn;
        H.openDayMenu(btn.dataset.id, btn.dataset.key || H.todayKey(), anchor);
        break;
      }

      case 'editHabit':
        H.openEditor(btn.dataset.id);
        break;

      case 'archiveHabit':
        H.archiveHabit(btn.dataset.id);
        break;

      case 'prevMonth':
        H.viewMonth = new Date(H.viewMonth.getFullYear(), H.viewMonth.getMonth() - 1, 1);
        H.render();
        break;

      case 'nextMonth': {
        const n = new Date(H.viewMonth.getFullYear(), H.viewMonth.getMonth() + 1, 1);
        const now = new Date();
        if (n <= new Date(now.getFullYear(), now.getMonth(), 1)) {
          H.viewMonth = n;
          H.render();
        }
        break;
      }

      case 'openDayWeek': {
        const d = H.parseDK(btn.dataset.key);
        H.viewWeek = H.startOfWeek(d);
        H.view = 'week';
        H.render();
        break;
      }

      /* --- попап дня --- */
      case 'closePop':
        popClose();
        break;

      case 'dayDone':
        popMutate((h, key) => {
          if (H.done(h, key)) { delete h.log[key]; delete h.min[key]; }
          else {
            h.log[key] = h.type === 'count' ? (h.target || 1) : 1;
            delete h.min[key];
            delete h.frozen[key];
          }
        });
        break;

      case 'dayMin':
        popMutate((h, key) => {
          if (H.isMin(h, key)) delete h.min[key];
          else { h.min[key] = true; delete h.log[key]; delete h.frozen[key]; }
        });
        break;

      case 'dayFrozen':
        popMutate((h, key) => {
          if (H.isFrozen(h, key)) delete h.frozen[key];
          else {
            const b = H.freezeBudget(h, H.parseDK(key));
            if (b.left <= 0) { H.toast('Заморозки на этот месяц закончились'); return; }
            h.frozen[key] = true;
            delete h.log[key];
            delete h.min[key];
          }
        });
        break;

      case 'dayClear':
        popMutate((h, key) => { delete h.log[key]; delete h.min[key]; delete h.frozen[key]; });
        break;

      case 'valStep': {
        const s = popState();
        if (!s) break;
        const step = Number(btn.dataset.step) || 0;
        const cur = H.value(s.h, s.key);
        const next = H.clamp(cur + step, 0, (s.h.target || 1) * 2);
        if (next > 0) s.h.log[s.key] = next; else delete s.h.log[s.key];
        delete s.h.min[s.key];
        H.save({ noBackup: true });
        popRefresh();
        break;
      }

      case 'valSet': {
        const s = popState();
        if (!s) break;
        const v = Number(btn.dataset.value) || 0;
        if (v > 0) s.h.log[s.key] = v; else delete s.h.log[s.key];
        delete s.h.min[s.key];
        H.save({ noBackup: true });
        popRefresh();
        break;
      }

      case 'savePop':
        popClose();
        break;

      case 'dayDeleteNote': {
        const s = popState();
        if (!s) break;
        delete s.h.notes[s.key];
        H.save({ noBackup: true });
        const ta = el('dayNote');
        if (ta) ta.value = '';
        H.toast('Заметка удалена');
        break;
      }

      /* --- редактор --- */
      case 'closeDialog': {
        const d = H.$$('dialog[open]').find(x => x.id === btn.dataset.dialog);
        if (d) d.close();
        break;
      }

      case 'pickColor': H.editor.setColor(btn.dataset.color); break;
      case 'pickEmoji': H.editor.setEmoji(btn.dataset.emoji); break;
      case 'pickDay': H.editor.toggleDay(Number(btn.dataset.day)); break;
      case 'pw': H.editor.stepPerWeek(Number(btn.dataset.step)); break;
      case 'clearReminder': el('eReminder').value = ''; break;

      /* --- шаблоны --- */
      case 'applyTemplate':
        H.$('#templates').close();
        H.applyTemplate(btn.dataset.id);
        break;

      /* --- настройки --- */
      case 'setTheme':
        H.state.settings.theme = btn.dataset.theme;
        H.save({ noBackup: true });
        H.render();
        H.openSettings();
        break;

      case 'setWeekStart':
        H.state.settings.weekStart = Number(btn.dataset.ws);
        H.viewWeek = H.startOfWeek(H.todayStart());
        H.save({ noBackup: true });
        H.render();
        H.openSettings();
        break;

      case 'askPermission':
        if (!('Notification' in window)) { H.toast('Уведомления не поддерживаются'); break; }
        Notification.requestPermission().then(p => {
          H.toast(p === 'granted' ? 'Уведомления разрешены' : 'Уведомления не разрешены');
          H.openSettings();
        });
        break;

      case 'exportJson': H.exportJSON(); break;
      case 'exportCsv': H.exportCSV(); break;
      case 'importJson': pickImport(); break;

      case 'restore':
        if (!confirm('Восстановить данные из копии за ' + H.fmtDM(btn.dataset.date) + '? Текущие изменения будут заменены.')) break;
        H.restoreBackup(btn.dataset.date);
        H.openSettings();
        break;

      case 'unarchive': {
        const h = findHabit(btn.dataset.id);
        if (!h) break;
        H.pushUndo();
        h.archived = false;
        H.commit();
        H.openSettings();
        break;
      }

      case 'resetAll':
        if (!confirm('Удалить все привычки и историю? Это необратимо.')) break;
        if (!confirm('Точно удалить? Резервная копия останется в настройках.')) break;
        H.pushUndo();
        {
          const keepTheme = H.state.settings.theme;
          H.state = H.blank();
          H.state.settings.theme = keepTheme;
        }
        H.save();
        H.render();
        H.openSettings();
        H.toast('Всё сброшено');
        break;

      case 'install':
        if (H._installPrompt) {
          H._installPrompt.prompt();
          H._installPrompt = null;
          H.$('#settings').close();
        }
        break;
    }
  });

  /* ---------- изменения в полях ---------- */
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'heatSelect') {
      H.heatHabit = t.value;
      H.renderStats();
      return;
    }
    if (t.dataset && t.dataset.act === 'setCompact') {
      H.state.settings.compact = t.checked;
      H.save({ noBackup: true });
      H.render();
      return;
    }
    if (t.dataset && t.dataset.act === 'setReminders') {
      H.state.settings.reminders = t.checked;
      H.save({ noBackup: true });
      if (t.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(() => H.openSettings());
      }
      return;
    }
  });

  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'dayNote') {
      saveNote(e.target.value);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'quickName' && e.key === 'Enter') {
      e.preventDefault();
      quickAdd();
      return;
    }
    if (H.isTyping(e)) return;

    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) {
      e.preventDefault();
      H.undo();
      return;
    }
    if (e.key === 'Escape') { H.closePop(); return; }

    if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
      e.preventDefault();
      H.openEditor(null);
      return;
    }
    if (e.key === 'ArrowLeft') { H.viewWeek = H.addDays(H.viewWeek, -7); H.render(); return; }
    if (e.key === 'ArrowRight') {
      const next = H.addDays(H.viewWeek, 7);
      if (H.dk(next) <= H.dk(H.startOfWeek(H.todayStart()))) { H.viewWeek = next; H.render(); }
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const t = H.todayStart();
      const due = H.activeHabits().filter(h => H.scheduledOn(h, t));
      const h = due[Number(e.key) - 1];
      if (h) { e.preventDefault(); toggleCheck(h, H.todayKey()); }
    }
  });

  /* ---------- долгое нажатие и правая кнопка ---------- */
  document.addEventListener('pointerdown', e => {
    const cell = e.target.closest('.cell');
    if (!cell || cell.disabled) return;
    lpFired = false;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      lpFired = true;
      H.vibrate(18);
      H.openDayMenu(cell.dataset.id, cell.dataset.key, cell);
    }, 480);
  });
  ['pointerup', 'pointermove', 'pointercancel', 'scroll'].forEach(ev =>
    document.addEventListener(ev, () => clearTimeout(lpTimer), { passive: true }));

  document.addEventListener('contextmenu', e => {
    const cell = e.target.closest('.cell');
    if (!cell || cell.disabled) return;
    e.preventDefault();
    H.openDayMenu(cell.dataset.id, cell.dataset.key, cell);
  });

  /* ---------- перетаскивание ---------- */
  document.addEventListener('dragstart', e => {
    const main = e.target.closest('.h-main');
    if (!main) return;
    const row = main.closest('.habit');
    if (!row) return;
    H._dragId = row.dataset.id;
    row.classList.add('dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', H._dragId); } catch (err) { /* ignore */ }
  });

  document.addEventListener('dragend', () => {
    H._dragId = null;
    H.$$('.habit.dragging').forEach(r => r.classList.remove('dragging'));
    H.$$('.habit.drop-target').forEach(r => r.classList.remove('drop-target'));
  });

  document.addEventListener('dragover', e => {
    if (!H._dragId) return;
    const row = e.target.closest('.habit');
    if (!row || row.dataset.id === H._dragId) return;
    e.preventDefault();
    H.$$('.habit.drop-target').forEach(r => r.classList.remove('drop-target'));
    row.classList.add('drop-target');
  });

  document.addEventListener('drop', e => {
    if (!H._dragId) return;
    const row = e.target.closest('.habit');
    if (!row) return;
    e.preventDefault();
    const from = H.state.habits.findIndex(h => h.id === H._dragId);
    const to = H.state.habits.findIndex(h => h.id === row.dataset.id);
    H._dragId = null;
    if (from < 0 || to < 0 || from === to) return;
    H.pushUndo();
    const moved = H.state.habits.splice(from, 1)[0];
    H.state.habits.splice(to, 0, moved);
    H.commit();
  });

  /* ---------- импорт файла ---------- */
  function pickImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.habits)) throw new Error('bad');
        if (!confirm(`Импортировать ${parsed.habits.length} привычек? Текущие данные будут заменены.`)) return;
        H.importData(text);
        H.toast('Импортировано');
        H.$('#settings').close();
      } catch (err) {
        H.toast('Не удалось прочитать файл');
      }
    });
    inp.click();
  }

  /* ---------- старт ---------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.H);
