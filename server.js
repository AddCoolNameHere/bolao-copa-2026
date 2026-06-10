const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=400';
const CACHE_TTL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Traduções
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Persistência (data.json)
// ---------------------------------------------------------------------------
let db = { users: [], picks: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  /* primeiro uso: arquivo ainda não existe */
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }, 100);
}

// ---------------------------------------------------------------------------
// Jogos (ESPN, com cache)
// ---------------------------------------------------------------------------
let matchCache = { at: 0, matches: [], byId: new Map() };

async function getMatches() {
  if (Date.now() - matchCache.at < CACHE_TTL_MS && matchCache.matches.length) {
    return matchCache.matches;
  }
  try {
    const res = await fetch(ESPN_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('ESPN HTTP ' + res.status);
    const data = await res.json();
    const matches = (data.events || []).map(normalizeEvent).filter(Boolean);
    matches.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    matchCache = { at: Date.now(), matches, byId: new Map(matches.map((m) => [m.id, m])) };
  } catch (err) {
    console.error('Falha ao buscar jogos da ESPN:', err.message);
    // mantém cache antigo se houver
    matchCache.at = Date.now() - CACHE_TTL_MS + 10000; // tenta de novo em 10s
  }
  return matchCache.matches;
}

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
    abbrev: c.team.abbreviation || '',
    logo: c.team.logo || '',
    placeholder: !c.team.logo,
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
    state: st.state || 'pre', // pre | in | post
    completed: !!st.completed,
    clock: comp.status ? comp.status.displayClock : '',
    detail: st.shortDetail || '',
    home: team(home),
    away: team(away),
  };
}

// ---------------------------------------------------------------------------
// Pontuação
// 5 pts: placar exato | 3 pts: resultado + gols de um dos times | 2 pts: só o resultado
// ---------------------------------------------------------------------------
function scorePick(pick, m) {
  if (!m.completed || m.home.score == null || m.away.score == null) return null;
  const hs = m.home.score, as = m.away.score;
  if (pick.home === hs && pick.away === as) return 5;
  if (Math.sign(pick.home - pick.away) === Math.sign(hs - as)) {
    return pick.home === hs || pick.away === as ? 3 : 2;
  }
  return 0;
}

function buildLeaderboard(matches) {
  const rows = db.users.map((u) => {
    const row = {
      id: u.id, name: u.name, avatar: u.avatar,
      points: 0, exact: 0, results: 0, picksCount: 0,
    };
    for (const m of matches) {
      const pick = db.picks[`${u.id}:${m.id}`];
      if (!pick) continue;
      row.picksCount++;
      const pts = scorePick(pick, m);
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

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Palpites dos outros só aparecem depois que a bola rola (anti-cola).
function visiblePicks(matches, userId) {
  const startedIds = new Set(
    matches.filter((m) => m.state !== 'pre' || new Date(m.date) <= new Date()).map((m) => m.id)
  );
  const out = {};
  for (const [key, pick] of Object.entries(db.picks)) {
    const [uid, matchId] = key.split(':');
    if (uid === userId || startedIds.has(matchId)) out[key] = pick;
  }
  return out;
}

app.get('/api/bootstrap', async (req, res) => {
  const matches = await getMatches();
  res.json({
    users: db.users,
    matches,
    picks: visiblePicks(matches, String(req.query.userId || '')),
    leaderboard: buildLeaderboard(matches),
    serverTime: new Date().toISOString(),
  });
});

app.post('/api/users', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24);
  const avatar = String(req.body.avatar || '⚽').slice(0, 8);
  if (!name) return res.status(400).json({ error: 'Digite um nome.' });
  if (db.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Já existe alguém com esse nome.' });
  }
  const user = {
    id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, avatar, createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();
  res.json(user);
});

app.post('/api/picks', async (req, res) => {
  const { userId, matchId } = req.body;
  const home = Number(req.body.home), away = Number(req.body.away);
  if (!db.users.some((u) => u.id === userId)) {
    return res.status(400).json({ error: 'Usuário não encontrado.' });
  }
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 20 || away > 20) {
    return res.status(400).json({ error: 'Placar inválido.' });
  }
  await getMatches();
  const m = matchCache.byId.get(String(matchId));
  if (!m) return res.status(400).json({ error: 'Jogo não encontrado.' });
  if (m.state !== 'pre' || new Date(m.date) <= new Date()) {
    return res.status(403).json({ error: 'Esse jogo já começou — palpite fechado!' });
  }
  db.picks[`${userId}:${matchId}`] = { home, away, updatedAt: new Date().toISOString() };
  save();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`⚽ Bolão da Copa 2026 rodando em http://localhost:${PORT}`);
});
