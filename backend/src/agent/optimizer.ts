import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, scaleBudget } from '../meta/campaigns';
import { logAction, saveSnapshot } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '500');
const MIN_SPEND  = parseFloat(process.env.AGENT_MIN_SPEND  || '5');

type Tool                = Anthropic.Messages.Tool;
type MessageParam        = Anthropic.Messages.MessageParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
type ToolUseBlock        = Anthropic.Messages.ToolUseBlock;

const TOOLS: Tool[] = [
  {
    name: 'pause_campaign',
    description: 'Pausa uma campanha com baixa performance ou audiência saturada.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const, description: 'ID da campanha' },
        reason: { type: 'string' as const, description: 'Motivo claro e objetivo da pausa' },
      },
      required: ['campaign_id', 'reason'],
    },
  },
  {
    name: 'scale_budget',
    description: 'Aumenta o budget diário de uma campanha com boa performance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const, description: 'ID da campanha' },
        new_budget_brl: { type: 'number' as const, description: 'Novo budget diário em reais (respeite o teto máximo informado)' },
        reason: { type: 'string' as const, description: 'Por que essa campanha merece escalar' },
      },
      required: ['campaign_id', 'new_budget_brl', 'reason'],
    },
  },
  {
    name: 'send_alert',
    description: 'Envia alerta urgente no WhatsApp quando há algo crítico que exige atenção humana.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string' as const, description: 'Mensagem do alerta' },
      },
      required: ['message'],
    },
  },
  {
    name: 'do_nothing',
    description: 'Registra que uma campanha foi analisada e nenhuma ação é necessária agora.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string' as const },
        observation: { type: 'string' as const, description: 'Observação sobre o estado atual' },
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

Você recebe os dados de todas as campanhas ativas a cada 30 minutos e decide autonomamente o que fazer com cada uma.

**Sua missão:** maximizar o volume de leads com o menor custo por lead (CPL) possível, dentro do orçamento disponível.

**Como tomar decisões:**
Analise o conjunto como um portfólio. Não existem thresholds fixos — use seu julgamento com base nos dados reais:
- Compare as campanhas entre si: identifique as que estão claramente acima ou abaixo da média
- Campanhas muito acima do CPL médio do grupo, sem leads, com frequência alta ou CTR muito baixo → candidatas a pausa
- Campanhas com CPL bem abaixo da média, gerando leads consistentemente → candidatas a escala
- Campanhas com pouco gasto ou em fase de aprendizado → aguarde mais dados antes de agir

**Diagnóstico:**
- CTR baixo (< 0.8%): criativo fraco, não gera cliques
- CTR alto + CPL alto: landing page não converte
- Frequência > 4: audiência saturada
- Sem leads após gasto relevante: revisar criativo e público

**Limites de segurança:**
- Budget máximo por campanha: R$${BUDGET_MAX}/dia — nunca proponha acima disso
- Só avalie campanhas com gasto ≥ R$${MIN_SPEND} (dados insuficientes abaixo disso)
- Use send_alert apenas para situações críticas que exigem decisão humana imediata

Para cada campanha, use uma das ferramentas disponíveis.`;

  const userMessage = `Aqui estão as ${evaluable.length} campanhas ativas com dados de hoje:

${JSON.stringify(summary, null, 2)}

Analise o portfólio completo e tome as ações necessárias para cada campanha.`;

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
      } else if (toolBlock.name === 'scale_budget') {
        actionLog.push(`📈 *Escalei budget*\nNovo: R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
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
