import cron from 'node-cron';
import { runOptimizer } from '../agent/optimizer';
import { getAllAccountsInsights } from '../meta/insights';
import { sendWhatsApp } from '../whatsapp';
import { isAgentEnabled } from '../routes/agent';

export function startCron(): void {
  // Ciclo principal — a cada 30min das 05h às 16h BRT (08h–19h UTC)
  cron.schedule('*/30 8-19 * * *', async () => {
    if (!isAgentEnabled()) {
      console.log('[cron] agente desabilitado');
      return;
    }
    try {
      await runOptimizer();
    } catch (err) {
      console.error('[cron] erro no otimizador:', err);
    }
  });

  // Relatório diário às 16h BRT (19h UTC) — resumo do dia
  cron.schedule('0 19 * * *', async () => {
    try {
      await sendDailyReport();
    } catch (err) {
      console.error('[cron] erro relatório diário:', err);
    }
  });

  console.log('[cron] agente ativo — 05h-16h BRT a cada 30min + relatório às 16h');
}

async function sendDailyReport(): Promise<void> {
  const campaigns = await getAllAccountsInsights();

  // Inclui todas as campanhas com gasto > 0 hoje (ativas ou pausadas)
  const withSpend = campaigns.filter(c => c.spend > 0);
  const active = campaigns.filter(c => c.status === 'ACTIVE');

  const totalSpend = withSpend.reduce((s, c) => s + c.spend, 0);
  const totalLeads = withSpend.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const top = withSpend
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5)
    .map(c =>
      `• ${c.campaign_name.slice(0, 45)}\n  💰 R$${c.spend.toFixed(2)} | CPL R$${c.cpl > 0 ? c.cpl.toFixed(2) : '—'} | Leads: ${c.leads}`
    );

  const msg = [
    `📊 *Relatório Diário — Meta Ads*`,
    new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ``,
    `💰 Gasto total: R$${totalSpend.toFixed(2)}`,
    `🎯 Total de leads: ${totalLeads}`,
    `📉 CPL médio: R$${avgCpl > 0 ? avgCpl.toFixed(2) : '—'}`,
    `📣 Campanhas ativas: ${active.length} | Com gasto hoje: ${withSpend.length}`,
    ``,
    `*Top 5 campanhas do dia (leads):*`,
    ...top,
  ].join('\n');

  await sendWhatsApp(msg);
}
