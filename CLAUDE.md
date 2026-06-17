# Meta Ads Agent

Agente de otimização automática de campanhas Meta Ads usando Claude AI. Monitora performance a cada 30 min (05h–16h BRT), pausa campanhas/adsets/criativos ruins e escala budget das boas. Envia relatório diário via WhatsApp às 16h BRT.

- **Frontend**: Next.js 14 (App Router, TypeScript) → deploy na **Vercel**
- **Backend**: Express (TypeScript) → deploy no **Railway** com PostgreSQL
- Repositório GitHub: `JCPrime01/meta-ads-agent` (branch `principal`).

---

## 1. Stack

### Frontend (raiz `/frontend`)
| Pacote | Versão |
|---|---|
| next | ^14 |
| react / react-dom | ^18 |
| lucide-react | ✓ |
| tailwindcss | ✓ |
| typescript | ✓ |

### Backend (`/backend`)
| Pacote | Versão |
|---|---|
| express | ^4.18.2 |
| @anthropic-ai/sdk | ^0.100.1 |
| axios | ^1.6.7 |
| pg | ^8.11.3 |
| node-cron | ^3.0.3 |
| helmet | ^8 |
| express-rate-limit | ^8 |
| cors | ^2.8.5 |
| dotenv | ^16 |

Runtime: Node 20.

---

## 2. Estrutura de pastas

```
/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  Dashboard principal (campanhas + agente)
│   │   ├── globals.css
│   │   └── api/backend/[...path]/
│   │       └── route.ts              Proxy server-side → backend (injeta API_SECRET)
│   ├── components/
│   │   ├── AgentLog.tsx              Log de ações do agente
│   │   ├── CampaignRow.tsx           Linha da tabela (pause/ativar/budget inline)
│   │   └── StatCard.tsx              Card de KPI
│   ├── lib/
│   │   └── api.ts                    Cliente HTTP (fetch via proxy /api/backend)
│   ├── vercel.json
│   └── next.config.js
│
└── backend/
    ├── Dockerfile
    └── src/
        ├── index.ts                  Entry: helmet, CORS, rate-limit, rotas, migrate, startCron
        ├── middleware/
        │   └── auth.ts               requireApiSecret (timingSafeEqual, fail-closed)
        ├── db/
        │   └── postgres.ts           Pool pg + migrate() idempotente + helpers
        ├── meta/
        │   ├── client.ts             metaGet/metaPost (token via header Authorization)
        │   ├── insights.ts           getAllAccountsInsights + getAllAccountsHierarchical
        │   └── campaigns.ts          pause/activate/updateBudget (campaign/adset/ad)
        ├── agent/
        │   ├── optimizer.ts          runOptimizer() — loop principal com ferramentas Claude
        │   └── diagnostics.ts        diagnose() — análise rápida via claude-haiku
        ├── cron/
        │   └── optimizer.ts          startCron() — cron 30min + relatório diário
        ├── routes/
        │   ├── campaigns.ts          GET / · POST /:id/pause|activate|budget
        │   ├── insights.ts           GET /actions · /snapshots · /diagnose/:id
        │   └── agent.ts              GET /status · POST /toggle · POST /accounts
        └── whatsapp.ts               sendWhatsApp() via WhatsApp Business API
```

---

## 3. Arquitetura

```
Cron (30min, 05h–16h BRT)
      │
      ▼
runOptimizer()
      │  busca insights de todas as contas (Graph API v19.0)
      │  monta prompt com métricas + regras de decisão
      │  chama Claude (claude-opus / sonnet) com tools
      ▼
Claude decide e chama tools:
  pause_campaign / activate_campaign
  pause_adset / activate_adset
  pause_ad / activate_ad
  scale_budget / reduce_budget
  get_hierarchical_data (adsets/ads de campanha específica)
  no_action (relatório sem alteração)
      │
      ▼
logAction() → agent_actions (Postgres)
saveSnapshot() → campaign_snapshots (Postgres)
sendWhatsApp() → notificação imediata de cada ação

Cron 16h BRT → sendDailyReport() → WhatsApp
```

**Frontend**: `lib/api.ts` faz fetch para `/api/backend/*` (proxy Next.js server-side). O proxy injeta o `API_SECRET` — o frontend nunca expõe o secret.

---

## 4. Modelo de dados (Postgres)

| Tabela | Propósito |
|---|---|
| `agent_actions` | Log de cada ação tomada (AGENT ou MANUAL), com reason, value_actual, value_threshold |
| `campaign_snapshots` | Snapshot diário de métricas por campanha (spend, leads, CPL, CTR, etc.) |
| `agent_settings` | Chave/valor persistido (ex: `agent_accounts` — contas gerenciadas) |

---

## 5. Agente Claude (optimizer.ts)

