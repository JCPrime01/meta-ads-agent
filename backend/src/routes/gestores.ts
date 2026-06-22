import { Router } from 'express';
import { getGestores, addGestorAccount, removeGestorAccount, toggleGestorAgent, toggleGestorAccountAgent } from '../db/postgres';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const gestores = await getGestores();
    res.json(gestores);
  } catch (err) {
    console.error('[gestores] GET /:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/accounts', async (req, res) => {
  const { account_id, project_name = 'JOTAP' } = req.body;
  if (!account_id) { res.status(400).json({ error: 'account_id obrigatório' }); return; }
  try {
    await addGestorAccount(req.params.id, account_id, project_name);
    res.json({ ok: true });
  } catch (err) {
    console.error('[gestores] POST /accounts:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id/accounts/:accountId', async (req, res) => {
  try {
    await removeGestorAccount(req.params.id, req.params.accountId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[gestores] DELETE /accounts:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/toggle-agent', async (req, res) => {
  try {
    const enabled = await toggleGestorAgent(req.params.id);
    res.json({ ok: true, agent_enabled: enabled });
  } catch (err) {
    console.error('[gestores] POST /toggle-agent:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:gestorId/accounts/:accountId/toggle-agent', async (req, res) => {
  try {
    const enabled = await toggleGestorAccountAgent(req.params.gestorId, req.params.accountId);
    res.json({ ok: true, agent_enabled: enabled });
  } catch (err) {
    console.error('[gestores] POST /accounts/toggle-agent:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
