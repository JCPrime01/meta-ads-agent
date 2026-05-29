import cron from 'node-cron';
import { runOptimizer } from '../agent/optimizer';
import { getAllAccountsInsights } from '../meta/insights';
import { sendWhatsApp } from '../whatsapp';

export function startCron(): void {
  // Ciclo principal do agente — a cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      await runOptimizer();
    } catch (err) {
      console.error('[cron] erro no otimizador:', err);
    }
  });

  // Relatório diário às 8h (Brasília)
  cron.schedule('0 8 * * *', { timezone: 'America/Sao_Paulo' }, async () => {
    try {
      await sendDailyReport();
    } catch (err) {
      console.error('[cron] erro relatório diário:', err);
    }
  });

  console.log('[cron] agente ativo — ciclo a cada hora + relatório às 8h');
}

async function sendDailyReport(): Promise<void> {
  const campaigns = await getAllAccountsInsights();
  const active = campaigns.filter(c => c.status === 'ACTIVE');

  const totalSpend = active.reduce((s, c) => s + c.spend, 0);
  const totalLeads = active.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const top = active
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5)
    .map(c =>
      `• ${c.campaign_name.slice(0, 45)}\n  💰 R$${c.spend.toFixed(2)} | CPL R$${c.cpl.toFixed(2)} | Leads: ${c.leads}`
    );

  const msg = [
    `📊 *Relatório Diário — Meta Ads*`,
    new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ``,
    `💰 Gasto total: R$${totalSpend.toFixed(2)}`,
    `🎯 Total de leads: ${totalLeads}`,
    `📉 CPL médio: R$${avgCpl > 0 ? avgCpl.toFixed(2) : '—'}`,
    `📣 Campanhas ativas: ${active.length}`,
    ``,
    `*Top campanhas (leads):*`,
    ...top,
  ].join('\n');

  await sendWhatsApp(msg);
}
