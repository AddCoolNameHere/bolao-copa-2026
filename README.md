# ⚽ Bolão da Família — Copa 2026

Site de bolão da Copa do Mundo 2026, feito pra família: mobile-first, sem senha,
com placares ao vivo, ranking e critérios de desempate.

## Como rodar

```
npm install
npm start
```

Abra **http://localhost:3000** no navegador.

## Como a família acessa

**Opção 1 — Mesma rede Wi-Fi (mais fácil):**
todo mundo na mesma casa acessa `http://SEU_IP:3000` (ex.: `http://10.144.90.234:3000`).
O computador precisa ficar ligado com `npm start` rodando.

**Opção 2 — Pela internet, sem instalar nada (túnel):**
com o site rodando, em outro terminal:

```
npx cloudflared tunnel --url http://localhost:3000
```

Ele gera um link público (tipo `https://xxxx.trycloudflare.com`) — manda no grupo
da família. O link muda a cada vez que o túnel reinicia.

**Opção 3 — Hospedar de verdade (recomendado pra Copa inteira):**
suba este projeto no [Render](https://render.com) (Web Service grátis, build
`npm install`, start `npm start`). ⚠️ Importante: os palpites ficam no arquivo
`data.json`; em planos grátis sem disco persistente eles podem ser apagados
quando o serviço reinicia. No Render, adicione um *Persistent Disk* ou use um
plano com disco.

## Como funciona

- **Escolher usuário:** cada pessoa toca no seu nome (sem senha — confiança de família 😄).
  Os palpites dos outros só aparecem **depois que o jogo começa**.
- **Palpites:** botões grandes de **+** e **−**, salva sozinho. Trava na hora que a bola rola.
- **Placares ao vivo:** atualizados automaticamente a cada minuto (API pública da ESPN).

### Pontuação

| Acerto | Pontos |
|---|---|
| 🎯 Placar exato | **5** |
| 👍 Vencedor/empate + gols de um dos times | **3** |
| ✅ Só o vencedor/empate | **2** |

### Desempate

1. Mais placares exatos
2. Mais resultados certos
3. Mais palpites feitos
4. Ordem alfabética

## Dica pros avós

No celular, abra o site no Chrome/Safari e use **"Adicionar à tela de início"** —
vira um aplicativo com ícone, sem precisar digitar o endereço de novo.
