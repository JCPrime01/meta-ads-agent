import { Router } from 'express';
import { getSetting, setSetting } from '../db/postgres';

const ALL_ACCOUNTS = [
  'act_1095859619406442',
  'act_1628949641648813',
  'act_1520081442881968',
  'act_1430948701654012',
  'act_1322469786598233',
];

const router = Router();

let agentEnabled = process.env.AGENT_ENABLED !== 'false';
let agentAccounts: string[] = [...ALL_ACCOUNTS];
let settingsLoaded = false;

async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  const savedAccounts = await getSetting('agent_accounts').catch(() => null);
  if (savedAccounts) {
    agentAccounts = savedAccounts.split(',').filter(a => ALL_ACCOUNTS.includes(a));
  } else {
    const envAccounts = (process.env.AGENT_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean);
    agentAccounts = envAccounts.length > 0 ? envAccounts : [...ALL_ACCOUNTS];
  }
}

export function isAgentEnabled(): boolean {
  return agentEnabled;
}

export function getAgentAccounts(): string[] {
  return agentAccounts;
}

router.get('/status', async (_req, res) => {
  await loadSettings();
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

router.post('/toggle', (_req, res) => {
  agentEnabled = !agentEnabled;
  console.log(`[agent] ${agentEnabled ? 'ATIVADO' : 'DESATIVADO'} via dashboard`);
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

router.post('/accounts', async (req, res) => {
  const { accounts } = req.body as { accounts: string[] };
  if (!Array.isArray(accounts) || accounts.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma conta.' });
    return;
  }
  agentAccounts = accounts.filter(a => ALL_ACCOUNTS.includes(a));
  await setSetting('agent_accounts', agentAccounts.join(',')).catch(console.error);
  console.log(`[agent] contas atualizadas: ${agentAccounts.join(', ')}`);
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

export default router;
