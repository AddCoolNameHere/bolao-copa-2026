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
    picks.appendRow(['chave', 'userId', 'matchId', 'casa', 'fora', 'atualizadoEm']);
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
      const key = userId + ':' + matchId;
      const data = s.picks.getDataRange().getValues();
      let row = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === key) { row = i + 1; break; }
      }
      const vals = [key, userId, matchId, home, away, new Date().toISOString()];
      if (row > 0) s.picks.getRange(row, 1, 1, 6).setValues([vals]);
      else s.picks.appendRow(vals);
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
