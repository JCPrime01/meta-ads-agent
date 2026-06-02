import { metaPost } from './client';

export async function pauseCampaign(campaignId: string): Promise<void> {
  await metaPost(`/${campaignId}`, { status: 'PAUSED' });
}

export async function pauseAdset(adsetId: string): Promise<void> {
  await metaPost(`/${adsetId}`, { status: 'PAUSED' });
}

export async function pauseAd(adId: string): Promise<void> {
  await metaPost(`/${adId}`, { status: 'PAUSED' });
}

export async function activateCampaign(campaignId: string): Promise<void> {
  await metaPost(`/${campaignId}`, { status: 'ACTIVE' });
}

export async function activateAdset(adsetId: string): Promise<void> {
  await metaPost(`/${adsetId}`, { status: 'ACTIVE' });
}

export async function activateAd(adId: string): Promise<void> {
  await metaPost(`/${adId}`, { status: 'ACTIVE' });
}

export async function updateDailyBudget(campaignId: string, newBudgetBRL: number): Promise<void> {
  // Meta API uses centavos
  await metaPost(`/${campaignId}`, { daily_budget: Math.round(newBudgetBRL * 100) });
}

export async function scaleBudget(campaignId: string, currentBudget: number, factor: number, maxBudget: number): Promise<number> {
  const newBudget = Math.min(currentBudget * factor, maxBudget);
  await updateDailyBudget(campaignId, newBudget);
  return newBudget;
}
