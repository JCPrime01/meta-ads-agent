import { Router } from 'express';
import { getSetting, setSetting } from '../db/postgres';

function getAllAccounts(): string[] {
  const env = (process.env.META_AD_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (env.length === 0) {
    console.warn('[agent] META_AD_ACCOUNTS não configurado — nenhuma conta disponível');
  }
  return env;
}

const router = Router();

let agentEnabled = process.env.AGENT_ENABLED !== 'false';
let agentAccounts: string[] = [];
let settingsLoaded = false;

async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  const allAccounts = getAllAccounts();
  const savedAccounts = await getSetting('agent_accounts').catch(() => null);
  if (savedAccounts) {
    agentAccounts = savedAccounts.split(',').filter(a => allAccounts.includes(a));
  } else {
    agentAccounts = [...allAccounts];
  }
  console.log(`[agent] contas carregadas: ${agentAccounts.length}`);
}

loadSettings().catch(console.error);

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
  const allAccounts = getAllAccounts();
  const { accounts } = req.body as { accounts: string[] };
  if (!Array.isArray(accounts) || accounts.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma conta.' });
    return;
  }
  agentAccounts = accounts.filter(a => allAccounts.includes(a));
  await setSetting('agent_accounts', agentAccounts.join(',')).catch(console.error);
  console.log(`[agent] contas atualizadas: ${agentAccounts.length}`);
  res.json({ enabled: agentEnabled, accounts: agentAccounts });
});

export default router;
