const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002').replace(/\/$/, '');

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

export async function getCampaigns(): Promise<Campaign[]> {
  const r = await fetch(`${BASE}/campaigns`, { next: { revalidate: 60 } });
  if (!r.ok) throw new Error('Erro ao buscar campanhas');
  return r.json();
}

export async function getActions(): Promise<AgentAction[]> {
  const r = await fetch(`${BASE}/insights/actions`, { next: { revalidate: 30 } });
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
