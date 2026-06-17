/** ============================================================
 * BOLÃO DA COPA 2026 — API (Google Apps Script + Google Sheets)
 * ============================================================
 * COMO INSTALAR (5 passos, ~2 minutos):
 *
 * 1. Abra a planilha do bolão no Google Sheets
 * 2. Menu: Extensões > Apps Script
 * 3. Apague o que estiver lá e cole ESTE arquivo inteiro. Salve (Ctrl+S)
 * 4. Botão azul "Implantar" > Nova implantação > tipo "App da Web":
 *      - Executar como: EU (sua conta)
 *      - Quem pode acessar: QUALQUER PESSOA
 *    > Implantar (vai pedir autorização — pode aceitar, o script
 *      só mexe nessa planilha)
 * 5. Copie a URL que termina em /exec
 *
 * A planilha ganha duas abas: "usuarios" e "palpites".
 * Dá pra ver e corrigir qualquer palpite direto na planilha.
 * ============================================================ */

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let users = ss.getSheetByName('usuarios');
  if (!users) {
    users = ss.insertSheet('usuarios');
    users.appendRow(['id', 'nome', 'avatar', 'criadoEm']);
  }
  let picks = ss.getSheetByName('palpites');
  if (!picks) {
    picks = ss.insertSheet('palpites');
    picks.appendRow(['chave', 'userId', 'matchId', 'casa', 'fora', 'atualizadoEm', 'nome', 'jogo']);
  } else if (picks.getLastColumn() < 8) {
    // planilha antiga: adiciona as colunas legíveis "nome" e "jogo"
    picks.getRange(1, 7, 1, 2).setValues([['nome', 'jogo']]);
    // preenche o nome das linhas já salvas (o jogo só entra em novos palpites)
    const nameById = {};
    users.getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[0]) nameById[String(r[0])] = String(r[1]);
    });
    const rows = picks.getDataRange().getValues();
    if (rows.length > 1) {
      const nomes = [];
      for (let i = 1; i < rows.length; i++) {
        nomes.push([nameById[String(rows[i][1])] || '']);
      }
      picks.getRange(2, 7, nomes.length, 1).setValues(nomes);
    }
  }
  let curios = ss.getSheetByName('curiosidades');
  if (!curios) {
    curios = ss.insertSheet('curiosidades');
    curios.appendRow(['titulo', 'icone', 'texto', 'criadoEm']);
  }
  return { users: users, picks: picks, curios: curios };
}

function readState_() {
  const s = ensureSheets_();
  const users = s.users.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: String(r[0]), name: String(r[1]), avatar: String(r[2]), createdAt: String(r[3]) };
    });
  const picks = {};
  s.picks.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .forEach(function (r) {
      picks[String(r[0])] = { home: Number(r[3]), away: Number(r[4]), updatedAt: String(r[5]) };
    });
  const curios = s.curios.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0] && r[2]; })
    .map(function (r) {
      return { titulo: String(r[0]), icone: String(r[1]), texto: String(r[2]) };
    });
  return { users: users, picks: picks, curios: curios };
}

