import Anthropic from '@anthropic-ai/sdk';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, activateCampaign, scaleBudget } from '../meta/campaigns';
import { logAction, saveSnapshot } from '../db/postgres';
import { sendWhatsApp } from '../whatsapp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CPL_MAX = parseFloat(process.env.AGENT_CPL_MAX || '20');
const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '500');
const BUDGET_SCALE = parseFloat(process.env.AGENT_BUDGET_SCALE || '1.2');
const MIN_SPEND = parseFloat(process.env.AGENT_MIN_SPEND || '5');

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'pause_campaign',
    description: 'Pausa uma campanha com baixa performance ou audiência saturada.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'ID da campanha' },
        reason: { type: 'string', description: 'Motivo claro e objetivo da pausa' },
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
        campaign_id: { type: 'string', description: 'ID da campanha' },
        new_budget_brl: { type: 'number', description: 'Novo budget diário em reais' },
        reason: { type: 'string', description: 'Por que essa campanha merece escalar' },
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
        message: { type: 'string', description: 'Mensagem do alerta' },
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
        campaign_id: { type: 'string' },
        observation: { type: 'string', description: 'Observação sobre o estado atual' },
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
      await logAction(input.campaign_id!, 'PAUSE', input.reason!, c?.cpl ?? 0, CPL_MAX);
      return `✅ Campanha ${input.campaign_id} pausada.`;
    }
    case 'scale_budget': {
      const c = campaigns.find(x => x.campaign_id === input.campaign_id);
      if (!c) return 'Campanha não encontrada.';
      const actual = await scaleBudget(input.campaign_id!, c.daily_budget, BUDGET_SCALE, Math.min(input.new_budget_brl!, BUDGET_MAX));
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
    status: c.status,
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

  const systemPrompt = `Você é um especialista sênior em tráfego pago Meta Ads (Facebook/Instagram), com foco em captação de leads para apostas esportivas no Brasil.

Seu trabalho é analisar as campanhas ativas e tomar as melhores decisões para maximizar leads com o menor CPL possível.

**Regras operacionais:**
- CPL máximo aceitável: R$${CPL_MAX}
- Budget máximo por campanha: R$${BUDGET_MAX}/dia
- Fator de escala: ${BUDGET_SCALE}x (ex: R$70 → R$84)
- Só avalie campanhas com gasto ≥ R$${MIN_SPEND} (dados insuficientes abaixo disso)

**Critérios de diagnóstico:**
- CPL alto + CTR baixo (<0.8%) → problema no criativo (não está atraindo cliques)
- CPL alto + CTR alto (>1.5%) → problema na landing page (clica mas não converte)
- Frequência > 4 → audiência saturada (mesmas pessoas vendo várias vezes)
- CPL > R$${CPL_MAX} → pausar
- CPL < R$${CPL_MAX / 2} e budget < R$${BUDGET_MAX} → escalar

**Contexto importante:**
- Campanhas nos primeiros 1-2 dias podem ter CPL alto por fase de aprendizado — tenha bom senso
- Priorize escalar o que está funcionando antes de pausar o que não está
- Use send_alert apenas para situações críticas que exigem ação humana imediata

Analise todas as campanhas e use as ferramentas disponíveis para cada uma.`;

  const userMessage = `Aqui estão as ${evaluable.length} campanhas ativas com dados de hoje:

${JSON.stringify(summary, null, 2)}

Analise cada campanha e tome as ações necessárias. Para cada uma, use uma das ferramentas: pause_campaign, scale_budget, send_alert ou do_nothing.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  const actionLog: string[] = [];

  // Loop agêntico — Claude pode chamar múltiplas ferramentas
  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Adiciona resposta do assistente ao histórico
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;
    if (response.stop_reason !== 'tool_use') break;

    // Executa todas as ferramentas chamadas nesta rodada
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const input = block.input as ToolInput;
      console.log(`[agent] chamando ${block.name}:`, input);

      const result = await executeTool(block.name, input, campaigns);

      // Monta log legível
      if (block.name === 'pause_campaign') {
        actionLog.push(`⛔ *Pausei campanha*\nMotivo: ${input.reason}`);
      } else if (block.name === 'scale_budget') {
        actionLog.push(`📈 *Escalei budget*\nNovo: R$${input.new_budget_brl}\nMotivo: ${input.reason}`);
      } else if (block.name === 'send_alert') {
        // já enviado
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
      });
    }

    // Devolve os resultados das ferramentas para Claude continuar
    messages.push({ role: 'user', content: toolResults });
  }

  // Relatório final no WhatsApp
  if (actionLog.length > 0) {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const report = `🤖 *Meta Ads Agent*\n${now}\n\n${actionLog.join('\n\n---\n\n')}\n\n_${actionLog.length} ação(ões) executada(s)_`;
    await sendWhatsApp(report);
  }

  console.log(`[agent] ciclo concluído — ${actionLog.length} ação(ões)`);
}
