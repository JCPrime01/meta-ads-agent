import { Router } from 'express';
import { getAllAccountsInsights, CampaignInsight } from '../meta/insights';
import { pauseCampaign, activateCampaign, updateDailyBudget } from '../meta/campaigns';

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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    await activateCampaign(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:id/budget', async (req, res) => {
  try {
    const { budget } = req.body as { budget: number };
    await updateDailyBudget(req.params.id, budget);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
