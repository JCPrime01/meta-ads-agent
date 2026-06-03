import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, getAllAccountsHierarchical, CampaignInsight } from '../meta/insights';
import { pauseCampaign, activateCampaign, activateAdset, activateAd, pauseAdset, pauseAd, updateDailyBudget } from '../meta/campaigns';
import { logAction, saveSnapshot, getRecentActions, getCampaignsPausedToday, getAdsetsPausedToday, getAdsPausedToday } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';
import { getAgentAccounts } from '../routes/agent';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '5000');
const MIN_SPEND   = parseFloat(process.env.AGENT_MIN_SPEND   || '20');

type Tool                 = Anthropic.Messages.Tool;
type MessageParam         = Anthropic.Messages.MessageParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
type ToolUseBlock         = Anthropic.Messages.ToolUseBlock;

const TOOLS: Tool[] = [
  {
    name: 'pause_campaign',
    description: 'Pausa uma campanha. Use quando há dados suficientes e a performance está claramente ruim sem tendência de melhora.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'reason'],
    },
  },
  {
    name: 'scale_budget',
    description: `Aumenta o budget diário. Use quando a campanha está convertendo bem e há margem para escalar com segurança. Máximo R$${BUDGET_MAX}/dia.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        new_budget_brl: { type: 'number' as const },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'new_budget_brl', 'reason'],
    },
  },
  {
    name: 'reduce_budget',
    description: 'Reduz o budget diário. Use quando a campanha está gastando mas com CPL elevado — reduzir dá mais tempo pra otimizar sem pausar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        new_budget_brl: { type: 'number' as const },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'new_budget_brl', 'reason'],
    },
  },
  {
    name: 'pause_adset',
    description: 'Pausa um conjunto de anúncios. Use quando o conjunto está com CPL > R$6 e ≥1 lead, 0 leads com gasto ≥ R$10, ou CTR < 0,5% com gasto ≥ R$8.',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string' as const },
        campaign_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['adset_id', 'campaign_id', 'reason'],
    },
  },
  {
    name: 'pause_ad',
    description: 'Pausa um criativo. Use quando o criativo está com CPL > R$5 e ≥1 lead, 0 leads com gasto ≥ R$8, ou CTR < 0,3% com gasto ≥ R$5 e ≥300 impressões.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string' as const },
        campaign_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['ad_id', 'campaign_id', 'reason'],
    },
  },
  {
    name: 'activate_campaign',
    description: 'Reativa uma campanha que aparece na lista de PAUSADAS HOJE. NUNCA use para campanhas fora dessa lista.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'reason'],
    },
  },
  {
    name: 'activate_adset',
    description: 'Reativa um conjunto pausado HOJE pelo agente. Use apenas se o portfólio melhorou e o CPL quando pausado estava próximo do limite (entre R$6 e R$8).',
    input_schema: {
      type: 'object' as const,
      properties: {
        adset_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['adset_id', 'reason'],
    },
  },
  {
    name: 'activate_ad',
    description: 'Reativa um criativo pausado HOJE pelo agente. Use apenas se o portfólio melhorou e o CPL quando pausado estava próximo do limite (entre R$5 e R$7).',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string' as const },
        reason: { type: 'string' as const },
      },
      required: ['ad_id', 'reason'],
    },
  },
  {
    name: 'send_alert',
    description: 'Envia alerta urgente no WhatsApp. Use apenas para situações críticas que exigem decisão humana imediata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string' as const },
      },
      required: ['message'],
    },
  },
  {
    name: 'do_nothing',
    description: 'Registra observação sem ação. Use quando dados são insuficientes ou a performance está dentro do esperado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, description: 'ID da campanha, conjunto ou criativo' },
        observation: { type: 'string' as const },
      },
      required: ['id', 'observation'],
    },
  },
];

interface ToolInput {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  id?: string;
  reason?: string;
  new_budget_brl?: number;
  message?: string;
  observation?: string;
}

async function executeTool(name: string, input: ToolInput, campaigns: CampaignInsight[]): Promise<string> {
  switch (name) {
    case 'pause_campaign': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      await pauseCampaign(input.campaign_id!);
      await logAction(input.campaign_id!, 'PAUSE_CAMPAIGN', input.reason!, c?.cpl ?? 0, 0);
      return `✅ Campanha ${input.campaign_id} pausada.`;
    }
    case 'scale_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const newBudget = Math.min(input.new_budget_brl!, BUDGET_MAX);
      await updateDailyBudget(input.campaign_id!, newBudget);
      await logAction(input.campaign_id!, 'SCALE_UP', input.reason!, c.cpl, 0);
      return `✅ Budget escalado para R$${newBudget.toFixed(2)}.`;
    }
    case 'reduce_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const newBudget = Math.max(input.new_budget_brl!, 10);
      await updateDailyBudget(input.campaign_id!, newBudget);
      await logAction(input.campaign_id!, 'REDUCE_BUDGET', input.reason!, c.cpl, 0);
      return `✅ Budget reduzido para R$${newBudget.toFixed(2)}.`;
    }
    case 'pause_adset': {
      await pauseAdset(input.adset_id!);
      await logAction(input.adset_id!, 'PAUSE_ADSET', input.reason!, 0, 0);
      return `✅ Conjunto ${input.adset_id} pausado.`;
    }
    case 'pause_ad': {
      await pauseAd(input.ad_id!);
      await logAction(input.ad_id!, 'PAUSE_AD', input.reason!, 0, 0);
      return `✅ Criativo ${input.ad_id} pausado.`;
    }
    case 'activate_campaign': {
      await activateCampaign(input.campaign_id!);
      await logAction(input.campaign_id!, 'ACTIVATE_CAMPAIGN', input.reason!, 0, 0);
      return `✅ Campanha ${input.campaign_id} reativada.`;
    }
    case 'activate_adset': {
      await activateAdset(input.adset_id!);
      await logAction(input.adset_id!, 'ACTIVATE_ADSET', input.reason!, 0, 0);
      return `✅ Conjunto ${input.adset_id} reativado.`;
    }
    case 'activate_ad': {
      await activateAd(input.ad_id!);
      await logAction(input.ad_id!, 'ACTIVATE_AD', input.reason!, 0, 0);
      return `✅ Criativo ${input.ad_id} reativado.`;
    }
    case 'send_alert': {
      await sendWhatsApp(`🚨 *Alerta do Agente*\n\n${input.message}`);
      return '✅ Alerta enviado.';
    }
    case 'do_nothing': {
      return `✅ Observado: ${input.observation}`;
    }
    default:
      return 'Ferramenta desconhecida.';
  }
}

export async function runOptimizer(): Promise<void> {
  console.log('[agent] iniciando ciclo Claude...');

  const campaigns = await getAllAccountsInsights();
  await saveSnapshot(campaigns);

  const allowedAccounts = getAgentAccounts();
  const evaluable = campaigns.filter(c =>
    c.status === 'ACTIVE' &&
    c.spend >= MIN_SPEND &&
    allowedAccounts.includes(c.account_id)
  );

  if (evaluable.length === 0) {
    console.log('[agent] nenhuma campanha com gasto suficiente para avaliar.');
    return;
  }

  const activeCampaignIds = evaluable.map(c => c.campaign_id);
  const { adsets, ads } = await getAllAccountsHierarchical(activeCampaignIds);

  // Candidatas a reativação: pausadas hoje pelo agente OU pausadas manualmente (rodaram hoje mas estão inativas)
  const pausedTodayIds = await getCampaignsPausedToday();
  const reactivationCandidates = campaigns
    .filter(c =>
      (pausedTodayIds.includes(c.campaign_id) || (c.status !== 'ACTIVE' && c.spend > 0)) &&
      allowedAccounts.includes(c.account_id)
    )
    .map(c => ({
      id: c.campaign_id,
      nome: c.campaign_name.slice(0, 50),
      cpl_quando_pausada: c.cpl,
      gasto_hoje: c.spend,
      leads_hoje: c.leads,
      ctr: c.ctr,
    }));

  const adsetsPausedToday = await getAdsetsPausedToday();
  const adsPausedToday = await getAdsPausedToday();

  // Histórico das últimas ações
  const recentActions = await getRecentActions(30);
  const historyText = recentActions.length > 0
    ? recentActions.slice(0, 20).map(a => {
        const who = a.source === 'MANUAL' ? '👤 GESTOR' : '🤖 AGENTE';
        const time = new Date(a.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        return `  [${time}] ${who} — ${a.action} ${a.campaign_id} — ${a.reason}`;
      }).join('\n')
    : '  Nenhuma ação recente.';

  // Resumo compacto para economizar tokens
  const campaignSummary = evaluable.map(c => ({
    id: c.campaign_id,
    nome: c.campaign_name.slice(0, 50),
    budget: c.daily_budget,
    gasto: c.spend,
    leads: c.leads,
    cpl: c.cpl,
    ctr: c.ctr,
    cpc: c.cpc,
    lp_views: c.lp_views,
    custo_por_lp_view: c.cost_per_lp_view > 0 ? +c.cost_per_lp_view.toFixed(2) : 0,
  }));

  const adsetSummary = adsets
    .filter(a => a.status === 'ACTIVE' && a.spend >= 5)
    .map(a => ({
      id: a.adset_id,
      nome: a.adset_name.slice(0, 40),
      camp_id: a.campaign_id,
      gasto: a.spend,
      leads: a.leads,
      cpl: a.cpl,
      ctr: a.ctr,
      cpc: a.cpc,
      lp_views: a.lp_views,
      custo_por_lp_view: a.cost_per_lp_view > 0 ? +a.cost_per_lp_view.toFixed(2) : 0,
    }));

  const adSummary = ads
    .filter(a => a.status === 'ACTIVE' && a.spend >= 3)
    .map(a => ({
      id: a.ad_id,
      nome: a.ad_name.slice(0, 40),
      adset_id: a.adset_id,
      camp_id: a.campaign_id,
      gasto: a.spend,
      leads: a.leads,
      cpl: a.cpl,
      ctr: a.ctr,
      cpc: a.cpc,
      lp_views: a.lp_views,
      custo_por_lp_view: a.cost_per_lp_view > 0 ? +a.cost_per_lp_view.toFixed(2) : 0,
    }));

  console.log(`[agent] campanhas: ${evaluable.length} | adsets: ${adsetSummary.length} | criativos: ${adSummary.length}`);

  const nowBRT = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const systemPrompt = `Você é um media buyer sênior especializado em Meta Ads para iGaming e apostas esportivas no Brasil, com foco em aquisição de depositantes (FTD), CPA gaming e escala agressiva no mercado LATAM.

**Contexto do negócio:**
- Produto: apostas esportivas / cassino online. Conversão = cadastro completo (complete_registration) que leva ao primeiro depósito (FTD).
- CPL de referência: excelente abaixo de R$4 | bom até R$6 | preocupante acima de R$6 | crítico acima de R$8,50.
- Budget máximo por campanha: R$${BUDGET_MAX}/dia.
- Agora são ${nowBRT}.

**Leitura de métricas como media buyer:**
- CTR meta: > 2%. Abaixo de 1% com dados suficientes = criativo fraco ou público errado.
- CPM alto + CTR alto = público certo, criativo funciona → escale.
- CPM alto + CTR baixo = público errado ou criativo ruim → pause ad/adset.
- CPC alto + lp_views baixos = problema no criativo ou no público.
- lp_views altos + leads baixos = problema na landing page (não mexa na campanha, alerte).
- custo_por_lp_view acima de R$1,50 = sinal de que o tráfego está caro ou o criativo não está convertendo clique.

**Antes de agir, pense:**

1. **Dados suficientes?**
   - Campanha com menos de R$30 de gasto → não pause, apenas observe.
   - Menos de 3 leads → CPL não é confiável, não use como critério de pausa.
   - Menos de 1.000 impressões → CTR não é confiável ainda.

2. **Foi mexida recentemente?**
   - Escalada há menos de 1h → em aprendizado, não mexa.
   - Mesma ação repetida no mesmo ID em menos de 2h → pare de oscilar, observe.

3. **Contexto do portfólio:**
   - Maioria com CPL bom e uma com CPL ruim → caso isolado, prefira reduce_budget antes de pausar.
   - Portfólio inteiro com CPL alto → provável problema externo (evento fraco, dia ruim) → send_alert, não pause tudo.
   - Várias campanhas escalando bem → foque em escalar as melhores antes de cortar as piores.

4. **CPL > R$8,50 com dados suficientes — analise junto:**
   - CPC alto + CTR baixo + lp_views baixos → pause_campaign (problema de topo de funil).
   - CPC baixo + lp_views altos + poucos leads → problema na LP → send_alert, não pause.
   - Sem padrão claro → reduce_budget e observe mais um ciclo.

**Reativação de campanhas pausadas hoje:**
Você receberá uma lista de campanhas pausadas HOJE (pelo agente ou pelo gestor — inclusive pausas manuais via Meta). Você pode reativar usando activate_campaign APENAS para essas. NUNCA reative campanhas que não estejam nessa lista.

Critérios para reativar campanha:
- O CPL médio do portfólio ativo agora está significativamente melhor do que quando ela foi pausada.
- A campanha tinha bom histórico (CPL baixo antes de piorar hoje — veja o histórico de ações).
- Faz pelo menos 1 ciclo (30 min) desde a pausa — dá tempo pro Meta resetar.
- Se o CPL quando foi pausada era extremamente alto (ex: R$15+), não reative — foi problema estrutural.

**Reativação de conjuntos e criativos pausados hoje:**
Você também receberá listas de conjuntos (activate_adset) e criativos (activate_ad) pausados HOJE pelo agente. Critérios para reativar:
- Conjunto: CPL quando pausado estava entre R$6 e R$8 E o portfólio ativo agora tem CPL médio muito melhor — pode ser problema pontual.
- Criativo: CPL quando pausado estava entre R$5 e R$7 E outros criativos da mesma campanha agora estão performando pior.
- Faz pelo menos 1 ciclo (30 min) desde a pausa.
- Se CPL quando pausado estava acima de R$10 (conjunto) ou R$8 (criativo) — não reative.

**Aprenda com o gestor:**
No histórico você verá ações marcadas como 👤 GESTOR (feitas manualmente pelo dono das contas) e 🤖 AGENTE (suas próprias ações). Preste atenção especial nas ações do gestor:
- Se ele pausou uma campanha com CPL X → ele considera aquele CPL inaceitável.
- Se ele escalou com CPL Y → ele considera aquele CPL bom o suficiente para crescer.
- Se ele reativou algo que você pausou → você foi conservador demais naquele caso.
- Se ele reduziu budget em vez de pausar → prefere cautela a corte abrupto.
Use esses padrões para calibrar suas próprias decisões no ciclo atual.

**Regras de escala — OBRIGATÓRIO seguir:**
- CPL excelente (< R$4) com gasto ≥ R$${MIN_SPEND}: **ESCALE OBRIGATORIAMENTE +50%**. Não há justificativa para do_nothing numa campanha com CPL < R$4 com dados suficientes. Ex: R$100 → R$150.
- CPL bom (R$4–R$6) com gasto ≥ R$${MIN_SPEND}: **ESCALE +30%**. Ex: R$100 → R$130.
- CPL preocupante (> R$6): não escala — reduce_budget ou do_nothing.
- Budget máximo por campanha: R$${BUDGET_MAX}. Nunca ultrapasse.
- Pode escalar a cada ciclo se a performance continuar boa — não há restrição de "esperar 2 ciclos".
- Se uma campanha foi escalada há menos de 1h, pule — senão, escale normalmente.
- Sempre arredonde o novo budget para número inteiro.
- **Regra de ouro:** se há campanhas com CPL < R$6 e dados suficientes, ESCALE antes de gastar tempo analisando campanhas ruins. Campanhas boas são prioridade.

**Regras de pausa para CONJUNTOS (pause_adset) — OBRIGATÓRIO seguir:**
- CPL > R$6 com qualquer gasto e ≥ 1 lead: **PAUSE IMEDIATAMENTE**. Não importa quanto gastou — CPL acima de R$6 é inaceitável.
- 0 leads e gasto ≥ R$10: **PAUSE** — gastou o suficiente sem converter nada.
- CTR < 0,5% e gasto ≥ R$8: **PAUSE** — público/criativo não engaja.
- Gasto < R$3: observe, ainda sem dados.
- **Regra de ouro:** CPL > R$6 com lead confirmado = pause imediato, sem exceção.

**Regras de pausa para CRIATIVOS (pause_ad) — OBRIGATÓRIO seguir:**
- CPL > R$5 com qualquer gasto e ≥ 1 lead: **PAUSE IMEDIATAMENTE**. CPL acima de R$5 num criativo = pause, sem mínimo de gasto.
- 0 leads e gasto ≥ R$8: **PAUSE** — consumindo budget sem nenhuma conversão.
- CTR < 0,3% e gasto ≥ R$5 e ≥ 300 impressões: **PAUSE** — criativo não gera clique.
- Gasto < R$2: observe, ainda sem dados.
- **Regra de ouro:** CPL > R$5 com lead confirmado = pause imediato, sem exceção.

**Outros princípios de decisão:**
- Prefira reduce_budget a pause_campaign — reduzir dá tempo para otimizar sem matar a campanha.
- Conjuntos ou criativos ruins dentro de campanhas boas → pause o elemento ruim, não a campanha inteira.
- Na dúvida: do_nothing com observação clara sobre o que espera ver no próximo ciclo.
- send_alert apenas para situações críticas que precisam de decisão humana urgente.
- Não tome mais de 1 ação por campanha por ciclo. Essa regra vale APENAS para campanhas — adsets e criativos são independentes e devem ser avaliados separadamente mesmo que a campanha já tenha sido escalada ou reduzida.
- Budget mínimo ao reduzir: R$10.`;

  const reactivationBlock = [
    reactivationCandidates.length > 0
      ? `\n**CAMPANHAS PAUSADAS HOJE — candidatas a reativação (${reactivationCandidates.length}):**\n${JSON.stringify(reactivationCandidates, null, 2)}`
      : '',
    adsetsPausedToday.length > 0
      ? `\n**CONJUNTOS PAUSADOS HOJE — candidatos a reativação (${adsetsPausedToday.length}):**\n${JSON.stringify(adsetsPausedToday, null, 2)}`
      : '',
    adsPausedToday.length > 0
      ? `\n**CRIATIVOS PAUSADOS HOJE — candidatos a reativação (${adsPausedToday.length}):**\n${JSON.stringify(adsPausedToday, null, 2)}`
      : '',
  ].filter(Boolean).join('\n') + (reactivationCandidates.length + adsetsPausedToday.length + adsPausedToday.length > 0 ? '\n' : '');

  const userMessage = `**Histórico recente de ações:**
${historyText}

---
**CAMPANHAS ATIVAS com gasto hoje (${evaluable.length}):**
${JSON.stringify(campaignSummary, null, 2)}
${reactivationBlock}
**CONJUNTOS ATIVOS com gasto (${adsetSummary.length}):**
${JSON.stringify(adsetSummary, null, 2)}

**CRIATIVOS ATIVOS com gasto (${adSummary.length}):**
${JSON.stringify(adSummary, null, 2)}

Analise o portfólio completo e tome as decisões que um gestor experiente tomaria agora.

IMPORTANTE: Para cada campanha, conjunto e criativo analisado, você DEVE obrigatoriamente chamar uma ferramenta — pause_campaign, scale_budget, reduce_budget, pause_adset, pause_ad, activate_campaign, activate_adset, activate_ad, send_alert ou do_nothing. Não responda com texto. Cada item analisado precisa de uma chamada de ferramenta correspondente. Comece pelas campanhas, depois conjuntos, depois criativos.`;

  const messages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const actionLog: string[] = [];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;
    if (response.stop_reason !== 'tool_use') break;

    const toolResults: ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const toolBlock = block as ToolUseBlock;
      const input = toolBlock.input as ToolInput;
      console.log(`[agent] ${toolBlock.name}:`, input);

      const result = await executeTool(toolBlock.name, input, campaigns);

      if (toolBlock.name === 'pause_campaign') {
        actionLog.push(`⛔ *Pausei campanha*\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'pause_adset') {
        actionLog.push(`⛔ *Pausei conjunto* ${input.adset_id}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'pause_ad') {
        actionLog.push(`⛔ *Pausei criativo* ${input.ad_id}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'activate_campaign') {
        actionLog.push(`✅ *Reativei campanha* ${input.campaign_id}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'activate_adset') {
        actionLog.push(`✅ *Reativei conjunto* ${input.adset_id}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'activate_ad') {
        actionLog.push(`✅ *Reativei criativo* ${input.ad_id}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'scale_budget') {
        actionLog.push(`📈 *Escalei budget* → R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'reduce_budget') {
        actionLog.push(`📉 *Reduzi budget* → R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (actionLog.length > 0) {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const report = `🤖 *Meta Ads Agent*\n${now}\n\n${actionLog.join('\n\n---\n\n')}\n\n_${actionLog.length} ação(ões)_`;
    await sendWhatsApp(report);
  }

  console.log(`[agent] ciclo concluído — ${actionLog.length} ação(ões)`);
}

