import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, getAllAccountsHierarchical, CampaignInsight } from '../meta/insights';
import { pauseCampaign, pauseAdset, pauseAd, scaleBudget, updateDailyBudget } from '../meta/campaigns';
import { logAction, saveSnapshot, getRecentActions } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';
import { getAgentAccounts } from '../routes/agent';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '500');
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
    description: 'Pausa um conjunto de anúncios. Use quando o conjunto está claramente drenando budget sem converter, com dados suficientes para ter certeza.',
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
    description: 'Pausa um criativo. Use quando o criativo está claramente com baixo engajamento (CTR muito baixo) ou CPL alto com dados suficientes.',
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
      const actual = await scaleBudget(input.campaign_id!, c.daily_budget, 1, newBudget);
      await logAction(input.campaign_id!, 'SCALE_UP', input.reason!, c.cpl, 0);
      return `✅ Budget escalado para R$${actual.toFixed(2)}.`;
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

  // Histórico das últimas ações
  const recentActions = await getRecentActions(30);
  const historyText = recentActions.length > 0
    ? recentActions.slice(0, 15).map(a =>
        `  [${new Date(a.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${a.action} ${a.campaign_id} — ${a.reason}`
      ).join('\n')
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

**Princípios de decisão:**
- Prefira reduce_budget a pause_campaign — reduzir dá tempo para otimizar sem matar a campanha.
- Ao escalar: máximo +30% do budget atual por ciclo. Nunca escale mais de 2x seguidas sem verificar histórico.
- Conjuntos ou criativos ruins dentro de campanhas boas → pause o elemento ruim, não a campanha inteira.
- Na dúvida: do_nothing com observação clara sobre o que espera ver no próximo ciclo.
- send_alert apenas para situações críticas que precisam de decisão humana urgente.
- Não tome mais de 1 ação por campanha por ciclo.
- Budget mínimo ao reduzir: R$10.`;

  const userMessage = `**Histórico recente de ações:**
${historyText}

---
**CAMPANHAS ATIVAS com gasto hoje (${evaluable.length}):**
${JSON.stringify(campaignSummary, null, 2)}

**CONJUNTOS ATIVOS com gasto (${adsetSummary.length}):**
${JSON.stringify(adsetSummary, null, 2)}

**CRIATIVOS ATIVOS com gasto (${adSummary.length}):**
${JSON.stringify(adSummary, null, 2)}

Analise o portfólio completo e tome as decisões que um gestor experiente tomaria agora. Pense no contexto antes de agir.`;

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
