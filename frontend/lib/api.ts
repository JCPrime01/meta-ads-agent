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
  act_1095859619406442: 'CA 01',
  act_1628949641648813: 'CA 02',
  act_1520081442881968: 'CA 03',
  act_1430948701654012: 'CA 04',
  act_1322469786598233: 'CA 05',
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

export async function login(password: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
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
