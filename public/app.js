/* Bolão da Copa 2026 — frontend */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const EMOJIS = ['⚽','🏆','🇧🇷','🦜','👵','👴','👨','👩','🧑','👦','👧','🍀','🔥','⭐','🎉','🐶','🐱','🦁','🐢','🌻','🍕','☕','🎸','🥅'];
  const POLL_MS = 60 * 1000;

  const state = {
    users: [],
    matches: [],
    picks: {},        // "userId:matchId" -> {home, away}
    leaderboard: [],
    userId: localStorage.getItem('bolao_user') || null,
    selectedDay: null,
    expanded: new Set(),  // cards com "palpites da galera" abertos
    dirty: new Set(),     // picks editados localmente ainda não confirmados
    saveTimers: {},
    selectedEmoji: EMOJIS[0],
    tab: 'jogos',
  };

  const me = () => state.users.find((u) => u.id === state.userId) || null;
  const pickKey = (matchId) => `${state.userId}:${matchId}`;
  const dayOf = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ------------------------------------------------------------------ api
  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro de conexão');
    return data;
  }

  async function loadData() {
    try {
      const q = state.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await api(`/api/bootstrap${q}`);
      state.users = data.users;
      state.matches = data.matches;
      state.leaderboard = data.leaderboard;
      // mantém edições locais ainda não salvas
      const merged = { ...data.picks };
      for (const key of state.dirty) {
        if (state.picks[key]) merged[key] = state.picks[key];
      }
      state.picks = merged;
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // ------------------------------------------------------------------ toast
  let toastTimer;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2600);
  }

  // ------------------------------------------------------------------ tela de usuário
  function renderUserScreen() {
    const grid = $('#user-grid');
    grid.innerHTML = '';
    for (const u of state.users) {
      const btn = document.createElement('button');
      btn.className = 'user-card';
      btn.innerHTML = `<span class="avatar"></span><span class="name"></span>`;
      btn.querySelector('.avatar').textContent = u.avatar;
      btn.querySelector('.name').textContent = u.name;
      btn.addEventListener('click', () => selectUser(u.id));
      grid.appendChild(btn);
    }

    const emojiGrid = $('#emoji-grid');
    if (!emojiGrid.childElementCount) {
      for (const e of EMOJIS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = e;
        b.classList.toggle('selected', e === state.selectedEmoji);
        b.addEventListener('click', () => {
          state.selectedEmoji = e;
          emojiGrid.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b));
        });
        emojiGrid.appendChild(b);
      }
    }
  }

  async function selectUser(id) {
    state.userId = id;
    localStorage.setItem('bolao_user', id);
    state.dirty.clear();
    await loadData();
    showApp();
  }

  async function createUser() {
    const name = $('#new-name').value.trim();
    const errEl = $('#add-error');
    errEl.hidden = true;
    try {
      const user = await api('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar: state.selectedEmoji }),
      });
      state.users.push(user);
      toast(`Bem-vindo(a), ${user.name}! 🎉`);
      await selectUser(user.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  }

  // ------------------------------------------------------------------ navegação
  function showUserScreen() {
    $('#screen-app').hidden = true;
    $('#screen-user').hidden = false;
    renderUserScreen();
  }

  function showApp() {
    if (!me()) return showUserScreen();
    $('#screen-user').hidden = true;
    $('#screen-app').hidden = false;
    $('#chip-avatar').textContent = me().avatar;
    $('#chip-name').textContent = me().name;
    renderAll();
  }

  function switchTab(tab) {
    state.tab = tab;
    $('#tab-jogos').hidden = tab !== 'jogos';
    $('#tab-ranking').hidden = tab !== 'ranking';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ dias
  function renderDayNav() {
    const nav = $('#day-nav');
    const days = [...new Set(state.matches.map((m) => dayOf(m.date)))].sort();
    if (!days.length) return;

    if (!state.selectedDay || !days.includes(state.selectedDay)) {
      const today = dayOf(new Date().toISOString());
      state.selectedDay = days.find((d) => d >= today) || days[days.length - 1];
    }

    const liveDays = new Set(state.matches.filter((m) => m.state === 'in').map((m) => dayOf(m.date)));
    nav.innerHTML = '';
    for (const day of days) {
      const d = new Date(day + 'T12:00:00');
      const pill = document.createElement('button');
      pill.className = 'day-pill' + (day === state.selectedDay ? ' active' : '');
      const week = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      pill.innerHTML = `<small></small><span></span>${liveDays.has(day) ? '<span class="dot"></span>' : ''}`;
      pill.querySelector('small').textContent = week;
      pill.querySelector('span:not(.dot)').textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      pill.addEventListener('click', () => {
        state.selectedDay = day;
        renderDayNav();
        renderMatches();
      });
      nav.appendChild(pill);
    }
    const active = nav.querySelector('.day-pill.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ------------------------------------------------------------------ jogos
  function teamHtml(team) {
    const flag = team.logo
      ? `<img src="${team.logo}" alt="" loading="lazy" />`
      : `<span class="flag-fallback">❓</span>`;
    return `<div class="team">${flag}<span class="tname"></span></div>`;
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function ptsBadge(pts) {
    if (pts == null) return '';
    const cls = pts === 5 ? 'pts-5' : pts === 3 ? 'pts-3' : pts === 2 ? 'pts-2' : 'pts-0';
    const label = pts === 5 ? '🎯 +5 pontos!' : pts === 3 ? '👍 +3 pontos' : pts === 2 ? '✅ +2 pontos' : '0 pontos';
    return `<span class="pts-badge ${cls}">${label}</span>`;
  }

  function calcPts(pick, m) {
    if (!m.completed || m.home.score == null) return null;
    if (pick.home === m.home.score && pick.away === m.away.score) return 5;
    if (Math.sign(pick.home - pick.away) === Math.sign(m.home.score - m.away.score)) {
      return pick.home === m.home.score || pick.away === m.away.score ? 3 : 2;
    }
    return 0;
  }

  function renderMatches() {
    const list = $('#match-list');
    const matches = state.matches.filter((m) => dayOf(m.date) === state.selectedDay);
    list.innerHTML = '';
    if (!matches.length) {
      list.innerHTML = '<p class="empty-note">Nenhum jogo nesse dia 😴</p>';
      return;
    }

    let lastStage = null;
    for (const m of matches) {
      if (m.stagePt !== lastStage) {
        lastStage = m.stagePt;
        const h = document.createElement('p');
        h.className = 'stage-heading' + (m.stage === 'final' ? ' final' : '');
        h.textContent = m.stagePt;
        list.appendChild(h);
      }
      list.appendChild(matchCard(m));
    }
  }

  function matchCard(m) {
    const card = document.createElement('article');
    card.className =
      'match-card' + (m.state === 'in' ? ' live' : '') + (m.stage === 'final' ? ' final-match' : '');

    const statusPill =
      m.state === 'in'
        ? `<span class="live-pill">● AO VIVO ${m.clock || ''}</span>`
        : m.state === 'post'
        ? `<span class="done-pill">Encerrado</span>`
        : `<span class="time-pill">🕐 ${fmtTime(m.date)}</span>`;

    const showScore = m.state !== 'pre';
    const pen =
      m.home.shootout != null && m.away.shootout != null
        ? `<span class="pen">(${m.home.shootout} x ${m.away.shootout} nos pênaltis)</span>`
        : '';
    const center = showScore
      ? `<div class="score-center"><span class="big-score">${m.home.score ?? 0} <span style="color:#c9c2ae">x</span> ${m.away.score ?? 0}</span>${pen}</div>`
      : `<div class="score-center"><span class="vs">VS</span></div>`;

    card.innerHTML = `
      <div class="match-meta"><span class="venue"></span>${statusPill}</div>
      <div class="match-row">${teamHtml(m.home)}${center}${teamHtml(m.away)}</div>
    `;
    card.querySelector('.venue').textContent = m.venue;
    const tnames = card.querySelectorAll('.tname');
    tnames[0].textContent = m.home.namePt;
    tnames[1].textContent = m.away.namePt;

    const myPick = state.userId ? state.picks[pickKey(m.id)] : null;

    if (m.state === 'pre') {
      card.appendChild(pickArea(m, myPick));
    } else {
      const div = document.createElement('div');
      div.className = 'my-pick-result';
      if (myPick) {
        const pts = calcPts(myPick, m);
        div.innerHTML = `<span>Seu palpite: <b>${myPick.home} x ${myPick.away}</b></span>${
          m.completed ? ptsBadge(pts) : '<span class="pts-badge pts-wait">aguardando…</span>'
        }`;
      } else {
        div.innerHTML = '<span class="no-pick-note">Você não deu palpite nesse jogo 😢</span>';
      }
      card.appendChild(div);
      card.appendChild(othersArea(m));
    }
    return card;
  }

  function pickArea(m, myPick) {
    const wrap = document.createElement('div');
    wrap.className = 'pick-area';
    wrap.innerHTML = `<p class="pick-label">Seu palpite — toque em + ou −</p>`;

    const row = document.createElement('div');
    row.className = 'pick-row';
    const vals = { home: myPick ? myPick.home : 0, away: myPick ? myPick.away : 0 };
    const savedMsg = document.createElement('p');
    savedMsg.className = 'pick-saved';
    savedMsg.textContent = myPick ? '✓ Palpite salvo' : '';

    const mkStepper = (side) => {
      const st = document.createElement('div');
      st.className = 'stepper';
      st.innerHTML = `<button type="button" aria-label="menos">−</button><span class="val">${vals[side]}</span><button type="button" aria-label="mais">＋</button>`;
      const [minus, plus] = st.querySelectorAll('button');
      const valEl = st.querySelector('.val');
      const change = (delta) => {
        vals[side] = Math.max(0, Math.min(20, vals[side] + delta));
        valEl.textContent = vals[side];
        savedMsg.textContent = 'salvando…';
        savedMsg.style.color = 'var(--muted)';
        schedulePickSave(m.id, vals, savedMsg);
      };
      minus.addEventListener('click', () => change(-1));
      plus.addEventListener('click', () => change(1));
      return st;
    };

    row.appendChild(mkStepper('home'));
    const x = document.createElement('span');
    x.className = 'pick-x';
    x.textContent = '✕';
    row.appendChild(x);
    row.appendChild(mkStepper('away'));
    wrap.appendChild(row);
    wrap.appendChild(savedMsg);
    return wrap;
  }

  function schedulePickSave(matchId, vals, savedMsg) {
    const key = pickKey(matchId);
    state.picks[key] = { home: vals.home, away: vals.away };
    state.dirty.add(key);
    clearTimeout(state.saveTimers[matchId]);
    state.saveTimers[matchId] = setTimeout(async () => {
      try {
        await api('/api/picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: state.userId, matchId, home: vals.home, away: vals.away }),
        });
        state.dirty.delete(key);
        savedMsg.textContent = '✓ Palpite salvo';
        savedMsg.style.color = 'var(--green)';
      } catch (err) {
        savedMsg.textContent = '⚠️ ' + err.message;
        savedMsg.style.color = 'var(--red)';
        toast(err.message, true);
      }
    }, 700);
  }

  function othersArea(m) {
    const wrap = document.createElement('div');
    const others = state.users
      .map((u) => ({ u, pick: state.picks[`${u.id}:${m.id}`] }))
      .filter((x) => x.pick);
    if (!others.length) return wrap;

    const btn = document.createElement('button');
    btn.className = 'others-toggle';
    const listEl = document.createElement('div');
    listEl.className = 'others-list';

    const renderList = () => {
      const open = state.expanded.has(m.id);
      btn.textContent = open ? '▲ Esconder palpites' : `▼ Ver palpites da galera (${others.length})`;
      listEl.hidden = !open;
      if (open && !listEl.childElementCount) {
        for (const { u, pick } of others) {
          const pts = calcPts(pick, m);
          const row = document.createElement('div');
          row.className = 'other-pick';
          row.innerHTML = `<span></span><span class="op-name"></span><span class="op-score">${pick.home} x ${pick.away}</span>${m.completed ? ptsBadge(pts) : ''}`;
          row.querySelector('span').textContent = u.avatar;
          row.querySelector('.op-name').textContent = u.name;
          listEl.appendChild(row);
        }
      }
    };
    btn.addEventListener('click', () => {
      state.expanded.has(m.id) ? state.expanded.delete(m.id) : state.expanded.add(m.id);
      renderList();
    });
    renderList();
    wrap.appendChild(btn);
    wrap.appendChild(listEl);
    return wrap;
  }

  // ------------------------------------------------------------------ ranking
  function renderLeaderboard() {
    const el = $('#leaderboard');
    el.innerHTML = '';
    if (!state.leaderboard.length) {
      el.innerHTML = '<p class="empty-note">Ninguém entrou no bolão ainda!</p>';
      return;
    }
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    for (const r of state.leaderboard) {
      const row = document.createElement('div');
      row.className =
        'lb-row' + (r.id === state.userId ? ' me' : '') + (r.position === 1 ? ' top1' : '');
      row.innerHTML = `
        <span class="lb-pos">${medals[r.position] || r.position + 'º'}</span>
        <span class="lb-avatar"></span>
        <div class="lb-info">
          <p class="lb-name"></p>
          <p class="lb-detail">🎯 ${r.exact} exatos · ✅ ${r.results} resultados · ${r.picksCount} palpites</p>
        </div>
        <div class="lb-points"><b>${r.points}</b><span>PONTOS</span></div>
      `;
      row.querySelector('.lb-avatar').textContent = r.avatar;
      row.querySelector('.lb-name').textContent = r.name + (r.id === state.userId ? ' (você)' : '');
      el.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ render geral + polling
  function renderAll() {
    renderDayNav();
    renderMatches();
    renderLeaderboard();
  }

  async function refresh() {
    if (document.hidden) return;
    const ok = await loadData();
    if (ok && !$('#screen-app').hidden) renderAll();
  }

  // ------------------------------------------------------------------ eventos
  $('#btn-show-add').addEventListener('click', () => {
    const form = $('#add-user-form');
    form.hidden = !form.hidden;
    if (!form.hidden) $('#new-name').focus();
  });
  $('#btn-create-user').addEventListener('click', createUser);
  $('#new-name').addEventListener('keydown', (e) => e.key === 'Enter' && createUser());
  $('#btn-switch-user').addEventListener('click', () => {
    localStorage.removeItem('bolao_user');
    state.userId = null;
    showUserScreen();
  });
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );
  document.addEventListener('visibilitychange', () => !document.hidden && refresh());

  // ------------------------------------------------------------------ start
  (async () => {
    await loadData();
    if (me()) showApp();
    else showUserScreen();
    setInterval(refresh, POLL_MS);
  })();
})();
