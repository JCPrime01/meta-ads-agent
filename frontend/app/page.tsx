'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCampaigns, getActions, Campaign, AgentAction, ACCOUNT_NAMES, getAgentStatus, toggleAgent, updateAgentAccounts, isLoggedIn, logout, getGestores, Gestor, pauseCampaign, activateCampaign, updateBudget } from '@/lib/api';
import StatCard from '@/components/StatCard';
import CampaignRow from '@/components/CampaignRow';
import AgentLog from '@/components/AgentLog';
import GestorCard from '@/components/GestorCard';
import { RefreshCw, Bot, ChevronDown, LogOut, TrendingUp } from 'lucide-react';

const ALL_ACCOUNTS = 'all';

export default function Home() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) router.replace('/login');
  }, [router]);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string | null>(null);
  const [tab, setTab] = useState<'gestores' | 'all' | 'active' | 'paused' | 'agent'>('gestores');
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState(ALL_ACCOUNTS);
  const [agentEnabled, setAgentEnabled] = useState<boolean | null>(null);
  const [agentAccounts, setAgentAccounts] = useState<string[]>([]);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkScaleInput, setBulkScaleInput] = useState('');
  const [showBulkScale, setShowBulkScale] = useState(false);

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

  useEffect(() => {
    getGestores().then(setGestores).catch(() => {});
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
    setSelectedIds(new Set());
    load(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === listCampaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(listCampaigns.map(c => c.campaign_id)));
    }
  }

  async function bulkActivate() {
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id => activateCampaign(id).catch(() => {})));
      refresh();
    } finally { setBulkLoading(false); }
  }

  async function bulkPause() {
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id => pauseCampaign(id).catch(() => {})));
      refresh();
    } finally { setBulkLoading(false); }
  }

  async function bulkScale() {
    const pct = parseFloat(bulkScaleInput);
    if (isNaN(pct) || pct <= 0) return;
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id => {
        const c = campaigns.find(x => x.campaign_id === id);
        if (!c) return Promise.resolve();
        const newBudget = Math.round(c.daily_budget * (1 + pct / 100));
        return updateBudget(id, newBudget).catch(() => {});
      }));
      setShowBulkScale(false);
      setBulkScaleInput('');
      refresh();
    } finally { setBulkLoading(false); }
  }

  const directorGestor = gestores.find(g => g.is_director);

  // Contas disponíveis no filtro: só as do gestor selecionado (ou todas)
  const gestorAccountIds = selectedGestor
    ? (gestores.find(g => g.id === selectedGestor)?.accounts.map(a => a.account_id) ?? [])
    : [];
  const availableAccountIds = gestorAccountIds.length > 0 ? gestorAccountIds : Object.keys(ACCOUNT_NAMES);

  const filteredByGestor = gestorAccountIds.length > 0
    ? campaigns.filter(c => gestorAccountIds.includes(c.account_id))
    : campaigns;

  const filtered = accountFilter === ALL_ACCOUNTS
    ? filteredByGestor
    : filteredByGestor.filter(c => c.account_id === accountFilter);

  // Só mostra pausadas que tiveram gasto hoje (pausadas sem gasto = dias anteriores)
  const relevantFiltered = filtered.filter(c => c.status === 'ACTIVE' || c.spend > 0);
  const active = relevantFiltered.filter(c => c.status === 'ACTIVE');
  const paused = relevantFiltered.filter(c => c.status !== 'ACTIVE');

  const totalSpend = relevantFiltered.reduce((s, c) => s + c.spend, 0);
  const totalLeads = relevantFiltered.reduce((s, c) => s + c.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCtr = active.length > 0 ? active.reduce((s, c) => s + c.ctr, 0) / active.length : 0;

  const accountIds = availableAccountIds;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/30 text-sm">Carregando campanhas...</div>
      </div>
    );
  }

  const listCampaigns = (tab === 'all' ? relevantFiltered : tab === 'active' ? active : paused).sort((a, b) => b.spend - a.spend);

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
              title={agentEnabled ? 'Kill switch ON — agente pode rodar. Clique para bloquear tudo.' : 'Kill switch OFF — agente bloqueado globalmente. Clique para liberar.'}
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
          <button
            onClick={logout}
            title="Sair"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <LogOut size={15} className="text-white/40" />
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
          { key: 'gestores', label: 'Gestores' },
          { key: 'all', label: 'Todas' },
          { key: 'active', label: `Ativas (${active.length})` },
          { key: 'paused', label: `Pausadas (${paused.length})` },
          { key: 'agent', label: 'Agente' },
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

      {/* Gestores Tab */}
      {tab === 'gestores' && (
        <div className="flex flex-col gap-4">
          {/* Selected gestor indicator */}
          {selectedGestor && (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span>Filtrando campanhas por:</span>
              <span className="text-white/70 font-semibold">{gestores.find(g => g.id === selectedGestor)?.name}</span>
              <button onClick={() => setSelectedGestor(null)} className="text-white/30 hover:text-white/60 underline">
                Limpar filtro
              </button>
            </div>
          )}

          {/* Gestor cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gestores.map(g => (
              <GestorCard
                key={g.id}
                gestor={g}
                isSelected={selectedGestor === g.id}
                onSelect={() => {
                  if (selectedGestor === g.id) {
                    setSelectedGestor(null);
                  } else {
                    setSelectedGestor(g.id);
                    setAccountFilter(ALL_ACCOUNTS);
                    setTab('all');
                  }
                }}
                onRefresh={() => getGestores().then(setGestores).catch(() => {})}
                canEdit={!!directorGestor && g.id !== directorGestor.id}
              />
            ))}
          </div>

          {gestores.length === 0 && (
            <div className="text-center text-white/20 text-sm py-12">Carregando gestores...</div>
          )}
        </div>
      )}

      {/* Campaign Table */}
      {(tab === 'all' || tab === 'active' || tab === 'paused') && (
        listCampaigns.length === 0 ? (
          <div className="text-center text-white/30 text-sm py-16">
            Nenhuma campanha {tab === 'active' ? 'ativa' : tab === 'paused' ? 'pausada' : ''}{accountFilter !== ALL_ACCOUNTS ? ` na ${ACCOUNT_NAMES[accountFilter]}` : ''}.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
                <span className="text-xs text-white/50 mr-1">{selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}</span>
                <button onClick={bulkActivate} disabled={bulkLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                  Ativar todas
                </button>
                <button onClick={bulkPause} disabled={bulkLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-white/50 hover:bg-white/10 transition-colors disabled:opacity-50">
                  Pausar todas
                </button>
                {!showBulkScale ? (
                  <button onClick={() => setShowBulkScale(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                    <TrendingUp size={11}/> Escalar
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/40">+</span>
                    <input
                      type="number" min="1" max="500"
                      value={bulkScaleInput}
                      onChange={e => setBulkScaleInput(e.target.value)}
                      placeholder="20"
                      className="w-16 bg-white/10 text-white text-xs rounded px-2 py-1 focus:outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-white/40">%</span>
                    <button onClick={bulkScale} disabled={bulkLoading || !bulkScaleInput}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50">
                      Aplicar
                    </button>
                    <button onClick={() => { setShowBulkScale(false); setBulkScaleInput(''); }}
                      className="text-white/30 hover:text-white/60 text-xs px-1">✕</button>
                  </div>
                )}
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-white/25 hover:text-white/50 text-xs">Limpar</button>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 overflow-x-auto">
              <table className="w-full min-w-[740px] text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {/* Checkbox select-all */}
                    <th className="py-2.5 pl-4 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === listCampaigns.length && listCampaigns.length > 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                      />
                    </th>
                    {['', 'Campanha', 'Veiculação', 'Leads', 'CPL', 'Orçamento', 'Gasto', 'Impressões', 'CTR'].map((h, i) => (
                      <th
                        key={i}
                        className={`py-2.5 px-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider ${i === 0 ? 'w-12' : ''} ${i >= 3 ? 'text-right' : 'text-left'} ${i === 8 ? 'pr-4' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listCampaigns.map(c => (
                    <CampaignRow
                      key={c.campaign_id}
                      campaign={c}
                      onRefresh={refresh}
                      isSelected={selectedIds.has(c.campaign_id)}
                      onToggleSelect={() => toggleSelect(c.campaign_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Agent Log */}
      {tab === 'agent' && (
        <div className="flex flex-col gap-4">

          {/* Status do agente por gestor */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-white/50 font-semibold uppercase tracking-wider">
              <Bot size={12} />
              <span>Agente por gestor — ligue/desligue individualmente</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {gestores.filter(g => g.accounts.length > 0).map(g => (
                <div key={g.id} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold text-white/70">{g.name}</div>
                    <div className="text-[10px] text-white/30">
                      {g.accounts.map(a => ACCOUNT_NAMES[a.account_id] ?? a.account_id).join(' · ')}
                    </div>
                  </div>
                  <GestorCard
                    gestor={g}
                    isSelected={false}
                    onSelect={() => {}}
                    onRefresh={() => getGestores().then(setGestores).catch(() => {})}
                    canEdit={false}
                    agentOnly
                  />
                </div>
              ))}
            </div>
            {gestores.filter(g => g.accounts.length > 0).length === 0 && (
              <p className="text-xs text-white/25 italic">Nenhum gestor com contas atribuídas.</p>
            )}
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
