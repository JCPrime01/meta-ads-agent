'use client';
import { useEffect, useState, useCallback } from 'react';
import { getCampaigns, getActions, Campaign, AgentAction } from '@/lib/api';
import StatCard from '@/components/StatCard';
import CampaignRow from '@/components/CampaignRow';
import AgentLog from '@/components/AgentLog';
import { RefreshCw, Bot } from 'lucide-react';

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'paused' | 'agent'>('active');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([getCampaigns(), getActions()]);
      setCampaigns(c);
      setActions(a);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function refresh() {
    setRefreshing(true);
    load();
  }

  const active = campaigns.filter(c => c.status === 'ACTIVE');
  const paused = campaigns.filter(c => c.status !== 'ACTIVE');

  const totalSpend = active.reduce((s, c) => s + c.spend, 0);
  const totalLeads = active.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCtr = active.length > 0 ? active.reduce((s, c) => s + c.ctr, 0) / active.length : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/30 text-sm">Carregando campanhas...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Meta Ads Agent</h1>
          <p className="text-xs text-white/30">Otimização automática · {active.length} campanhas ativas</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={16} className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gasto Hoje" value={`R$${totalSpend.toFixed(0)}`} color="default" />
        <StatCard label="Leads" value={String(totalLeads)} color="green" />
        <StatCard label="CPL Médio" value={avgCpl > 0 ? `R$${avgCpl.toFixed(2)}` : '—'} color={avgCpl > 20 ? 'red' : avgCpl > 0 ? 'green' : 'default'} />
        <StatCard label="CTR Médio" value={avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : '—'} color={avgCtr < 0.8 && avgCtr > 0 ? 'yellow' : 'default'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {[
          { key: 'active', label: `Ativas (${active.length})` },
          { key: 'paused', label: `Pausadas (${paused.length})` },
          { key: 'agent', label: `Agente (${actions.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              tab === t.key ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {(tab === 'active' || tab === 'paused') && (
        <div className="flex flex-col gap-3">
          {(tab === 'active' ? active : paused).length === 0 ? (
            <div className="text-center text-white/30 text-sm py-12">
              Nenhuma campanha {tab === 'active' ? 'ativa' : 'pausada'}.
            </div>
          ) : (
            (tab === 'active' ? active : paused)
              .sort((a, b) => b.spend - a.spend)
              .map(c => <CampaignRow key={c.campaign_id} campaign={c} onRefresh={refresh} />)
          )}
        </div>
      )}

      {tab === 'agent' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Bot size={12} />
            <span>Histórico de ações automáticas — roda a cada hora</span>
          </div>
          <AgentLog actions={actions} />
        </div>
      )}

    </div>
  );
}
