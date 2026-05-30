import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, scaleBudget, updateDailyBudget } from '../meta/campaigns';
import { logAction, saveSnapshot, getRecentActions } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '500');
const MIN_SPEND  = parseFloat(process.env.AGENT_MIN_SPEND  || '20');

type Tool                 = Anthropic.Messages.Tool;
type MessageParam         = Anthropic.Messages.MessageParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
type ToolUseBlock         = Anthropic.Messages.ToolUseBlock;

const TOOLS: Tool[] = [
  {
    name: 'pause_campaign',
    description: 'Pausa uma campanha com performance ruim: sem leads após gasto relevante, frequência muito alta, ou CPL muito acima da média do grupo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        reason: { type: 'string' as const, description: 'Motivo objetivo baseado nos dados' },
      },
      required: ['campaign_id', 'reason'],
    },
  },
  {
    name: 'reduce_budget',
    description: 'Reduz o budget diário de uma campanha com CPL acima da média mas que ainda gera leads — prefira reduzir a pausar quando a campanha tem potencial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        new_budget_brl: { type: 'number' as const, description: 'Novo budget diário em reais (deve ser menor que o atual)' },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'new_budget_brl', 'reason'],
    },
  },
  {
    name: 'scale_budget',
    description: 'Aumenta o budget diário de uma campanha com CPL abaixo da média e gerando leads consistentemente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        new_budget_brl: { type: 'number' as const, description: `Novo budget diário em reais — máximo R$${BUDGET_MAX}` },
        reason: { type: 'string' as const },
      },
      required: ['campaign_id', 'new_budget_brl', 'reason'],
    },
  },
  {
    name: 'send_alert',
    description: 'Envia alerta urgente no WhatsApp para situações que exigem decisão humana imediata (ex: gasto anormal, campanha importante caindo).',
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
    description: 'Campanha analisada — sem ação necessária agora (fase de aprendizado, dados insuficientes, ou performance estável).',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        observation: { type: 'string' as const },
      },
      required: ['campaign_id', 'observation'],
    },
  },
];

interface ToolInput {
  campaign_id?: string;
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
      await logAction(input.campaign_id!, 'PAUSE', input.reason!, c?.cpl ?? 0, 0);
      return `✅ Campanha ${input.campaign_id} pausada.`;
    }
    case 'reduce_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const newBudget = Math.max(input.new_budget_brl!, 10);
      await updateDailyBudget(input.campaign_id!, newBudget);
      await logAction(input.campaign_id!, 'REDUCE_BUDGET', input.reason!, c.cpl, c.daily_budget);
      return `✅ Budget reduzido para R$${newBudget.toFixed(2)}.`;
    }
    case 'scale_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const newBudget = Math.min(input.new_budget_brl!, BUDGET_MAX);
      const actual = await scaleBudget(input.campaign_id!, c.daily_budget, 1, newBudget);
      await logAction(input.campaign_id!, 'SCALE_UP', input.reason!, c.cpl, c.daily_budget);
      return `✅ Budget escalado para R$${actual.toFixed(2)}.`;
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

  // Histórico das últimas ações para dar contexto ao agente
  const recentActions = await getRecentActions(30);
  const historyText = recentActions.length > 0
    ? recentActions
        .slice(0, 15)
        .map(a => `  [${new Date(a.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${a.action} campanha ${a.campaign_id} — ${a.reason}`)
        .join('\n')
    : '  Nenhuma ação recente.';

  const summary = evaluable.map(c => ({
    id: c.campaign_id,
    nome: c.campaign_name.slice(0, 60),
    conta: c.account_id,
    budget_diario_brl: c.daily_budget,
    gasto_hoje_brl: c.spend,
    leads: c.leads,
    cpl_brl: c.cpl,
    ctr_pct: c.ctr,
    cpc_brl: c.cpc,
    frequencia: c.frequency,
    impressoes: c.impressions,
    cliques: c.clicks,
    alcance: c.reach,
  }));

  const systemPrompt = `Você é um gestor sênior de tráfego pago Meta Ads, especializado em captação de leads para apostas esportivas no Brasil.

Você roda a cada 30 minutos e decide autonomamente o que fazer com cada campanha ativa.

**Sua missão:** maximizar volume de leads com menor CPL possível, dentro do orçamento disponível.

**Ferramentas disponíveis (em ordem de preferência):**
1. \`do_nothing\` — campanha em fase de aprendizado, dados insuficientes ou performance estável
2. \`reduce_budget\` — CPL acima da média mas ainda gerando leads; reduz gasto sem matar a campanha
3. \`scale_budget\` — CPL abaixo da média com leads consistentes; aumenta até R$${BUDGET_MAX}/dia no máximo
4. \`pause_campaign\` — sem leads após gasto relevante, frequência > 4, ou CPL muito acima da média sem melhora
5. \`send_alert\` — situação crítica que exige decisão humana imediata

**Como decidir:**
- Compare sempre dentro do portfólio, não em absoluto
- Campanhas com menos de 2 horas ativas ou gasto recente < R$${MIN_SPEND}: aguarde (do_nothing)
- Prefira reduzir budget a pausar quando a campanha ainda mostra algum resultado
- Só pause quando os dados são claros: sem leads + gasto alto, ou frequência muito alta
- Ao escalar, aumente de forma conservadora (ex: de R$95 para R$130, não para R$500)

**Sinais de diagnóstico:**
- CTR < 0.8%: criativo fraco
- CTR alto + CPL alto: landing page não converte
- Frequência > 3.5: audiência saturando
- Leads > 0 mas CPL 2× acima da média: candidato a reduce_budget
- Leads = 0 após gasto > R$50: candidato a pause

**Limites:**
- Budget máximo: R$${BUDGET_MAX}/dia por campanha
- Budget mínimo ao reduzir: R$10/dia
- Não tome a mesma ação duas vezes seguidas na mesma campanha (veja histórico abaixo)`;

  const userMessage = `**Histórico das últimas ações do agente:**
${historyText}

---

**Campanhas ativas agora (${evaluable.length} campanhas com gasto ≥ R$${MIN_SPEND}):**

${JSON.stringify(summary, null, 2)}

Analise o portfólio e tome as ações necessárias.`;

  const messages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const actionLog: string[] = [];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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
      console.log(`[agent] chamando ${toolBlock.name}:`, input);

      const result = await executeTool(toolBlock.name, input, campaigns);

      if (toolBlock.name === 'pause_campaign') {
        actionLog.push(`⛔ *Pausei campanha*\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'reduce_budget') {
        actionLog.push(`📉 *Reduzi budget* → R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
      } else if (toolBlock.name === 'scale_budget') {
        actionLog.push(`📈 *Escalei budget* → R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (actionLog.length > 0) {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const report = `🤖 *Meta Ads Agent*\n${now}\n\n${actionLog.join('\n\n---\n\n')}\n\n_${actionLog.length} ação(ões) executada(s)_`;
    await sendWhatsApp(report);
  }

  console.log(`[agent] ciclo concluído — ${actionLog.length} ação(ões)`);
}
