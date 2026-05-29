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
  const [campaignsRes, insightsRes] = await Promise.all([
    metaGet(`/${accountId}/campaigns`, {
      fields: 'id,name,status,daily_budget,lifetime_budget,effective_status',
      limit: '50',
    }),
    metaGet(`/${accountId}/insights`, {
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,frequency,reach',
      date_preset: 'today',
      level: 'campaign',
      limit: '50',
    }),
  ]);

  const insightsMap: Record<string, Record<string, string>> = {};
  for (const ins of insightsRes.data || []) {
    insightsMap[ins.campaign_id] = ins;
  }

  return (campaignsRes.data || []).map((c: Record<string, string>) => {
    const ins = insightsMap[c.id] || {};
    const insAny = ins as Record<string, unknown>;
    const actions: { action_type: string; value: string }[] = (insAny.actions as { action_type: string; value: string }[]) || [];
    const costPerAction: { action_type: string; value: string }[] = (insAny.cost_per_action_type as { action_type: string; value: string }[]) || [];

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
