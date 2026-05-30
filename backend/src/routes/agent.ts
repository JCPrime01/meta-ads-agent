import { Router } from 'express';

const ALL_ACCOUNTS = [
  'act_1095859619406442',
  'act_1628949641648813',
  'act_1520081442881968',
  'act_1430948701654012',
  'act_1322469786598233',
];

const router = Router();

let agentEnabled = process.env.AGENT_ENABLED !== 'false';

const envAccounts = (process.env.AGENT_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean);
let agentAccounts: string[] = envAccounts.length > 0 ? envAccounts : [...ALL_ACCOUNTS];

export function isAgentEnabled(): boolean {
  return agentEnabled;
}

export function getAgentAccounts(): string[] {
  return agentAccounts;
}

router.get('/status', (_req, res) => {
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

router.post('/toggle', (_req, res) => {
  agentEnabled = !agentEnabled;
  console.log(`[agent] ${agentEnabled ? 'ATIVADO' : 'DESATIVADO'} via dashboard`);
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

router.post('/accounts', (req, res) => {
  const { accounts } = req.body as { accounts: string[] };
  if (!Array.isArray(accounts) || accounts.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma conta.' });
    return;
  }
  agentAccounts = accounts.filter(a => ALL_ACCOUNTS.includes(a));
  console.log(`[agent] contas atualizadas: ${agentAccounts.join(', ')}`);
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

export default router;
