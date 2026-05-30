import { metaGet } from './client';

export interface CampaignInsight {
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

export async function getCampaignsWithInsights(accountId: string): Promise<CampaignInsight[]> {
  // Busca apenas campanhas que tiveram atividade hoje — ignora tudo que não rodou
  const insightsRes = await metaGet(`/${accountId}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,frequency,reach',
    date_preset: 'today',
    level: 'campaign',
    limit: '200',
  });

  const insights: Record<string, unknown>[] = insightsRes.data || [];
  if (insights.length === 0) return [];

  // Mapa de insights por campaign_id
  const insightsMap: Record<string, Record<string, unknown>> = {};
  for (const ins of insights) {
    insightsMap[ins.campaign_id as string] = ins;
  }

  // Busca status e orçamento em batch só para essas campanhas
  const ids = insights.map(i => i.campaign_id as string).join(',');
  const batchRes = await metaGet('', {
    ids,
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget',
  });

  const campaigns = Object.values(batchRes as Record<string, Record<string, string>>);

  return campaigns.map(c => {
    const ins = insightsMap[c.id] || {};
    const actions = (ins.actions as { action_type: string; value: string }[]) || [];
    const costPerAction = (ins.cost_per_action_type as { action_type: string; value: string }[]) || [];

    const leads = actions.find(a =>
      a.action_type === 'lead' ||
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'contact'
    );
    const cplAction = costPerAction.find(a =>
      a.action_type === 'lead' ||
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'contact'
    );

    return {
      campaign_id: c.id,
      campaign_name: c.name,
      account_id: accountId,
      status: c.effective_status || c.status,
      daily_budget: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
      spend: parseFloat((ins as Record<string, string>).spend || '0'),
      impressions: parseInt((ins as Record<string, string>).impressions || '0'),
      clicks: parseInt((ins as Record<string, string>).clicks || '0'),
      ctr: parseFloat((ins as Record<string, string>).ctr || '0'),
      cpc: parseFloat((ins as Record<string, string>).cpc || '0'),
      cpl: parseFloat(cplAction?.value || '0'),
      frequency: parseFloat((ins as Record<string, string>).frequency || '0'),
      leads: parseInt(leads?.value || '0'),
      reach: parseInt((ins as Record<string, string>).reach || '0'),
    };
  });
}

export async function getAllAccountsInsights(): Promise<CampaignInsight[]> {
  const { AD_ACCOUNTS } = await import('./client');
  const results = await Promise.allSettled(AD_ACCOUNTS.map(getCampaignsWithInsights));
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
