const BASE = '/api/backend';

export interface Campaign {
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  status: string;
  daily_budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpl: number;
  frequency: number;
  leads: number;
  reach: number;
}

export interface AgentAction {
  id: number;
  campaign_id: string;
  action: string;
  reason: string;
  value_actual: number;
  value_threshold: number;
  source: 'AGENT' | 'MANUAL';
  created_at: string;
}

export const ACCOUNT_NAMES: Record<string, string> = {
  // JOTAP
  act_1095859619406442: 'CA 01',
  act_1628949641648813: 'CA 02',
  act_1520081442881968: 'CA 03',
  act_1430948701654012: 'CA 04',
  act_1322469786598233: 'CA 05',
  // RAMON (IVAN + ADRIANO)
  act_809590885250558:  'BB 01',
  act_1677889643448352: 'BB 02',
  act_1068494141940786: 'RM 01',
  act_1259981386320730: 'RM 02',
  act_1915057486047147: 'RM 03',
  // ZECA (DIOGO + HUEVERTON)
  act_932647832992759:  'ZC 01',
  act_1430896401540194: 'ZC 02',
};

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('tk') ?? '';
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function logout(): void {
  localStorage.removeItem('tk');
  window.location.href = '/login';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' });
  if (r.status === 401) {
    logout();
    throw new Error('Sessão expirada');
  }
  return r.json();
}

export async function login(password: string, code?: string): Promise<{ ok: boolean; token?: string; error?: string; require2fa?: boolean }> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...(code ? { code } : {}) }),
  });
  const data = await r.json();
  if (r.ok && data.token) {
    localStorage.setItem('tk', data.token);
  }
  return data;
}

export async function getCampaigns(force = false): Promise<Campaign[]> {
  return req<Campaign[]>(force ? '/campaigns?force=1' : '/campaigns');
}

export async function getActions(): Promise<AgentAction[]> {
  return req<AgentAction[]>('/insights/actions');
}

export async function getDiagnosis(campaignId: string): Promise<{ diagnosis: string; campaign: Campaign }> {
  return req(`/insights/diagnose/${campaignId}`);
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await req(`/campaigns/${campaignId}/pause`, { method: 'POST' });
}

export async function activateCampaign(campaignId: string): Promise<void> {
  await req(`/campaigns/${campaignId}/activate`, { method: 'POST' });
}

export async function updateBudget(campaignId: string, budget: number): Promise<void> {
  await req(`/campaigns/${campaignId}/budget`, {
    method: 'POST',
    body: JSON.stringify({ budget }),
  });
}

export async function getAgentStatus(): Promise<{ enabled: boolean; accounts: string[] }> {
  return req('/agent/status');
}

export async function toggleAgent(): Promise<{ enabled: boolean; accounts: string[] }> {
  return req('/agent/toggle', { method: 'POST' });
}

export async function updateAgentAccounts(accounts: string[]): Promise<{ enabled: boolean; accounts: string[] }> {
  return req('/agent/accounts', {
    method: 'POST',
    body: JSON.stringify({ accounts }),
  });
}

export interface AdsetInsight {
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  status: string;
  spend: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpc: number;
  impressions: number;
}

export async function getAdsets(campaignId: string): Promise<AdsetInsight[]> {
  return req<AdsetInsight[]>(`/insights/adsets/${campaignId}`);
}

export async function pauseAdset(adsetId: string): Promise<void> {
  await req(`/campaigns/adsets/${adsetId}/pause`, { method: 'POST' });
}

export async function activateAdset(adsetId: string): Promise<void> {
  await req(`/campaigns/adsets/${adsetId}/activate`, { method: 'POST' });
}

export interface GestorAccount {
  account_id: string;
  project_name: string;
  agent_enabled: boolean;
}

export interface Gestor {
  id: string;
  name: string;
  color: string;
  is_director: boolean;
  agent_enabled: boolean;
  accounts: GestorAccount[];
}

export async function getGestores(): Promise<Gestor[]> {
  return req<Gestor[]>('/gestores');
}

export async function addGestorAccount(gestorId: string, accountId: string, projectName: string): Promise<void> {
  await req(`/gestores/${gestorId}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, project_name: projectName }),
  });
}

export async function removeGestorAccount(gestorId: string, accountId: string): Promise<void> {
  await req(`/gestores/${gestorId}/accounts/${accountId}`, { method: 'DELETE' });
}

export async function toggleGestorAgent(gestorId: string): Promise<boolean> {
  const r = await req<{ ok: boolean; agent_enabled: boolean }>(`/gestores/${gestorId}/toggle-agent`, { method: 'POST' });
  return r.agent_enabled;
}

export async function toggleGestorAccountAgent(gestorId: string, accountId: string): Promise<boolean> {
  const r = await req<{ ok: boolean; agent_enabled: boolean }>(`/gestores/${gestorId}/accounts/${accountId}/toggle-agent`, { method: 'POST' });
  return r.agent_enabled;
}
