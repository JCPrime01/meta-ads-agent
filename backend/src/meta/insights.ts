import { metaGet } from './client';

const RESULT_TYPES = [
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead',
  'contact',
  'onsite_conversion.messaging_conversation_started_7d',
];

function extractLeadsAndCpl(ins: Record<string, unknown>) {
  const actions = (ins.actions as { action_type: string; value: string }[]) || [];
  const leadsAction = actions.find(a => RESULT_TYPES.includes(a.action_type));
  const leadsCount = parseInt(leadsAction?.value || '0');
  const lpViewsAction = actions.find(a => a.action_type === 'landing_page_view');
  const lpViews = parseInt(lpViewsAction?.value || '0');
  const spend = parseFloat((ins as Record<string, string>).spend || '0');
  return {
    spend,
    leads: leadsCount,
    cpl: leadsCount > 0 ? spend / leadsCount : 0,
    lp_views: lpViews,
    cost_per_lp_view: lpViews > 0 ? spend / lpViews : 0,
    impressions: parseInt((ins as Record<string, string>).impressions || '0'),
    clicks: parseInt((ins as Record<string, string>).clicks || '0'),
    ctr: parseFloat((ins as Record<string, string>).ctr || '0'),
    cpc: parseFloat((ins as Record<string, string>).cpc || '0'),
    frequency: parseFloat((ins as Record<string, string>).frequency || '0'),
    reach: parseInt((ins as Record<string, string>).reach || '0'),
  };
}

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
  lp_views: number;
  cost_per_lp_view: number;
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
  lp_views: number;
  cost_per_lp_view: number;
}

export interface AdInsight {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  spend: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpc: number;
  impressions: number;
  lp_views: number;
  cost_per_lp_view: number;
}

export async function getCampaignsWithInsights(accountId: string): Promise<CampaignInsight[]> {
  const insightsRes = await metaGet(`/${accountId}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions,frequency,reach',
    date_preset: 'today',
    level: 'campaign',
    limit: '200',
  });

  const insights: Record<string, unknown>[] = insightsRes.data || [];
  if (insights.length === 0) return [];

  const insightsMap: Record<string, Record<string, unknown>> = {};
  for (const ins of insights) insightsMap[ins.campaign_id as string] = ins;

  const ids = insights.map(i => i.campaign_id as string).join(',');
  const batchRes = await metaGet('', {
    ids,
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget',
  });

  const campaigns = Object.values(batchRes as Record<string, Record<string, string>>);

  return campaigns.map(c => {
    const ins = insightsMap[c.id] || {};
    const m = extractLeadsAndCpl(ins);
    return {
      campaign_id: c.id,
      campaign_name: c.name,
      account_id: accountId,
      status: c.effective_status || c.status,
      daily_budget: parseFloat(c.daily_budget || c.lifetime_budget || '0') / 100,
      ...m,
    };
  });
}

export async function getAdsetInsights(accountId: string): Promise<AdsetInsight[]> {
  const insightsRes = await metaGet(`/${accountId}/insights`, {
    fields: 'adset_id,adset_name,campaign_id,spend,impressions,clicks,ctr,actions',
    date_preset: 'today',
    level: 'adset',
    limit: '500',
  });

  const insights: Record<string, unknown>[] = insightsRes.data || [];
  if (insights.length === 0) return [];

  const ids = insights.map(i => i.adset_id as string).join(',');
  const batchRes = await metaGet('', {
    ids,
    fields: 'id,name,status,effective_status',
  });
  const statusMap = batchRes as Record<string, { id: string; status: string; effective_status: string }>;

  return insights.map(ins => {
    const m = extractLeadsAndCpl(ins);
    const s = statusMap[ins.adset_id as string] || {};
    return {
      adset_id: ins.adset_id as string,
      adset_name: (ins.adset_name as string || '').slice(0, 60),
      campaign_id: ins.campaign_id as string,
      status: s.effective_status || s.status || 'UNKNOWN',
      spend: m.spend,
      leads: m.leads,
      cpl: m.cpl,
      ctr: m.ctr,
      cpc: m.cpc,
      impressions: m.impressions,
      lp_views: m.lp_views,
      cost_per_lp_view: m.cost_per_lp_view,
    };
  });
}

export async function getAdInsights(accountId: string): Promise<AdInsight[]> {
  const insightsRes = await metaGet(`/${accountId}/insights`, {
    fields: 'ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,actions',
    date_preset: 'today',
    level: 'ad',
    limit: '500',
  });

  const insights: Record<string, unknown>[] = insightsRes.data || [];
  if (insights.length === 0) return [];

  const ids = insights.map(i => i.ad_id as string).join(',');
  const batchRes = await metaGet('', {
    ids,
    fields: 'id,name,status,effective_status',
  });
  const statusMap = batchRes as Record<string, { id: string; status: string; effective_status: string }>;

  return insights.map(ins => {
    const m = extractLeadsAndCpl(ins);
    const s = statusMap[ins.ad_id as string] || {};
    return {
      ad_id: ins.ad_id as string,
      ad_name: (ins.ad_name as string || '').slice(0, 60),
      adset_id: ins.adset_id as string,
      campaign_id: ins.campaign_id as string,
      status: s.effective_status || s.status || 'UNKNOWN',
      spend: m.spend,
      leads: m.leads,
      cpl: m.cpl,
      ctr: m.ctr,
      cpc: m.cpc,
      impressions: m.impressions,
      lp_views: m.lp_views,
      cost_per_lp_view: m.cost_per_lp_view,
    };
  });
}

export async function getAllAccountsInsights(): Promise<CampaignInsight[]> {
  const { AD_ACCOUNTS } = await import('./client');
  const results = await Promise.allSettled(AD_ACCOUNTS.map(getCampaignsWithInsights));
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

export async function getAllAccountsHierarchical(activeCampaignIds: string[]) {
  const { AD_ACCOUNTS } = await import('./client');
  const [adsets, ads] = await Promise.all([
    Promise.allSettled(AD_ACCOUNTS.map(getAdsetInsights)),
    Promise.allSettled(AD_ACCOUNTS.map(getAdInsights)),
  ]);
  const allAdsets = adsets.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(a => activeCampaignIds.includes(a.campaign_id));
  const allAds = ads.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(a => activeCampaignIds.includes(a.campaign_id));
  return { adsets: allAdsets, ads: allAds };
}
