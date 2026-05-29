import { Router } from 'express';
import { getAllAccountsInsights } from '../meta/insights';
import { pauseCampaign, activateCampaign, updateDailyBudget } from '../meta/campaigns';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const data = await getAllAccountsInsights();
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
