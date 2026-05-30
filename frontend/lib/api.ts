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
  created_at: string;
}

export const ACCOUNT_NAMES: Record<string, string> = {
  act_1095859619406442: 'CA 01',
  act_1628949641648813: 'CA 02',
  act_1520081442881968: 'CA 03',
  act_1430948701654012: 'CA 04',
  act_1322469786598233: 'CA 05',
};

export async function getCampaigns(force = false): Promise<Campaign[]> {
  const url = force ? `${BASE}/campaigns?force=1` : `${BASE}/campaigns`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Erro ao buscar campanhas');
  return r.json();
}

export async function getActions(): Promise<AgentAction[]> {
  const r = await fetch(`${BASE}/insights/actions`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Erro ao buscar ações');
  return r.json();
}

export async function getDiagnosis(campaignId: string): Promise<{ diagnosis: string; campaign: Campaign }> {
  const r = await fetch(`${BASE}/insights/diagnose/${campaignId}`);
  if (!r.ok) throw new Error('Erro ao diagnosticar');
  return r.json();
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await fetch(`${BASE}/campaigns/${campaignId}/pause`, { method: 'POST' });
}

export async function activateCampaign(campaignId: string): Promise<void> {
  await fetch(`${BASE}/campaigns/${campaignId}/activate`, { method: 'POST' });
}

export async function updateBudget(campaignId: string, budget: number): Promise<void> {
  await fetch(`${BASE}/campaigns/${campaignId}/budget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget }),
  });
}
