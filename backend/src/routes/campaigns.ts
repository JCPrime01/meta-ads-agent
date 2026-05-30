import { Router } from 'express';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, activateCampaign, updateDailyBudget } from '../meta/campaigns';
import { logAction } from '../db/postgres';

const router = Router();

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
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/pause', async (req, res) => {
  try {
    await pauseCampaign(req.params.id);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    await logAction(req.params.id, 'MANUAL_PAUSE', `Pausada manualmente pelo gestor. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}, Gasto: R$${c?.spend?.toFixed(2) ?? '?'}`, c?.cpl ?? 0, 0, 'MANUAL');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    await activateCampaign(req.params.id);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    await logAction(req.params.id, 'MANUAL_ACTIVATE', `Reativada manualmente pelo gestor. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}, Gasto: R$${c?.spend?.toFixed(2) ?? '?'}`, c?.cpl ?? 0, 0, 'MANUAL');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/budget', async (req, res) => {
  try {
    const { budget } = req.body as { budget: number };
    await updateDailyBudget(req.params.id, budget);
    const c = cache?.data.find(x => x.campaign_id === req.params.id);
    const prev = c?.daily_budget ?? 0;
    const action = budget > prev ? 'MANUAL_SCALE_UP' : 'MANUAL_REDUCE_BUDGET';
    await logAction(req.params.id, action, `Budget ajustado manualmente: R$${prev.toFixed(2)} → R$${budget.toFixed(2)}. CPL: R$${c?.cpl?.toFixed(2) ?? '?'}`, c?.cpl ?? 0, 0, 'MANUAL');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
