import Anthropic from '@anthropic-ai/sdk';
import { CampaignInsight } from '../meta/insights';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function diagnose(c: CampaignInsight): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(c);

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: 'Você é um especialista em tráfego pago Meta Ads para captação de leads no Brasil. Responda sempre em português, de forma direta e prática.',
      messages: [{
        role: 'user',
        content: `Analise esta campanha e em 2-3 frases identifique o problema principal e sugira UMA ação concreta:

Nome: ${c.campaign_name}
Gasto hoje: R$${c.spend.toFixed(2)}
CPL: R$${c.cpl > 0 ? c.cpl.toFixed(2) : 'sem conversões'}
CTR: ${c.ctr.toFixed(2)}%
CPC: R$${c.cpc.toFixed(2)}
Frequência: ${c.frequency.toFixed(1)}
Impressões: ${c.impressions.toLocaleString('pt-BR')}
Cliques: ${c.clicks}
Leads: ${c.leads}
Budget diário: R$${c.daily_budget.toFixed(2)}`
      }],
    });

    return (msg.content[0] as { text: string }).text;
  } catch {
    return fallback(c);
  }
}

function fallback(c: CampaignInsight): string {
  if (c.ctr > 1.5 && c.cpl > 15)
    return 'CTR alto indica criativo funcionando bem, mas a landing page não está convertendo. Revisar copy, velocidade ou botão CTA.';
  if (c.ctr < 0.8 && c.cpl > 15)
    return 'CTR baixo indica que o criativo não está chamando atenção. Trocar imagem, vídeo ou headline do anúncio.';
  if (c.frequency > 3.5)
    return 'Frequência alta — mesmas pessoas vendo o anúncio várias vezes. Expandir audiência ou criar lookalike.';
  if (c.cpc > 3)
    return 'CPC alto indica concorrência elevada no leilão. Testar horários diferentes ou ajustar lance.';
  return 'Métricas com baixa performance geral. Revisar criativo, audiência e landing page em conjunto.';
}