function userName_(s, userId) {
  const data = s.users.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) return String(data[i][1]);
  }
  return '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_(readState_());
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const s = ensureSheets_();

    // ---------- criar usuário ----------
    if (body.action === 'addUser') {
      const name = String(body.name || '').trim().slice(0, 24);
      if (!name) return json_({ error: 'Digite um nome.' });
      const existing = s.users.getDataRange().getValues().slice(1);
      const dup = existing.some(function (r) {
        return String(r[1]).toLowerCase() === name.toLowerCase();
      });
      if (dup) return json_({ error: 'Já existe alguém com esse nome.' });
      const user = {
        id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36),
        name: name,
        avatar: String(body.avatar || '⚽').slice(0, 8),
        createdAt: new Date().toISOString(),
      };
      s.users.appendRow([user.id, user.name, user.avatar, user.createdAt]);
      return json_({ ok: true, user: user });
    }

    // ---------- salvar palpite ----------
    if (body.action === 'savePick') {
      const userId = String(body.userId || '');
      const matchId = String(body.matchId || '');
      const home = Math.max(0, Math.min(20, parseInt(body.home, 10) || 0));
      const away = Math.max(0, Math.min(20, parseInt(body.away, 10) || 0));
      if (!userId || !matchId) return json_({ error: 'Dados inválidos.' });
      // colunas legíveis só pra facilitar a leitura na planilha:
      // o nome sai da aba "usuarios"; o jogo vem do app (ex.: "Brasil x Argentina")
      const nome = userName_(s, userId);
      const jogo = String(body.jogo || '').slice(0, 80);
      const key = userId + ':' + matchId;
      const data = s.picks.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        // palpite confirmado é imutável: já existe → não sobrescreve
        if (String(data[i][0]) === key) return json_({ ok: true, locked: true });
      }
      const vals = [key, userId, matchId, home, away, new Date().toISOString(), nome, jogo];
      s.picks.appendRow(vals);
      return json_({ ok: true });
    }

    // ---------- adicionar curiosidade ----------
    if (body.action === 'addCurio') {
      const titulo = String(body.titulo || '').trim().slice(0, 40);
      const icone = String(body.icone || '💡').slice(0, 8);
      const texto = String(body.texto || '').trim().slice(0, 300);
      if (!titulo || !texto) return json_({ error: 'Preencha o título e o texto.' });
      s.curios.appendRow([titulo, icone, texto, new Date().toISOString()]);
      return json_({ ok: true });
    }

    return json_({ error: 'Ação desconhecida.' });
  } catch (err) {
    return json_({ error: 'Erro no servidor: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

/** ============================================================
 * BACKFILL RETROATIVO (rode UMA vez, à mão)
 * ------------------------------------------------------------
 * Preenche as colunas "nome" e "jogo" dos palpites que já estavam
 * salvos antes dessas colunas existirem.
 *
 * Como rodar: no editor do Apps Script, escolha "backfillRetroativo"
 * na lista de funções (ao lado do ▶ Executar) e clique em Executar.
 * Pode rodar quantas vezes quiser — é idempotente.
 * ============================================================ */
var ESPN_URL_ =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=400';

// Mesma tradução de nomes que o app usa, pra os jogos baterem com os palpites novos.
var TEAM_PT_ = {
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

function teamNamePt_(name) {
  if (TEAM_PT_[name]) return TEAM_PT_[name];
  var m;
  if ((m = name.match(/^Group ([A-L]) Winner$/))) return '1º do Grupo ' + m[1];
  if ((m = name.match(/^Group ([A-L]) 2nd Place$/))) return '2º do Grupo ' + m[1];
  if ((m = name.match(/^Third Place Group (.+)$/))) return '3º Grupo ' + m[1];
  if ((m = name.match(/^Round of 32 (\d+) Winner$/))) return 'Venc. Jogo ' + m[1] + ' (16 avos)';
  if ((m = name.match(/^Round of 16 (\d+) Winner$/))) return 'Venc. Oitavas ' + m[1];
  if ((m = name.match(/^Quarterfinal (\d+) Winner$/))) return 'Venc. Quartas ' + m[1];
  if ((m = name.match(/^Semifinal (\d+) Winner$/))) return 'Venc. Semifinal ' + m[1];
  if ((m = name.match(/^Semifinal (\d+) Loser$/))) return 'Perd. Semifinal ' + m[1];
  return name;
}

function backfillRetroativo() {
  var s = ensureSheets_();

  // nome -> da aba "usuarios"
  var nameById = {};
  s.users.getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) nameById[String(r[0])] = String(r[1]);
  });

  // jogo -> da ESPN (matchId -> "Time x Time")
  var jogoById = {};
  var res = UrlFetchApp.fetch(ESPN_URL_, { muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  (data.events || []).forEach(function (ev) {
    var comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.competitors) return;
    var home = comp.competitors.filter(function (c) { return c.homeAway === 'home'; })[0];
    var away = comp.competitors.filter(function (c) { return c.homeAway === 'away'; })[0];
    if (!home || !away) return;
    jogoById[String(ev.id)] =
      teamNamePt_(home.team.displayName) + ' x ' + teamNamePt_(away.team.displayName);
  });

  // preenche as colunas 7 (nome) e 8 (jogo) de todas as linhas já salvas
  var rows = s.picks.getDataRange().getValues();
  if (rows.length <= 1) return;
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var userId = String(rows[i][1]);
    var matchId = String(rows[i][2]);
    var nome = nameById[userId] || rows[i][6] || '';
    var jogo = jogoById[matchId] || rows[i][7] || '';
    out.push([nome, jogo]);
  }
  s.picks.getRange(2, 7, out.length, 2).setValues(out);
}
