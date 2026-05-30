import { Router } from 'express';

const router = Router();

// Estado em memória — inicializa pelo env var, pode ser alterado via API
let agentEnabled = process.env.AGENT_ENABLED !== 'false';

export function isAgentEnabled(): boolean {
  return agentEnabled;
}

router.get('/status', (_req, res) => {
  res.json({ enabled: agentEnabled });
});

router.post('/toggle', (_req, res) => {
  agentEnabled = !agentEnabled;
  console.log(`[agent] ${agentEnabled ? 'ATIVADO' : 'DESATIVADO'} via dashboard`);
  res.json({ enabled: agentEnabled });
});

export default router;
