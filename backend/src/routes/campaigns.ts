import { Router } from 'express';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, activateCampaign, updateDailyBudget } from '../meta/campaigns';
import { logAction } from '../db/postgres';

const router = Router();

const BUDGET_MAX = parseFloat(process.env.AGENT_BUDGET_MAX || '5000');
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { data: CampaignInsight[]; ts: number } | null = null;

router.get('/', async (req, res) => {
  try {
    const force = req.query.force === '1';
    if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return res.json(cache.data);
    }
    const data = await getAllAccountsInsights();
    cache = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('[campaigns] GET /:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

async function logManual(id: string, action: string, reason: string, cpl: number) {
  try {
    await logAction(id, action, reason, cpl, 0, 'MANUAL');
  } catch (err) {
    console.error('[manual-log] falha ao registrar ação manual:', err);
  }
}

router.post('/:id/pause', async (req, res) => {
  try {
    await pauseCampaign(req.params.id);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    await logManual(req.params.id, 'MANUAL_PAUSE', `Pausada manualmente. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}, Gasto: R$${c?.spend?.toFixed(2) ?? '?'}`, c?.cpl ?? 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[campaigns] POST /pause:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    await activateCampaign(req.params.id);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    await logManual(req.params.id, 'MANUAL_ACTIVATE', `Reativada manualmente. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}, Gasto: R$${c?.spend?.toFixed(2) ?? '?'}`, c?.cpl ?? 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[campaigns] POST /activate:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/budget', async (req, res) => {
  const budget = parseFloat(req.body?.budget);
  if (isNaN(budget) || budget <= 0 || budget > BUDGET_MAX) {
    res.status(400).json({ error: `Budget inválido. Deve ser entre R$0,01 e R$${BUDGET_MAX}` });
    return;
  }
  try {
    await updateDailyBudget(req.params.id, budget);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    const prev = c?.daily_budget ?? 0;
    const action = budget > prev ? 'MANUAL_SCALE_UP' : 'MANUAL_REDUCE_BUDGET';
    await logManual(req.params.id, action, `Budget: R$${prev.toFixed(2)} → R$${budget.toFixed(2)}. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}`, c?.cpl ?? 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[campaigns] POST /budget:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/adsets/:id/pause', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'ID inválido' }); return; }
  try {
    const { pauseAdset } = require('../meta/campaigns');
    await pauseAdset(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[campaigns] POST /adsets/pause:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/adsets/:id/activate', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'ID inválido' }); return; }
  try {
    const { activateAdset } = require('../meta/campaigns');
    await activateAdset(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[campaigns] POST /adsets/activate:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