### Tools disponíveis
| Tool | Quando usar |
|---|---|
| `pause_campaign` | CPL alto, sem melhora, dados suficientes |
| `scale_budget` | Conversão boa, margem pra escalar. Máximo `AGENT_BUDGET_MAX` (default R$5.000) |
| `reduce_budget` | CPL elevado mas com potencial — reduz sem pausar |
| `pause_adset` | CPL > R$6 com ≥1 lead, ou 0 leads com gasto ≥ R$10, ou CTR < 0,5% com gasto ≥ R$8 |
| `pause_ad` | CPL > R$5 com ≥1 lead, ou 0 leads com gasto ≥ R$8, ou CTR < 0,3% com gasto ≥ R$5 e ≥300 impressões |
| `activate_campaign` | Reativar campanha pausada HOJE pelo agente |
| `activate_adset` | Reativar adset pausado HOJE se CPL estava próximo do limite (R$6–R$8) |
| `activate_ad` | Reativar ad pausado HOJE se CPL estava próximo do limite |
| `get_hierarchical_data` | Buscar adsets/ads de uma campanha específica pra análise profunda |
| `no_action` | Relatório sem alterações (registrado como log) |

### Guardrails do agente
- `MIN_SPEND` (default R$20): ignora campanhas com gasto abaixo disso
- `AGENT_BUDGET_MAX` (default R$5.000): teto de budget ao escalar
- Só reativa campanhas/adsets/ads pausados **HOJE** (lista do banco) — nunca reativa algo pausado manualmente dias antes
- Agente pode ser desabilitado via toggle no dashboard sem redeploy

---

## 6. Contas Meta

Hardcoded em `backend/src/routes/agent.ts` (constante `ALL_ACCOUNTS`):
```
act_1095859619406442 → CA 01
act_1628949641648813 → CA 02
act_1520081442881968 → CA 03
act_1430948741654012 → CA 04
act_1322469786598233 → CA 05
```

O dashboard permite selecionar quais contas o agente gerencia (persistido em `agent_settings`). Padrão: todas.

---

## 7. Variáveis de ambiente

### Backend (Railway)
| Var | Obrigatória | Comportamento se ausente |
|---|---|---|
| `DATABASE_URL` | Sim | migrate() falha → exit(1) |
| `META_ACCESS_TOKEN` | Sim | Chamadas à Graph API falham |
| `META_AD_ACCOUNTS` | Sim | CSV de account IDs (ex: `act_123,act_456`) |
| `ANTHROPIC_API_KEY` | Sim | Agente não roda (fallback para diagnóstico estático) |
| `API_SECRET` | Sim | fail-closed: rejeita TODAS as requisições se ausente |
| `WHATSAPP_TOKEN` | Não | Notificações WhatsApp desabilitadas |
| `WHATSAPP_PHONE_ID` | Não | ID do número WhatsApp Business |
| `WHATSAPP_TO` | Não | Número destino das notificações |
| `FRONTEND_URL` | Sim (prod) | CORS recusa todas as origens se ausente |
| `AGENT_ENABLED` | Não | Default `true`; setar `false` desabilita o cron |
| `AGENT_BUDGET_MAX` | Não | Default R$5.000 |
| `AGENT_MIN_SPEND` | Não | Default R$20 |
| `PORT` | Não | Railway injeta; default 3002 |

### Frontend (Vercel)
| Var | Obrigatória | Descrição |
|---|---|---|
| `BACKEND_URL` | Sim | URL pública do backend Railway, sem barra final |
| `API_SECRET` | Sim | Mesmo valor do backend — proxy injeta no header |

---

## 8. Segurança

- **`API_SECRET`**: comparação com `timingSafeEqual` (sem timing attack). Fail-closed: se ausente, retorna 500 e rejeita tudo.
- **`META_ACCESS_TOKEN`**: enviado via header `Authorization: Bearer` (não query param — não aparece em logs).
- **Helmet**: headers de segurança automáticos.
- **Rate limit**: 200 req/15min global.
- **CORS**: restrito a `FRONTEND_URL` + `localhost`. Sem `*.vercel.app` aberto.
- **Validação de budget**: rejeita valores `<= 0` ou `> AGENT_BUDGET_MAX` com 400.
- **Erros**: internos logados no servidor, cliente recebe apenas `"Erro interno"`.

---

## 9. Deploy

### Railway (backend)
1. New Project → Deploy from GitHub → Root Directory = `backend`
2. Adicionar PostgreSQL (injeta `DATABASE_URL`)
3. Setar variáveis obrigatórias: `META_ACCESS_TOKEN`, `META_AD_ACCOUNTS`, `ANTHROPIC_API_KEY`, `API_SECRET`, `FRONTEND_URL`
4. Opcionais: `WHATSAPP_*` para notificações

### Vercel (frontend)
1. New Project → Root Directory = `frontend`
2. Env: `BACKEND_URL` (URL Railway sem barra final), `API_SECRET`

---

## 10. Desenvolvimento local

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env  # preencher META_ACCESS_TOKEN, ANTHROPIC_API_KEY, API_SECRET, DATABASE_URL
npm run dev           # http://localhost:3002

# Terminal 2 — frontend
cd frontend
npm install
# .env.local: BACKEND_URL=http://localhost:3002, API_SECRET=<mesmo do backend>
npm run dev           # http://localhost:3000
```

---

## 11. Convenções

- Branch: `feat/<área>-<o-que>` ou `fix/<área>-<o-que>`
- Título PR: `tipo(área): descrição curta`
- Co-Authored-By: `Claude Sonnet 4.6 <noreply@anthropic.com>` nos commits
- 1 área por PR (escopo enxuto)
