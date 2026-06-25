/* Bolão da Copa 2026 — versão estática (GitHub Pages)
   Jogos: API pública da ESPN (CORS liberado)
   Palpites: Google Apps Script + Google Sheets (ver google-apps-script.gs) */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // URL do App da Web do Google Apps Script (termina em /exec)
  const API_URL = 'https://script.google.com/macros/s/AKfycbyxMdwtjlQkjrdhsG9ZZ5ULZ80B6ZwfqQ6Ku08_Dq5qoJfCOrjjw4MEpoNykTPPqAR-WA/exec';
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
    'final': 'Grande Final',
  };

  // Times "de mentira" do chaveamento (1º do Grupo A, Venc. Oitavas 3 etc.)
  const isPlaceholderTeam = (name) =>
    /^(Group [A-L] (Winner|2nd Place)|Third Place Group .+|Round of (32|16) \d+ Winner|Quarterfinal \d+ Winner|Semifinal \d+ (Winner|Loser))$/.test(name);

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
      defined:
        !isPlaceholderTeam(home.team.displayName) &&
        !isPlaceholderTeam(away.team.displayName),
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
    selectedDayJogos: null,
    selectedDayGalera: null,
    galeraMode: 'jogo',     // 'jogo' | 'pessoa'
    galeraPerson: null,
    dirty: new Set(),
    expanded: new Set(),    // jogos com a galera aberta (aba Jogos)
    selectedEmoji: EMOJIS[0],
    tab: 'palpitar',
    pendingRoute: null,     // pra onde ir depois de escolher o usuário
    showPicked: false,      // seção "já palpitados" aberta?
  };

  const me = () => state.users.find((u) => u.id === state.userId) || null;
  const pickKey = (matchId) => `${state.userId}:${matchId}`;
  const matchById = (id) => state.matches.find((m) => m.id === String(id));
  const matchStarted = (m) => m.state !== 'pre' || new Date(m.date) <= new Date();
  // os palpites da galera num jogo só aparecem depois que ele começa,
  // quando ninguém mais pode palpitar nem mudar nada
  const canSeePicks = (m) => matchStarted(m);
  const dayOf = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // fase atual = fase do primeiro jogo ainda não encerrado
  function currentPhase() {
    const m = state.matches.find((x) => !x.completed);
    return m ? m.stage : null;
  }
  const phaseLabel = (slug) => STAGE_PT[slug] || 'Copa 2026';

  // jogos da fase já definidos, ainda não começados e sem palpite meu
  function missingPicks(phase) {
    if (!state.userId) return [];
    return state.matches.filter(
      (m) => m.stage === phase && m.defined && !matchStarted(m) && !state.picks[pickKey(m.id)]
    );
  }

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
    if (!apiReady()) return { users: [], picks: {}, curios: [] };
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar os palpites');
    const data = await res.json();
    return { users: data.users || [], picks: data.picks || {}, curios: data.curios || [] };
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
      state.curiosRemote = remote.curios || [];
      buildCurioDeck();
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
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  // ------------------------------------------------------------------ telas
  function show(screen) {
    $('#screen-entry').hidden = screen !== 'entry';
    $('#screen-user').hidden = screen !== 'user';
    $('#screen-app').hidden = screen !== 'app';
  }

  // ---------- tela de entrada (pergunta da fase) ----------
  function showEntry() {
    const phase = currentPhase();
    if (!phase) return enterApp('jogos'); // Copa acabou
    $('#entry-phase').textContent = phaseLabel(phase);
    show('entry');
  }

  function answerEntry(jaFez) {
    const phase = currentPhase();
    localStorage.setItem('bolao_phase_seen', phase || '');
    state.pendingRoute = jaFez ? 'verificar' : 'palpitar';
    if (me()) routeAfterUser();
    else showUserScreen();
  }

  function routeAfterUser() {
    const route = state.pendingRoute || 'palpitar';
    state.pendingRoute = null;
    if (route === 'verificar') {
      const phase = currentPhase();
      const missing = missingPicks(phase);
      if (missing.length > 0) {
        toast(`Opa! Faltam ${missing.length} palpites da ${phaseLabel(phase)}.`, true);
        enterApp('palpitar');
      } else {
        enterApp('jogos');
      }
    } else {
      enterApp(route);
    }
  }

  // ---------- tela de usuário ----------
  function showUserScreen() {
    show('user');
    renderUserScreen();
  }

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
    routeAfterUser();
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
      const data = await apiPost({ action: 'addUser', name, avatar: state.selectedEmoji });
      state.users.push(data.user);
      toast(`Bem-vindo(a), ${data.user.name}!`);
      await selectUser(data.user.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- app ----------
  function enterApp(tab) {
    if (!me()) return showUserScreen();
    show('app');
    $('#chip-avatar').textContent = me().avatar;
    $('#chip-name').textContent = me().name;
    switchTab(tab || state.tab);
  }

  function switchTab(tab) {
    state.tab = tab;
    ['palpitar', 'jogos', 'chave', 'ranking', 'galera'].forEach((t) => {
      $(`#tab-${t}`).hidden = t !== tab;
    });
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    renderAll();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ helpers de UI
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDayLong(day) {
    const d = new Date(day + 'T12:00:00');
    const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function ptsBadge(pts) {
    if (pts == null) return '';
    const cls = pts === 5 ? 'pts-5' : pts === 3 ? 'pts-3' : pts === 2 ? 'pts-2' : 'pts-0';
    const label = pts === 5 ? 'Placar exato · +5' : pts === 3 ? '+3 pontos' : pts === 2 ? '+2 pontos' : '0 pontos';
    return `<span class="pts-badge ${cls}">${label}</span>`;
  }

  function teamHtml(team) {
    const flag = team.logo
      ? `<img src="${team.logo}" alt="" loading="lazy" />`
      : `<span class="flag-fallback">?</span>`;
    return `<div class="team">${flag}<span class="tname"></span></div>`;
  }

  function matchShell(m, statusPill, centerHtml) {
    const card = document.createElement('article');
    card.className =
      'match-card' + (m.state === 'in' ? ' live' : '') + (m.stage === 'final' ? ' final-match' : '');
    card.innerHTML = `
      <div class="match-meta"><span class="venue"></span>${statusPill}</div>
      <div class="match-row">${teamHtml(m.home)}${centerHtml}${teamHtml(m.away)}</div>
    `;
    card.querySelector('.venue').textContent = m.venue;
    const tnames = card.querySelectorAll('.tname');
    tnames[0].textContent = m.home.namePt;
    tnames[1].textContent = m.away.namePt;
    return card;
  }

  function statusPillOf(m) {
    if (m.state === 'in') return `<span class="live-pill">● AO VIVO ${m.clock || ''}</span>`;
    if (m.state === 'post') return `<span class="done-pill">Encerrado</span>`;
    return `<span class="time-pill">${fmtTime(m.date)}</span>`;
  }

  function centerOf(m) {
    if (m.state === 'pre') return `<div class="score-center"><span class="vs">VS</span></div>`;
    const pen =
      m.home.shootout != null && m.away.shootout != null
        ? `<span class="pen">(${m.home.shootout} x ${m.away.shootout} nos pênaltis)</span>`
        : '';
    return `<div class="score-center"><span class="big-score">${m.home.score ?? 0} <span class="score-x">x</span> ${m.away.score ?? 0}</span>${pen}</div>`;
  }

  function dayNav(container, days, selected, liveDays, onPick) {
    container.innerHTML = '';
    for (const day of days) {
      const d = new Date(day + 'T12:00:00');
      const pill = document.createElement('button');
      pill.className = 'day-pill' + (day === selected ? ' active' : '');
      const week = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      pill.innerHTML = `<small></small><span></span>${liveDays.has(day) ? '<span class="dot"></span>' : ''}`;
      pill.querySelector('small').textContent = week;
      pill.querySelector('span:not(.dot)').textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      pill.addEventListener('click', () => onPick(day));
      container.appendChild(pill);
    }
    const active = container.querySelector('.day-pill.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ------------------------------------------------------------------ aba PALPITAR
  function renderPalpitar() {
    const list = $('#palpitar-list');
    const phase = currentPhase();
    // só entram jogos com os dois times definidos — nada de palpitar
    // em "1º do Grupo A" antes do chaveamento sair
    const future = state.matches.filter((m) => m.defined && !matchStarted(m));

    // progresso da fase (conta só confrontos já definidos)
    const progEl = $('#palpitar-progress');
    if (phase && state.userId) {
      const phaseMatches = state.matches.filter((m) => m.stage === phase && m.defined);
      const done = phaseMatches.filter((m) => state.picks[pickKey(m.id)]).length;
      const pct = phaseMatches.length ? Math.round((done / phaseMatches.length) * 100) : 0;
      progEl.hidden = false;
      progEl.querySelector('.progress-text').textContent =
        `${phaseLabel(phase)} — você palpitou ${done} de ${phaseMatches.length} jogos`;
      progEl.querySelector('.progress-fill').style.width = pct + '%';
    } else {
      progEl.hidden = true;
    }

    list.innerHTML = '';
    if (!future.length) {
      list.innerHTML = '<p class="empty-note">Nenhum confronto definido pra palpitar agora — assim que o chaveamento sair, os jogos aparecem aqui.</p>';
      return;
    }

    // só os que faltam ficam na lista; os já palpitados vão pra
    // uma seção recolhida no final (dá pra revisar e mudar até o jogo começar)
    const pending = future.filter((m) => !state.picks[pickKey(m.id)]);
    const done = future.filter((m) => state.picks[pickKey(m.id)]);

    const renderGroup = (container, matches) => {
      let lastDay = null, lastStage = null;
      for (const m of matches) {
        const day = dayOf(m.date);
        if (day !== lastDay) {
          lastDay = day;
          const h = document.createElement('h3');
          h.className = 'day-heading';
          h.textContent = fmtDayLong(day);
          container.appendChild(h);
          lastStage = null;
        }
        if (m.stagePt !== lastStage) {
          lastStage = m.stagePt;
          const s = document.createElement('p');
          s.className = 'stage-heading' + (m.stage === 'final' ? ' final' : '');
          s.textContent = m.stagePt;
          container.appendChild(s);
        }
        const card = matchShell(m, statusPillOf(m), centerOf(m));
        card.appendChild(pickArea(m));
        container.appendChild(card);
      }
    };

    if (!pending.length) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = 'Você já palpitou todos os jogos abertos. Bom descanso, craque!';
      list.appendChild(p);
    } else {
      renderGroup(list, pending);
    }

    if (done.length) {
      const det = document.createElement('details');
      det.className = 'picked-details';
      det.open = !!state.showPicked;
      const sum = document.createElement('summary');
      sum.textContent = `Já palpitados (${done.length}) — toque pra revisar ou mudar`;
      det.appendChild(sum);
      det.addEventListener('toggle', () => (state.showPicked = det.open));
      const inner = document.createElement('div');
      inner.className = 'match-list';
      renderGroup(inner, done);
      det.appendChild(inner);
      list.appendChild(det);
    }
  }

  // palpite é editável até o jogo começar: steppers pré-preenchidos com
  // o palpite atual (se houver). quando a bola rola, trava de vez.
  function pickArea(m) {
    const wrap = document.createElement('div');
    wrap.className = 'pick-area';
    const existing = state.picks[pickKey(m.id)];

    if (matchStarted(m)) {
      if (existing) renderLockedPick(wrap, existing);
      return wrap;
    }

    wrap.innerHTML = `<p class="pick-label">Seu palpite</p>`;
    const row = document.createElement('div');
    row.className = 'pick-row';
    const vals = { home: existing ? existing.home : 0, away: existing ? existing.away : 0 };

    const mkStepper = (side) => {
      const st = document.createElement('div');
      st.className = 'stepper';
      st.innerHTML = `<button type="button" aria-label="menos">−</button><span class="val">${vals[side]}</span><button type="button" aria-label="mais">＋</button>`;
      const [minus, plus] = st.querySelectorAll('button');
      const valEl = st.querySelector('.val');
      const change = (delta) => {
        vals[side] = Math.max(0, Math.min(20, vals[side] + delta));
        valEl.textContent = vals[side];
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

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-confirm-pick';
    btn.textContent = existing ? 'Atualizar palpite' : 'Confirmar palpite';
    const note = document.createElement('p');
    note.className = 'pick-saved';
    note.style.color = 'var(--muted)';
    note.textContent = existing ? 'Salvo — dá pra mudar até o jogo começar' : 'Dá pra mudar até o jogo começar';
    btn.addEventListener('click', () => confirmPick(m, vals, wrap, btn, note));
    wrap.appendChild(btn);
    wrap.appendChild(note);
    return wrap;
  }

  function renderLockedPick(wrap, pick) {
    wrap.classList.add('locked');
    wrap.innerHTML =
      `<p class="pick-label">Seu palpite</p>` +
      `<p class="pick-locked-score">${pick.home} <span class="score-x">x</span> ${pick.away}</p>` +
      `<p class="pick-saved">🔒 Jogo começou — palpite travado</p>`;
  }

  async function confirmPick(m, vals, wrap, btn, note) {
    if (matchStarted(m)) { toast('Esse jogo já começou — palpite fechado!', true); return; }
    if (!m.defined) { toast('Esse confronto ainda não está definido.', true); return; }
    const key = pickKey(m.id);
    const prev = state.picks[key];
    btn.disabled = true;
    note.textContent = 'salvando…';
    note.style.color = 'var(--muted)';
    state.picks[key] = { home: vals.home, away: vals.away };
    state.dirty.add(key);
    try {
      await apiPost({ action: 'savePick', userId: state.userId, matchId: m.id, home: vals.home, away: vals.away, jogo: `${m.home.namePt} x ${m.away.namePt}` });
      state.dirty.delete(key);
      btn.disabled = false;
      btn.textContent = 'Atualizar palpite';
      note.textContent = '✓ Palpite salvo — dá pra mudar até o jogo começar';
      note.style.color = 'var(--teal)';
      state.leaderboard = buildLeaderboard();
      updateNavBadge();
    } catch (err) {
      if (prev) state.picks[key] = prev; else delete state.picks[key];
      state.dirty.delete(key);
      btn.disabled = false;
      note.textContent = '⚠ ' + err.message;
      note.style.color = 'var(--red)';
      toast(err.message, true);
    }
  }

  // ------------------------------------------------------------------ aba JOGOS
  function renderJogos() {
    const list = $('#jogos-list');
    const nav = $('#jogos-daynav');
    // jogos que já começaram + os que vêm pela frente (até 2 dias na frente)
    const today = dayOf(new Date().toISOString());
    const limit = new Date();
    limit.setDate(limit.getDate() + 2);
    const limitDay = dayOf(limit.toISOString());
    const shown = state.matches.filter((m) => matchStarted(m) || dayOf(m.date) <= limitDay);

    if (!shown.length) {
      nav.innerHTML = '';
      list.innerHTML = '<p class="empty-note">A bola ainda não rolou — o primeiro jogo é dia 11 de junho, México x África do Sul!</p>';
      return;
    }

    const days = [...new Set(shown.map((m) => dayOf(m.date)))].sort();
    if (!state.selectedDayJogos || !days.includes(state.selectedDayJogos)) {
      // abre no dia de hoje, se tiver jogo; senão no dia com jogo mais próximo
      state.selectedDayJogos = days.includes(today)
        ? today
        : days.filter((d) => d <= today).pop() || days[0];
    }
    const liveDays = new Set(shown.filter((m) => m.state === 'in').map((m) => dayOf(m.date)));
    dayNav(nav, days, state.selectedDayJogos, liveDays, (day) => {
      state.selectedDayJogos = day;
      renderJogos();
    });

    list.innerHTML = '';
    const dayMatches = shown.filter((m) => dayOf(m.date) === state.selectedDayJogos);
    let lastStage = null;
    for (const m of dayMatches) {
      if (m.stagePt !== lastStage) {
        lastStage = m.stagePt;
        const h = document.createElement('p');
        h.className = 'stage-heading' + (m.stage === 'final' ? ' final' : '');
        h.textContent = m.stagePt;
        list.appendChild(h);
      }
      const card = matchShell(m, statusPillOf(m), centerOf(m));
      const div = document.createElement('div');
      div.className = 'my-pick-result';
      const myPick = state.userId ? state.picks[pickKey(m.id)] : null;
      const started = matchStarted(m);
      if (myPick) {
        const pts = calcPts(myPick, m);
        const badge = m.completed
          ? ptsBadge(pts)
          : `<span class="pts-badge pts-wait">${started ? 'aguardando fim do jogo' : 'palpite confirmado'}</span>`;
        div.innerHTML = `<span>Seu palpite: <b>${myPick.home} x ${myPick.away}</b></span>${badge}`;
      } else {
        div.innerHTML = started
          ? '<span class="no-pick-note">Você não deu palpite nesse jogo</span>'
          : '<span class="no-pick-note">Você ainda não palpitou — dá tempo, é só ir na aba Palpitar</span>';
      }
      card.appendChild(div);
      card.appendChild(othersArea(m));
      list.appendChild(card);
    }
  }

  // colapsável com os palpites da galera + pontos (aba Jogos).
  // jogo que ainda não começou e que eu não palpitei fica trancado —
  // mesma regra das outras abas, pra não vazar palpite antes da hora
  function othersArea(m) {
    const wrap = document.createElement('div');

    if (!canSeePicks(m)) {
      const n = state.users.filter((u) => state.picks[`${u.id}:${m.id}`]).length;
      const msg = !m.defined
        ? 'Confronto ainda não definido — os palpites abrem quando o chaveamento sair'
        : `Palpite nesse jogo pra ver os da galera — ${n} ${n === 1 ? 'pessoa já palpitou' : 'pessoas já palpitaram'}`;
      const note = document.createElement('div');
      note.className = 'locked-note';
      note.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <span>${msg}</span>`;
      wrap.appendChild(note);
      return wrap;
    }

    const others = state.users
      .map((u) => ({ u, pick: state.picks[`${u.id}:${m.id}`] }))
      .filter((x) => x.pick);
    if (!others.length) return wrap;
    if (m.completed) others.sort((a, b) => calcPts(b.pick, m) - calcPts(a.pick, m));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'others-toggle';
    const listEl = document.createElement('div');
    listEl.className = 'others-list';

    const renderList = () => {
      const open = state.expanded.has(m.id);
      btn.textContent = open
        ? '▲ Esconder palpites da galera'
        : `▼ Ver palpites da galera (${others.length})`;
      listEl.hidden = !open;
      if (open && !listEl.childElementCount) {
        for (const { u, pick } of others) {
          const pts = calcPts(pick, m);
          const row = document.createElement('div');
          row.className = 'other-pick';
          row.innerHTML = `<span></span><span class="op-name"></span><span class="op-score">${pick.home} x ${pick.away}</span>${m.completed ? ptsBadge(pts) : ''}`;
          row.querySelector('span').textContent = u.avatar;
          row.querySelector('.op-name').textContent = u.name + (u.id === state.userId ? ' (você)' : '');
          listEl.appendChild(row);
        }
      }
    };
    btn.addEventListener('click', () => {
      if (state.expanded.has(m.id)) state.expanded.delete(m.id);
      else state.expanded.add(m.id);
      renderList();
    });
    renderList();
    wrap.appendChild(btn);
    wrap.appendChild(listEl);
    return wrap;
  }

  // ------------------------------------------------------------------ aba RANKING
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
          <p class="lb-detail">${r.exact} exatos · ${r.results} resultados · ${r.picksCount} palpites</p>
        </div>
        <div class="lb-points"><b>${r.points}</b><span>PONTOS</span></div>
      `;
      row.querySelector('.lb-avatar').textContent = r.avatar;
      row.querySelector('.lb-name').textContent = r.name + (r.id === state.userId ? ' (você)' : '');
      el.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ aba GALERA
  function renderGalera() {
    $$('#galera-toggle button').forEach((b) =>
      b.classList.toggle('active', b.dataset.mode === state.galeraMode)
    );
    $('#galera-jogo').hidden = state.galeraMode !== 'jogo';
    $('#galera-pessoa').hidden = state.galeraMode !== 'pessoa';
    if (state.galeraMode === 'jogo') renderGaleraJogo();
    else renderGaleraPessoa();
  }

  function renderGaleraJogo() {
    const nav = $('#galera-daynav');
    const list = $('#galera-list');
    const days = [...new Set(state.matches.map((m) => dayOf(m.date)))].sort();
    if (!days.length) { list.innerHTML = ''; return; }
    if (!state.selectedDayGalera || !days.includes(state.selectedDayGalera)) {
      const today = dayOf(new Date().toISOString());
      state.selectedDayGalera = days.find((d) => d >= today) || days[days.length - 1];
    }
    const liveDays = new Set(state.matches.filter((m) => m.state === 'in').map((m) => dayOf(m.date)));
    dayNav(nav, days, state.selectedDayGalera, liveDays, (day) => {
      state.selectedDayGalera = day;
      renderGaleraJogo();
    });

    list.innerHTML = '';
    const dayMatches = state.matches.filter((m) => dayOf(m.date) === state.selectedDayGalera);
    for (const m of dayMatches) {
      const card = matchShell(m, statusPillOf(m), centerOf(m));
      const area = document.createElement('div');
      area.className = 'galera-area';

      if (!canSeePicks(m)) {
        const n = state.users.filter((u) => state.picks[`${u.id}:${m.id}`]).length;
        const msg = !m.defined
          ? 'Confronto ainda não definido — os palpites abrem quando o chaveamento sair'
          : `Palpite nesse jogo pra ver os da galera — ${n} ${n === 1 ? 'pessoa já palpitou' : 'pessoas já palpitaram'}`;
        area.innerHTML = `
          <div class="locked-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <span>${msg}</span>
          </div>`;
      } else {
        const rows = state.users
          .map((u) => ({ u, pick: state.picks[`${u.id}:${m.id}`] }))
          .filter((x) => x.pick);
        if (!rows.length) {
          area.innerHTML = '<p class="no-pick-note">Ninguém palpitou nesse jogo</p>';
        } else {
          for (const { u, pick } of rows) {
            const pts = calcPts(pick, m);
            const row = document.createElement('div');
            row.className = 'other-pick';
            row.innerHTML = `<span></span><span class="op-name"></span><span class="op-score">${pick.home} x ${pick.away}</span>${m.completed ? ptsBadge(pts) : ''}`;
            row.querySelector('span').textContent = u.avatar;
            row.querySelector('.op-name').textContent = u.name + (u.id === state.userId ? ' (você)' : '');
            area.appendChild(row);
          }
        }
      }
      card.appendChild(area);
      list.appendChild(card);
    }
  }

  function renderGaleraPessoa() {
    const chips = $('#galera-people');
    const out = $('#galera-person-picks');
    chips.innerHTML = '';
    if (!state.users.length) { out.innerHTML = '<p class="empty-note">Ninguém entrou no bolão ainda!</p>'; return; }
    if (!state.galeraPerson || !state.users.some((u) => u.id === state.galeraPerson)) {
      const firstOther = state.users.find((u) => u.id !== state.userId) || state.users[0];
      state.galeraPerson = firstOther.id;
    }
    for (const u of state.users) {
      const b = document.createElement('button');
      b.className = 'person-chip' + (u.id === state.galeraPerson ? ' active' : '');
      b.innerHTML = `<span></span><span class="pc-name"></span>`;
      b.querySelector('span').textContent = u.avatar;
      b.querySelector('.pc-name').textContent = u.name;
      b.addEventListener('click', () => {
        state.galeraPerson = u.id;
        renderGaleraPessoa();
      });
      chips.appendChild(b);
    }

    const person = state.users.find((u) => u.id === state.galeraPerson);
    const lb = state.leaderboard.find((r) => r.id === person.id);
    out.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'person-head';
    head.innerHTML = `
      <span class="ph-avatar"></span>
      <div><p class="ph-name"></p><p class="ph-stats">${lb ? `${lb.position}º lugar · ${lb.points} pontos · ${lb.exact} exatos` : ''}</p></div>`;
    head.querySelector('.ph-avatar').textContent = person.avatar;
    head.querySelector('.ph-name').textContent = person.name;
    out.appendChild(head);

    const theirPicks = state.matches
      .map((m) => ({ m, pick: state.picks[`${person.id}:${m.id}`] }))
      .filter((x) => x.pick);

    const visible = theirPicks.filter((x) => canSeePicks(x.m));
    const hidden = theirPicks.length - visible.length;

    if (!visible.length) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = hidden > 0
        ? `${hidden} ${hidden === 1 ? 'palpite trancado' : 'palpites trancados'} — palpite nos mesmos jogos pra ver.`
        : 'Nenhum palpite ainda.';
      out.appendChild(p);
      return;
    }

    for (const { m, pick } of visible.slice().reverse()) {
      const pts = calcPts(pick, m);
      const row = document.createElement('div');
      row.className = 'person-pick';
      row.innerHTML = `
        <div class="pp-match"><span class="pp-teams"></span><span class="pp-real">${m.state === 'pre' ? '' : `${m.home.score ?? 0} x ${m.away.score ?? 0}`}</span></div>
        <div class="pp-bottom"><span class="pp-guess">Palpite: <b>${pick.home} x ${pick.away}</b></span>${m.completed ? ptsBadge(pts) : '<span class="pts-badge pts-wait">em andamento</span>'}</div>`;
      row.querySelector('.pp-teams').textContent = `${m.home.namePt} x ${m.away.namePt}`;
      out.appendChild(row);
    }
    if (hidden > 0) {
      const p = document.createElement('p');
      p.className = 'no-pick-note';
      p.textContent = `+ ${hidden} ${hidden === 1 ? 'palpite escondido' : 'palpites escondidos'} — palpite nos mesmos jogos pra ver`;
      out.appendChild(p);
    }
  }

  // ------------------------------------------------------------------ aba CHAVE (chaveamento)
  function bracketWhen(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${fmtTime(iso)}`;
  }

  function bracketCard(m) {
    const card = document.createElement('div');
    card.className = 'bk-match' + (m.state === 'in' ? ' live' : '') + (m.stage === 'final' ? ' final' : '');
    // vencedor: pelo placar normal e, se empatou, pelos pênaltis
    let winHome = false, winAway = false;
    if (m.completed && m.home.score != null && m.away.score != null) {
      if (m.home.score > m.away.score) winHome = true;
      else if (m.away.score > m.home.score) winAway = true;
      else if (m.home.shootout != null && m.away.shootout != null) {
        winHome = m.home.shootout > m.away.shootout;
        winAway = m.away.shootout > m.home.shootout;
      }
    }
    const teamLine = (t, win) => {
      const flag = t.logo
        ? `<img src="${t.logo}" alt="" loading="lazy" />`
        : `<span class="bk-flag-fallback">?</span>`;
      const score = m.state === 'pre'
        ? ''
        : `<span class="bk-score">${t.score ?? 0}${t.shootout != null ? ` <small>(${t.shootout})</small>` : ''}</span>`;
      return `<div class="bk-team${win ? ' win' : ''}">${flag}<span class="bk-name"></span>${score}</div>`;
    };
    card.innerHTML = teamLine(m.home, winHome) + teamLine(m.away, winAway) + `<div class="bk-when"></div>`;
    const names = card.querySelectorAll('.bk-name');
    names[0].textContent = m.home.namePt;
    names[1].textContent = m.away.namePt;
    const when = card.querySelector('.bk-when');
    if (m.state === 'in') when.innerHTML = '<span class="bk-live">● AO VIVO</span>';
    else if (m.completed) when.textContent = 'Encerrado';
    else when.textContent = bracketWhen(m.date);
    return card;
  }

  // colunas do mata-mata, dos 16 avos até a final (3º lugar junto da final)
  const KO_COLS = [
    { slug: 'round-of-32', label: '16 avos' },
    { slug: 'round-of-16', label: 'Oitavas' },
    { slug: 'quarterfinals', label: 'Quartas' },
    { slug: 'semifinals', label: 'Semis' },
    { slug: 'final', label: 'Final', extra: '3rd-place-match' },
  ];

  function renderChave() {
    const root = $('#bracket');
    root.innerHTML = '';
    const has = (slug) => state.matches.some((m) => m.stage === slug);
    const any = KO_COLS.some((c) => has(c.slug) || (c.extra && has(c.extra)));
    if (!any) {
      root.innerHTML = '<p class="empty-note">O chaveamento aparece aqui assim que a fase de grupos acabar e os confrontos do mata-mata saírem.</p>';
      return;
    }
    for (const col of KO_COLS) {
      const colEl = document.createElement('div');
      colEl.className = 'bracket-col' + (col.slug === 'final' ? ' final' : '');
      const h = document.createElement('h3');
      h.className = 'bracket-col-title' + (col.slug === 'final' ? ' final' : '');
      h.textContent = col.label;
      colEl.appendChild(h);

      const matches = state.matches.filter((m) => m.stage === col.slug);
      if (!matches.length) {
        const ph = document.createElement('p');
        ph.className = 'bracket-empty';
        ph.textContent = 'a definir';
        colEl.appendChild(ph);
      } else {
        for (const m of matches) colEl.appendChild(bracketCard(m));
      }

      if (col.extra) {
        const extras = state.matches.filter((m) => m.stage === col.extra);
        if (extras.length) {
          const lbl = document.createElement('p');
          lbl.className = 'bracket-sub';
          lbl.textContent = '3º lugar';
          colEl.appendChild(lbl);
          for (const m of extras) colEl.appendChild(bracketCard(m));
        }
      }
      root.appendChild(colEl);
    }
  }

  // ------------------------------------------------------------------ badge da aba Palpitar
  function updateNavBadge() {
    const phase = currentPhase();
    const n = phase ? missingPicks(phase).length : 0;
    const badge = $('#nav-badge');
    badge.hidden = n === 0;
    badge.textContent = n;
  }

  // ------------------------------------------------------------------ render geral + polling
  function renderAll() {
    state.leaderboard = buildLeaderboard();
    updateNavBadge();
    if (state.tab === 'palpitar') renderPalpitar();
    else if (state.tab === 'jogos') renderJogos();
    else if (state.tab === 'chave') renderChave();
    else if (state.tab === 'ranking') renderLeaderboard();
    else if (state.tab === 'galera') renderGalera();
  }

  async function refresh() {
    if (document.hidden) return;
    const ok = await loadData();
    if (ok && !$('#screen-app').hidden) renderAll();
  }

  // ------------------------------------------------------------------ curiosidades
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

  // Cards com swipe: deslize pro lado (ou use as setas) pra passar.
  // Curiosidades criadas pela família (planilha) são easter eggs:
  // peso maior no sorteio e visual dourado quando aparecem.
  const FAMILY_WEIGHT = 2;

  let curioDeck = [];
  let curioHistory = [];
  let curioPos = -1;
  let curioTimer = null;
  let curioDeckSize = -1;

  function buildCurioDeck() {
    const file = (window.CURIOSIDADES || []).map((c, i) => ({
      key: 'f' + i, titulo: c.pais, icone: c.emoji, texto: c.fato,
      family: false, weight: 1,
    }));
    const remote = (state.curiosRemote || []).map((c, i) => ({
      key: 'r' + i, titulo: c.titulo, icone: c.icone, texto: c.texto,
      family: true, weight: FAMILY_WEIGHT,
    }));
    const all = file.concat(remote);
    if (all.length === curioDeckSize) return;
    curioDeckSize = all.length;
    curioDeck = all;
  }

  // sorteio ponderado, evitando repetir as últimas vistas
  function pickNextCurio() {
    const recent = new Set(curioHistory.slice(-6).map((c) => c.key));
    let pool = curioDeck.filter((c) => !recent.has(c.key));
    if (!pool.length) pool = curioDeck;
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of pool) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return pool[pool.length - 1];
  }

  function showCurio(dir) {
    if (!curioDeck.length) {
      $$('.curio-card').forEach((el) => (el.hidden = true));
      return;
    }
    const c = curioHistory[curioPos];
    if (!c) return;
    const iso = FLAG_ISO[(c.titulo || '').trim()];
    $$('.curio-card').forEach((el) => {
      el.hidden = false;
      el.classList.toggle('family', !!c.family);
      const body = el.querySelector('.curio-body');
      body.classList.remove('anim-next', 'anim-prev');
      void body.offsetWidth; // reinicia a animação
      const flagEl = el.querySelector('.curio-flag');
      if (iso) {
        flagEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = `https://flagcdn.com/${iso}.svg`;
        img.alt = c.titulo;
        flagEl.appendChild(img);
      } else {
        flagEl.textContent = c.icone || '💡';
      }
      el.querySelector('.curio-label').textContent = c.family ? '★ Curiosidade da família' : 'Você sabia?';
      el.querySelector('.curio-country').textContent = c.titulo || '';
      el.querySelector('.curio-text').textContent = c.texto || '';
      if (dir === 1) body.classList.add('anim-next');
      else if (dir === -1) body.classList.add('anim-prev');
    });
  }

  function curioNav(dir) {
    if (!curioDeck.length) return;
    if (dir === -1) {
      if (curioPos <= 0) return; // não tem mais pra voltar
      curioPos--;
    } else {
      if (curioPos < curioHistory.length - 1) {
        curioPos++; // refazendo o caminho de volta
      } else {
        curioHistory.push(pickNextCurio());
        curioPos++;
      }
    }
    showCurio(dir);
    resetCurioTimer();
  }

  function resetCurioTimer() {
    clearInterval(curioTimer);
    curioTimer = setInterval(() => {
      if (!curioDeck.length) return;
      curioHistory.push(pickNextCurio());
      curioPos = curioHistory.length - 1;
      showCurio(1);
    }, 12000);
  }

  function startCurios() {
    buildCurioDeck();
    if (curioDeck.length) {
      curioHistory.push(pickNextCurio());
      curioPos = 0;
    }
    showCurio(0);
    resetCurioTimer();
    $$('.curio-card').forEach((el) => {
      el.querySelector('.curio-nav.prev').addEventListener('click', () => curioNav(-1));
      el.querySelector('.curio-nav.next').addEventListener('click', () => curioNav(1));
      let sx = 0, sy = 0;
      el.addEventListener('touchstart', (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      }, { passive: true });
      el.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          curioNav(dx < 0 ? 1 : -1);
        }
      }, { passive: true });
    });
  }

  // ------------------------------------------------------------------ eventos
  $('#btn-entry-sim').addEventListener('click', () => answerEntry(true));
  $('#btn-entry-nao').addEventListener('click', () => answerEntry(false));
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
    state.pendingRoute = null;
    showUserScreen();
  });
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $$('#galera-toggle button').forEach((b) =>
    b.addEventListener('click', () => {
      state.galeraMode = b.dataset.mode;
      renderGalera();
    })
  );
  document.addEventListener('visibilitychange', () => !document.hidden && refresh());

  // ------------------------------------------------------------------ start
  (async () => {
    startCurios();
    const ok = await loadData();
    if (!ok) {
      $('#jogos-list').innerHTML = '<p class="empty-note">Sem conexão. Recarregue a página.</p>';
    }
    const phase = currentPhase();
    const seen = localStorage.getItem('bolao_phase_seen');
    if (phase && seen !== phase) {
      showEntry(); // fase nova (ou primeira visita): pergunta de novo
    } else if (me()) {
      enterApp(state.tab);
    } else {
      showUserScreen();
    }
    setInterval(refresh, POLL_MS);
  })();
})();
