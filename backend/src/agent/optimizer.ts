import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, getAllAccountsHierarchical, CampaignInsight } from '../meta/insights';
import { pauseCampaign, pauseAdset, pauseAd, scaleBudget, updateDailyBudget } from '../meta/campaigns';
import { logAction, saveSnapshot, getRecentActions } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '500');
const MIN_SPEND  = parseFloat(process.env.AGENT_MIN_SPEND  || '20');

// Thresholds fixos definidos pelo gestor
const CPL_PAUSE_CAMPAIGN  = 6.50;
const CPL_SCALE_CAMPAIGN  = 5.50;
const CPL_PAUSE_ADSET     = 5.00;
const CPL_PAUSE_AD        = 4.50;
const CTR_PAUSE_AD        = 0.50; // %

type Tool                 = Anthropic.Messages.Tool;
type MessageParam         = Anthropic.Messages.MessageParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
type ToolUseBlock         = Anthropic.Messages.ToolUseBlock;

const TOOLS: Tool[] = [
  {
    name: 'pause_campaign',
    description: `Pausa uma campanha. Use quando CPL > R$${CPL_PAUSE_CAMPAIGN} com gasto suficiente.`,
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
    description: `Aumenta o budget diário. Use quando CPL ≤ R$${CPL_SCALE_CAMPAIGN} com leads consistentes. Máximo R$${BUDGET_MAX}/dia.`,
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
    description: `Reduz o budget diário. Use quando CPL está entre R$${CPL_SCALE_CAMPAIGN} e R$${CPL_PAUSE_CAMPAIGN} e a campanha está gastando muito.`,
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
    description: `Pausa um conjunto de anúncios. Use quando CPL do conjunto > R$${CPL_PAUSE_ADSET} com gasto suficiente.`,
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
    description: `Pausa um criativo/anúncio. Use quando CPL do criativo > R$${CPL_PAUSE_AD} OU CTR < ${CTR_PAUSE_AD}% com gasto suficiente.`,
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
      await logAction(input.campaign_id!, 'PAUSE_CAMPAIGN', input.reason!, c?.cpl ?? 0, CPL_PAUSE_CAMPAIGN);
      return `✅ Campanha ${input.campaign_id} pausada.`;
    }
    case 'scale_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const newBudget = Math.min(input.new_budget_brl!, BUDGET_MAX);
      const actual = await scaleBudget(input.campaign_id!, c.daily_budget, 1, newBudget);
      await logAction(input.campaign_id!, 'SCALE_UP', input.reason!, c.cpl, CPL_SCALE_CAMPAIGN);
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
      await logAction(input.adset_id!, 'PAUSE_ADSET', input.reason!, 0, CPL_PAUSE_ADSET);
      return `✅ Conjunto ${input.adset_id} pausado.`;
    }
    case 'pause_ad': {
      await pauseAd(input.ad_id!);
      await logAction(input.ad_id!, 'PAUSE_AD', input.reason!, 0, CPL_PAUSE_AD);
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

  const evaluable = campaigns.filter(c => c.status === 'ACTIVE' && c.spend >= MIN_SPEND);

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
    }));

  const systemPrompt = `Você é um gestor de tráfego pago Meta Ads para apostas esportivas no Brasil.

**REGRAS FIXAS — siga exatamente:**

CAMPANHAS (nível campanha):
- CPL > R$${CPL_PAUSE_CAMPAIGN} com gasto ≥ R$${MIN_SPEND} → pause_campaign
- CPL ≤ R$${CPL_SCALE_CAMPAIGN} com leads → scale_budget (conservador, ex: +30% do budget atual, máx R$${BUDGET_MAX})
- CPL entre R$${CPL_SCALE_CAMPAIGN} e R$${CPL_PAUSE_CAMPAIGN} → analise conjuntos e criativos abaixo
- CPL = 0 (sem leads) e gasto ≥ R$${MIN_SPEND} → pause_campaign

CONJUNTOS (nível adset):
- CPL > R$${CPL_PAUSE_ADSET} com gasto ≥ R$5 → pause_adset
- CPL = 0 e gasto ≥ R$15 → pause_adset

CRIATIVOS (nível ad):
- CPL > R$${CPL_PAUSE_AD} com gasto ≥ R$3 → pause_ad
- CTR < ${CTR_PAUSE_AD}% com gasto ≥ R$3 → pause_ad
- CPL = 0 e gasto ≥ R$10 → pause_ad

**Exceções:**
- Gasto abaixo dos mínimos acima → do_nothing (dados insuficientes)
- Não repita ação que já foi feita neste ciclo (veja histórico)
- Budget mínimo ao reduzir: R$10`;

  const userMessage = `**Histórico recente:**
${historyText}

---
**CAMPANHAS ATIVAS (${evaluable.length}):**
${JSON.stringify(campaignSummary, null, 2)}

**CONJUNTOS ATIVOS com gasto (${adsetSummary.length}):**
${JSON.stringify(adsetSummary, null, 2)}

**CRIATIVOS ATIVOS com gasto (${adSummary.length}):**
${JSON.stringify(adSummary, null, 2)}

Aplique as regras em todos os níveis.`;

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
