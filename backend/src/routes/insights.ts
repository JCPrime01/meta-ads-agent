import { Router } from 'express';
import { getRecentActions, getSnapshots } from '../db/postgres';
import { diagnose } from '../agent/diagnostics';
import { getAllAccountsInsights } from '../meta/insights';

const router = Router();

// Histórico de ações do agente
router.get('/actions', async (_req, res) => {
  try {
    const actions = await getRecentActions(100);
    res.json(actions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Snapshots históricos (gráficos)
router.get('/snapshots', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string || '7');
    const data = await getSnapshots(days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Diagnóstico IA de uma campanha específica
router.get('/diagnose/:campaignId', async (req, res) => {
  try {
    const campaigns = await getAllAccountsInsights();
    const campaign = campaigns.find(c => c.campaign_id === req.params.campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    const diagnosis = await diagnose(campaign);
    res.json({ diagnosis, campaign });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
