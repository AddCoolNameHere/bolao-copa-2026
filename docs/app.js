/* Bolão da Copa 2026 — versão estática (GitHub Pages)
   Jogos: API pública da ESPN (CORS liberado)
   Palpites: Google Apps Script + Google Sheets (ver google-apps-script.gs) */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // URL do App da Web do Google Apps Script (termina em /exec)
  const API_URL = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT';
  const ESPN_URL =
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=400';

  const EMOJIS = [
    '⚽','🏆','🥇','🎯','🥅','🧤','🇧🇷','🦜',
    '👵','👴','👨','👩','🧑','👦','👧','👶',
    '🧓','👱','💃','🕺','🤓','😎','🤩','😜',
    '😺','🐶','🐱','🦁','🐯','🐻','🐼','🐨',
    '🐸','🐢','🦉','🦅','🦄','🐝','🦋','🐙',
    '🌻','🌵','🌈','⭐','🔥','⚡','🍀','🎉',
    '🍕','🍔','🌮','🍿','☕','🍺','🧉','🍫',
    '🎸','🎮','🎲','🚀','🏖️','📚','🧶','🛵',
  ];
  const POLL_MS = 60 * 1000;

  // ------------------------------------------------------------------ traduções
  const TEAM_PT = {
    'Algeria': 'Argélia', 'Argentina': 'Argentina', 'Australia': 'Austrália',
    'Austria': 'Áustria', 'Belgium': 'Bélgica', 'Bosnia-Herzegovina': 'Bósnia',
    'Brazil': 'Brasil', 'Canada': 'Canadá', 'Cape Verde': 'Cabo Verde',
    'Colombia': 'Colômbia', 'Congo DR': 'RD Congo', 'Croatia': 'Croácia',
    'Curaçao': 'Curaçao', 'Czechia': 'Tchéquia', 'Ecuador': 'Equador',
    'Egypt': 'Egito', 'England': 'Inglaterra', 'France': 'França',
    'Germany': 'Alemanha', 'Ghana': 'Gana', 'Haiti': 'Haiti', 'Iran': 'Irã',
    'Iraq': 'Iraque', 'Ivory Coast': 'Costa do Marfim', 'Japan': 'Japão',
    'Jordan': 'Jordânia', 'Mexico': 'México', 'Morocco': 'Marrocos',
    'Netherlands': 'Holanda', 'New Zealand': 'Nova Zelândia', 'Norway': 'Noruega',
    'Panama': 'Panamá', 'Paraguay': 'Paraguai', 'Portugal': 'Portugal',
    'Qatar': 'Catar', 'Scotland': 'Escócia', 'Saudi Arabia': 'Arábia Saudita',
    'Senegal': 'Senegal', 'South Africa': 'África do Sul',
    'South Korea': 'Coreia do Sul', 'Spain': 'Espanha', 'Sweden': 'Suécia',
    'Switzerland': 'Suíça', 'Tunisia': 'Tunísia', 'Türkiye': 'Turquia',
    'United States': 'Estados Unidos', 'Uruguay': 'Uruguai',
    'Uzbekistan': 'Uzbequistão',
  };

  function teamNamePt(name) {
    if (TEAM_PT[name]) return TEAM_PT[name];
    let m;
    if ((m = name.match(/^Group ([A-L]) Winner$/))) return `1º do Grupo ${m[1]}`;
    if ((m = name.match(/^Group ([A-L]) 2nd Place$/))) return `2º do Grupo ${m[1]}`;
    if ((m = name.match(/^Third Place Group (.+)$/))) return `3º Grupo ${m[1]}`;
    if ((m = name.match(/^Round of 32 (\d+) Winner$/))) return `Venc. Jogo ${m[1]} (16 avos)`;
    if ((m = name.match(/^Round of 16 (\d+) Winner$/))) return `Venc. Oitavas ${m[1]}`;
    if ((m = name.match(/^Quarterfinal (\d+) Winner$/))) return `Venc. Quartas ${m[1]}`;
    if ((m = name.match(/^Semifinal (\d+) Winner$/))) return `Venc. Semifinal ${m[1]}`;
    if ((m = name.match(/^Semifinal (\d+) Loser$/))) return `Perd. Semifinal ${m[1]}`;
    return name;
  }

  const STAGE_PT = {
    'group-stage': 'Fase de Grupos',
    'round-of-32': '16 avos de final',
    'round-of-16': 'Oitavas de final',
    'quarterfinals': 'Quartas de final',
    'semifinals': 'Semifinal',
    '3rd-place-match': 'Disputa do 3º lugar',
    'final': 'GRANDE FINAL',
  };

  function normalizeEvent(ev) {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    if (!home || !away) return null;
    const st = (comp.status && comp.status.type) || {};
    const team = (c) => ({
      name: c.team.displayName,
      namePt: teamNamePt(c.team.displayName),
      logo: c.team.logo || '',
      score: c.score != null ? Number(c.score) : null,
      shootout: c.shootoutScore != null ? Number(c.shootoutScore) : null,
    });
    return {
      id: String(ev.id),
      date: comp.startDate || ev.date,
      stage: ev.season ? ev.season.slug : 'group-stage',
      stagePt: STAGE_PT[ev.season && ev.season.slug] || 'Copa 2026',
      venue: comp.venue
        ? `${comp.venue.fullName || ''}${comp.venue.address ? ' · ' + comp.venue.address.city : ''}`
        : '',
      state: st.state || 'pre',
      completed: !!st.completed,
      clock: comp.status ? comp.status.displayClock : '',
      home: team(home),
      away: team(away),
    };
  }

  // ------------------------------------------------------------------ estado
  const state = {
    users: [],
    matches: [],
    picks: {},        // "userId:matchId" -> {home, away}
    leaderboard: [],
    userId: localStorage.getItem('bolao_user') || null,
    selectedDay: null,
    expanded: new Set(),
    dirty: new Set(),
    saveTimers: {},
    selectedEmoji: EMOJIS[0],
    tab: 'jogos',
  };

  const me = () => state.users.find((u) => u.id === state.userId) || null;
  const pickKey = (matchId) => `${state.userId}:${matchId}`;
  const matchById = (id) => state.matches.find((m) => m.id === String(id));
  const matchStarted = (m) => m.state !== 'pre' || new Date(m.date) <= new Date();
  const dayOf = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ------------------------------------------------------------------ dados
  async function fetchMatches() {
    const res = await fetch(ESPN_URL);
    if (!res.ok) throw new Error('Falha ao buscar os jogos');
    const data = await res.json();
    const matches = (data.events || []).map(normalizeEvent).filter(Boolean);
    matches.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return matches;
  }

  const apiReady = () => /^https:\/\/script\.google/.test(API_URL);

  async function fetchState() {
    if (!apiReady()) return { users: [], picks: {} };
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar os palpites');
    const data = await res.json();
    return { users: data.users || [], picks: data.picks || {} };
  }

  // POST como text/plain = requisição "simples", sem preflight (o
  // Apps Script não responde OPTIONS).
  async function apiPost(payload) {
    if (!apiReady()) throw new Error('O bolão ainda não foi conectado à planilha.');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Falha ao salvar — tente de novo');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function loadData() {
    try {
      const [matches, remote] = await Promise.all([
        fetchMatches().catch(() => state.matches.length ? state.matches : Promise.reject(new Error('jogos'))),
        fetchState(),
      ]);
      state.matches = matches;
      state.users = remote.users;
      const merged = { ...remote.picks };
      for (const key of state.dirty) {
        if (state.picks[key]) merged[key] = state.picks[key];
      }
      state.picks = merged;
      state.leaderboard = buildLeaderboard();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // ------------------------------------------------------------------ pontuação
  function calcPts(pick, m) {
    if (!m.completed || m.home.score == null || m.away.score == null) return null;
    if (pick.home === m.home.score && pick.away === m.away.score) return 5;
    if (Math.sign(pick.home - pick.away) === Math.sign(m.home.score - m.away.score)) {
      return pick.home === m.home.score || pick.away === m.away.score ? 3 : 2;
    }
    return 0;
  }

  function buildLeaderboard() {
    const rows = state.users.map((u) => {
      const row = { id: u.id, name: u.name, avatar: u.avatar, points: 0, exact: 0, results: 0, picksCount: 0 };
      for (const m of state.matches) {
        const pick = state.picks[`${u.id}:${m.id}`];
        if (!pick) continue;
        row.picksCount++;
        const pts = calcPts(pick, m);
        if (pts == null) continue;
        row.points += pts;
        if (pts === 5) row.exact++;
        if (pts >= 2) row.results++;
      }
      return row;
    });
    // Desempate: pontos > placares exatos > resultados certos > nº de palpites > nome
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.exact - a.exact ||
        b.results - a.results ||
        b.picksCount - a.picksCount ||
        a.name.localeCompare(b.name, 'pt-BR')
    );
    let pos = 0, prevKey = null;
    rows.forEach((r, i) => {
      const key = `${r.points}|${r.exact}|${r.results}|${r.picksCount}`;
      if (key !== prevKey) { pos = i + 1; prevKey = key; }
      r.position = pos;
    });
    return rows;
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
    showApp();
  }

  async function createUser() {
    const name = $('#new-name').value.trim().slice(0, 24);
    const errEl = $('#add-error');
    errEl.hidden = true;
    if (!name) {
      errEl.textContent = 'Digite um nome.';
      errEl.hidden = false;
      return;
    }
    const btn = $('#btn-create-user');
    btn.disabled = true;
    try {
      // o Apps Script valida nome duplicado e grava na planilha
      const data = await apiPost({ action: 'addUser', name, avatar: state.selectedEmoji });
      state.users.push(data.user);
      toast(`Bem-vindo(a), ${data.user.name}! 🎉`);
      await selectUser(data.user.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
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

    if (!matchStarted(m)) {
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
        const m = matchById(matchId);
        if (!m || matchStarted(m)) throw new Error('Esse jogo já começou — palpite fechado!');
        // o Apps Script grava só este palpite (sem risco de apagar os outros)
        await apiPost({ action: 'savePick', userId: state.userId, matchId, home: vals.home, away: vals.away });
        state.dirty.delete(key);
        savedMsg.textContent = '✓ Palpite salvo';
        savedMsg.style.color = 'var(--teal)';
      } catch (err) {
        savedMsg.textContent = '⚠️ ' + err.message;
        savedMsg.style.color = 'var(--red)';
        toast(err.message, true);
      }
    }, 700);
  }

  function othersArea(m) {
    const wrap = document.createElement('div');
    if (!matchStarted(m)) return wrap; // anti-cola: só depois que a bola rola
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
    state.leaderboard = buildLeaderboard();
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

  // ------------------------------------------------------------------ curiosidades
  // Bandeiras SVG oficiais (flagcdn.com) pelo nome do país em português.
  // País fora da lista usa o emoji da curiosidade como reserva.
  const FLAG_ISO = {
    'México': 'mx', 'Estados Unidos': 'us', 'Canadá': 'ca',
    'Brasil': 'br', 'Argentina': 'ar', 'Uruguai': 'uy', 'Colômbia': 'co',
    'Equador': 'ec', 'Paraguai': 'py',
    'Alemanha': 'de', 'França': 'fr', 'Inglaterra': 'gb-eng', 'Espanha': 'es',
    'Portugal': 'pt', 'Holanda': 'nl', 'Bélgica': 'be', 'Croácia': 'hr',
    'Suíça': 'ch', 'Áustria': 'at', 'Tchéquia': 'cz', 'Escócia': 'gb-sct',
    'Noruega': 'no', 'Suécia': 'se', 'Turquia': 'tr', 'Bósnia': 'ba',
    'Marrocos': 'ma', 'Senegal': 'sn', 'Egito': 'eg', 'Gana': 'gh',
    'Costa do Marfim': 'ci', 'Argélia': 'dz', 'Tunísia': 'tn',
    'África do Sul': 'za', 'Cabo Verde': 'cv', 'RD Congo': 'cd',
    'Japão': 'jp', 'Coreia do Sul': 'kr', 'Irã': 'ir', 'Arábia Saudita': 'sa',
    'Catar': 'qa', 'Iraque': 'iq', 'Uzbequistão': 'uz', 'Jordânia': 'jo',
    'Austrália': 'au', 'Nova Zelândia': 'nz',
    'Panamá': 'pa', 'Haiti': 'ht', 'Curaçao': 'cw',
  };

  function startCurios() {
    const curios = (window.CURIOSIDADES || []).slice();
    if (!curios.length) {
      document.querySelectorAll('.curio-card').forEach((el) => (el.hidden = true));
      return;
    }
    // embaralha (Fisher-Yates)
    for (let i = curios.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [curios[i], curios[j]] = [curios[j], curios[i]];
    }
    let idx = 0;
    const apply = () => {
      const c = curios[idx % curios.length];
      idx++;
      const iso = FLAG_ISO[(c.pais || '').trim()];
      document.querySelectorAll('.curio-card').forEach((el) => {
        const flagEl = el.querySelector('.curio-flag');
        if (iso) {
          flagEl.innerHTML = '';
          const img = document.createElement('img');
          img.src = `https://flagcdn.com/${iso}.svg`;
          img.alt = c.pais;
          flagEl.appendChild(img);
        } else {
          flagEl.textContent = c.emoji || '⚽';
        }
        el.querySelector('.curio-country').textContent = c.pais || '';
        el.querySelector('.curio-text').textContent = c.fato || '';
      });
    };
    const cycle = () => {
      document.querySelectorAll('.curio-card').forEach((el) => el.classList.add('fade'));
      setTimeout(() => {
        apply();
        document.querySelectorAll('.curio-card').forEach((el) => el.classList.remove('fade'));
      }, 450);
    };
    apply();
    setInterval(cycle, 12000);
  }

  // ------------------------------------------------------------------ start
  (async () => {
    startCurios();
    const ok = await loadData();
    if (!ok) {
      $('#match-list').innerHTML = '<p class="empty-note">Sem conexão 😢 Puxe pra atualizar.</p>';
    }
    if (me()) showApp();
    else showUserScreen();
    setInterval(refresh, POLL_MS);
  })();
})();
