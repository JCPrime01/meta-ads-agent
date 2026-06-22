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
    console.error('[insights] GET /actions:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Snapshots históricos (gráficos)
router.get('/snapshots', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string || '7'), 1), 365);
    const data = await getSnapshots(days);
    res.json(data);
  } catch (err) {
    console.error('[insights] GET /snapshots:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Diagnóstico IA de uma campanha específica
router.get('/diagnose/:campaignId', async (req, res) => {
  if (!/^\d+$/.test(req.params.campaignId)) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const campaigns = await getAllAccountsInsights();
    const campaign = campaigns.find(c => c.campaign_id === req.params.campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    const diagnosis = await diagnose(campaign);
    res.json({ diagnosis, campaign });
  } catch (err) {
    console.error('[insights] GET /diagnose:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Adsets de uma campanha específica
router.get('/adsets/:campaignId', async (req, res) => {
  if (!/^\d+$/.test(req.params.campaignId)) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const { getAllAccountsHierarchical } = require('../meta/insights');
    const { adsets } = await getAllAccountsHierarchical([req.params.campaignId]);
    const filtered = (adsets as Array<{ campaign_id: string }>).filter(a => a.campaign_id === req.params.campaignId);
    res.json(filtered);
  } catch (err) {
    console.error('[insights] GET /adsets:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
