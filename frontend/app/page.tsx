'use client';
import { useEffect, useState, useCallback } from 'react';
import { getCampaigns, getActions, Campaign, AgentAction, ACCOUNT_NAMES, getAgentStatus, toggleAgent, updateAgentAccounts } from '@/lib/api';
import StatCard from '@/components/StatCard';
import CampaignRow from '@/components/CampaignRow';
import AgentLog from '@/components/AgentLog';
import { RefreshCw, Bot, ChevronDown } from 'lucide-react';

const ALL_ACCOUNTS = 'all';

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'paused' | 'agent'>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState(ALL_ACCOUNTS);
  const [agentEnabled, setAgentEnabled] = useState<boolean | null>(null);
  const [agentAccounts, setAgentAccounts] = useState<string[]>([]);
  const [togglingAgent, setTogglingAgent] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      const [c, a] = await Promise.all([getCampaigns(force), getActions()]);
      setCampaigns(c);
      setActions(a);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getAgentStatus().then(s => {
      setAgentEnabled(s.enabled);
      setAgentAccounts(s.accounts ?? []);
    }).catch(() => {});
  }, []);

  async function handleToggleAgent() {
    setTogglingAgent(true);
    try {
      const s = await toggleAgent();
      setAgentEnabled(s.enabled);
    } finally {
      setTogglingAgent(false);
    }
  }

  async function handleToggleAccount(id: string) {
    const next = agentAccounts.includes(id)
      ? agentAccounts.filter(a => a !== id)
      : [...agentAccounts, id];
    if (next.length === 0) return;
    setAgentAccounts(next);
    await updateAgentAccounts(next).catch(() => {});
  }

  function refresh() {
    setRefreshing(true);
    load(true);
  }

  const filtered = accountFilter === ALL_ACCOUNTS
    ? campaigns
    : campaigns.filter(c => c.account_id === accountFilter);

  const active = filtered.filter(c => c.status === 'ACTIVE');
  const paused = filtered.filter(c => c.status !== 'ACTIVE');

  // totalSpend e totalLeads incluem pausadas (pode ter gasto antes de pausar hoje)
  const totalSpend = filtered.reduce((s, c) => s + c.spend, 0);
  const totalLeads = filtered.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCtr = active.length > 0 ? active.reduce((s, c) => s + c.ctr, 0) / active.length : 0;

  const accountIds = Object.keys(ACCOUNT_NAMES);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/30 text-sm">Carregando campanhas...</div>
      </div>
    );
  }

  const listCampaigns = (tab === 'active' ? active : paused).sort((a, b) => b.spend - a.spend);

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-white">Meta Ads Agent</h1>
          <p className="text-xs text-white/30">Otimização automática · {active.length} ativas · {paused.length} pausadas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Account filter */}
          <div className="relative">
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 text-white/70 text-xs rounded-xl pl-3 pr-8 py-2 hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus:border-white/20"
            >
              <option value={ALL_ACCOUNTS}>Todas as contas</option>
              {accountIds.map(id => (
                <option key={id} value={id}>{ACCOUNT_NAMES[id]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
          {agentEnabled !== null && (
            <button
              onClick={handleToggleAgent}
              disabled={togglingAgent}
              title={agentEnabled ? 'Agente ativo — clique para desativar' : 'Agente inativo — clique para ativar'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                agentEnabled
                  ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                  : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
              } ${togglingAgent ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Bot size={13} className={togglingAgent ? 'animate-pulse' : ''} />
              {agentEnabled ? 'Agente ON' : 'Agente OFF'}
            </button>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={15} className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gasto Hoje" value={`R$${totalSpend.toFixed(0)}`} color="default" />
        <StatCard label="Leads" value={String(totalLeads)} color="green" />
        <StatCard label="CPL Médio" value={avgCpl > 0 ? `R$${avgCpl.toFixed(2)}` : '—'} color={avgCpl > 20 ? 'red' : avgCpl > 0 ? 'green' : 'default'} />
        <StatCard label="CTR Médio" value={avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : '—'} color={avgCtr < 0.8 && avgCtr > 0 ? 'yellow' : 'default'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {[
          { key: 'active', label: `Ativas (${active.length})` },
          { key: 'paused', label: `Pausadas (${paused.length})` },
          { key: 'agent', label: `Agente (${actions.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tab === t.key ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Campaign Table */}
      {(tab === 'active' || tab === 'paused') && (
        listCampaigns.length === 0 ? (
          <div className="text-center text-white/30 text-sm py-16">
            Nenhuma campanha {tab === 'active' ? 'ativa' : 'pausada'}{accountFilter !== ALL_ACCOUNTS ? ` na ${ACCOUNT_NAMES[accountFilter]}` : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[820px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  {['Campanha', 'Status', 'Leads', 'CPL', 'Orçamento', 'Gasto', 'CTR', 'CPC', ''].map((h, i) => (
                    <th
                      key={i}
                      className={`py-2.5 px-4 text-[10px] font-semibold text-white/30 uppercase tracking-wider ${i >= 2 && i <= 7 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listCampaigns.map(c => (
                  <CampaignRow key={c.campaign_id} campaign={c} onRefresh={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Agent Log */}
      {tab === 'agent' && (
        <div className="flex flex-col gap-4">

          {/* Contas gerenciadas */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-white/50 font-semibold uppercase tracking-wider">
              <Bot size={12} />
              <span>Contas gerenciadas pelo agente</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCOUNT_NAMES).map(([id, name]) => {
                const active = agentAccounts.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => handleToggleAccount(id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-green-500/15 border-green-500/30 text-green-400'
                        : 'bg-white/5 border-white/10 text-white/30 hover:text-white/50'
                    }`}
                  >
                    {active ? '✓ ' : ''}{name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/30">
            <Bot size={12} />
            <span>Histórico de ações automáticas — roda a cada 30 min (05h–16h BRT)</span>
          </div>
          <AgentLog actions={actions} />
        </div>
      )}

    </div>
  );
}
