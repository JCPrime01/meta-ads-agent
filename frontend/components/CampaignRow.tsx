'use client';
import { useState } from 'react';
import { Campaign, AdsetInsight, pauseCampaign, activateCampaign, updateBudget, getDiagnosis, getAdsets, pauseAdset, activateAdset } from '@/lib/api';
import { Pause, Play, Zap, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

interface Props {
  campaign: Campaign;
  onRefresh: () => void;
}

function deliveryInfo(c: Campaign): { label: string; dot: string } {
  if (c.status === 'ACTIVE') {
    if (c.spend > 0) return { label: 'Ativo', dot: 'bg-blue-400' };
    return { label: 'Programado', dot: 'ring-1 ring-blue-400 bg-transparent' };
  }
  if (c.status === 'CAMPAIGN_PAUSED') return { label: 'Pausada', dot: 'bg-white/20' };
  return { label: c.status === 'PAUSED' ? 'Pausada' : c.status, dot: 'bg-white/20' };
}

function cplColor(cpl: number) {
  if (cpl <= 0) return 'text-white/30';
  if (cpl > 20) return 'text-red-400';
  if (cpl < 10) return 'text-green-400';
  return 'text-white/80';
}

function adsetDeliveryDot(status: string) {
  if (status === 'ACTIVE') return 'bg-blue-400';
  return 'bg-white/20';
}

export default function CampaignRow({ campaign: c, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [showDiag, setShowDiag] = useState(false);
  const [showAdsets, setShowAdsets] = useState(false);
  const [adsets, setAdsets] = useState<AdsetInsight[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [togglingAdset, setTogglingAdset] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(String(c.daily_budget.toFixed(0)));
  const { label: deliveryLabel, dot: dotClass } = deliveryInfo(c);
  const name = c.campaign_name.replace(/^\S+\s+/g, '').slice(0, 60);

  async function toggleStatus() {
    setLoading(true);
    try {
      c.status === 'ACTIVE' ? await pauseCampaign(c.campaign_id) : await activateCampaign(c.campaign_id);
      onRefresh();
    } finally { setLoading(false); }
  }

  async function handleDiagnose() {
    if (showDiag) { setShowDiag(false); return; }
    setLoading(true);
    try {
      const r = await getDiagnosis(c.campaign_id);
      setDiagnosis(r.diagnosis);
      setShowDiag(true);
    } finally { setLoading(false); }
  }

  async function handleToggleAdsets() {
    if (showAdsets) { setShowAdsets(false); return; }
    setLoadingAdsets(true);
    try {
      const data = await getAdsets(c.campaign_id);
      setAdsets(data);
      setShowAdsets(true);
    } finally { setLoadingAdsets(false); }
  }

  async function handleBudgetSave() {
    const val = parseFloat(budgetVal);
    if (isNaN(val) || val <= 0) return;
    setLoading(true);
    try {
      await updateBudget(c.campaign_id, val);
      setEditingBudget(false);
      onRefresh();
    } finally { setLoading(false); }
  }

  async function handleToggleAdset(a: AdsetInsight) {
    setTogglingAdset(a.adset_id);
    try {
      if (a.status === 'ACTIVE') {
        await pauseAdset(a.adset_id);
      } else {
        await activateAdset(a.adset_id);
      }
      // refresh adsets list
      const data = await getAdsets(c.campaign_id);
      setAdsets(data);
    } finally { setTogglingAdset(null); }
  }

  return (
    <>
      {/* ── DESKTOP ROW ── */}
      <tr className="hidden sm:table-row border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors group">
        {/* Status dot — clica para pausar/ativar */}
        <td className="py-3 pl-4 pr-2 w-8">
          <button
            onClick={toggleStatus}
            disabled={loading}
            title={c.status === 'ACTIVE' ? 'Pausar campanha' : 'Ativar campanha'}
            className="group/dot flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className={`w-2.5 h-2.5 rounded-full transition-transform group-hover/dot:scale-125 ${loading ? 'animate-pulse' : ''} ${dotClass}`} />
          </button>
        </td>
        {/* Campaign name + hover actions */}
        <td className="py-3 px-2 max-w-[260px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-white/90 truncate block leading-tight" title={c.campaign_name}>{name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
              <button onClick={handleToggleAdsets} disabled={loadingAdsets}
                className="text-[10px] text-white/40 hover:text-blue-400 transition-colors px-1.5 py-0.5 rounded bg-white/5 hover:bg-blue-500/10 flex items-center gap-1">
                {showAdsets ? <ChevronUp size={10}/> : <ChevronDown size={10}/>} Conjuntos
              </button>
              <button onClick={handleDiagnose} disabled={loading}
                className="text-[10px] text-white/40 hover:text-yellow-400 transition-colors px-1.5 py-0.5 rounded bg-white/5 hover:bg-yellow-500/10 flex items-center gap-1">
                <Zap size={10}/> IA
              </button>
            </div>
          </div>
        </td>
        {/* Delivery */}
        <td className="py-3 px-3 whitespace-nowrap">
          <span className="text-xs text-white/50">{deliveryLabel}</span>
        </td>
        {/* Leads */}
        <td className="py-3 px-3 text-right">
          <span className={`text-sm font-semibold tabular-nums ${c.leads > 0 ? 'text-white/90' : 'text-white/25'}`}>{c.leads > 0 ? c.leads : '—'}</span>
        </td>
        {/* CPL */}
        <td className="py-3 px-3 text-right">
          <span className={`text-sm font-semibold tabular-nums ${cplColor(c.cpl)}`}>{c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—'}</span>
        </td>
        {/* Budget */}
        <td className="py-3 px-3 text-right whitespace-nowrap">
          {editingBudget ? (
            <div className="flex items-center gap-1 justify-end">
              <span className="text-white/40 text-xs">R$</span>
              <input type="number" value={budgetVal} onChange={e => setBudgetVal(e.target.value)}
                className="w-20 bg-white/10 text-white text-xs rounded px-1.5 py-0.5 text-right focus:outline-none" autoFocus />
              <button onClick={handleBudgetSave} disabled={loading} className="p-0.5 text-green-400"><Check size={12}/></button>
              <button onClick={() => setEditingBudget(false)} className="p-0.5 text-white/30"><X size={12}/></button>
            </div>
          ) : (
            <button onClick={() => setEditingBudget(true)} className="text-right hover:text-white/80 transition-colors group/budget">
              <div className="text-sm tabular-nums text-white/70 group-hover/budget:text-white/90">R${c.daily_budget.toFixed(0)}</div>
              <div className="text-[10px] text-white/25">Diário</div>
            </button>
          )}
        </td>
        {/* Spend */}
        <td className="py-3 px-3 text-right">
          <span className="text-sm font-semibold tabular-nums text-white/90">R${c.spend.toFixed(2)}</span>
        </td>
        {/* Impressions */}
        <td className="py-3 px-3 text-right">
          <span className="text-sm tabular-nums text-white/50">{c.impressions > 0 ? c.impressions.toLocaleString('pt-BR') : '—'}</span>
        </td>
        {/* CTR */}
        <td className="py-3 px-3 text-right">
          <span className={`text-sm tabular-nums ${c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50'}`}>{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}</span>
        </td>
      </tr>

      {/* ── MOBILE CARD ── */}
      <tr className="sm:hidden">
        <td colSpan={10} className="px-3 py-2">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
                <span className="text-sm font-semibold text-white leading-tight truncate">{name}</span>
              </div>
              <span className="text-xs text-white/40 shrink-0">{deliveryLabel}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Leads', value: c.leads > 0 ? String(c.leads) : '—', color: c.leads > 0 ? 'text-white/90' : 'text-white/25' },
                { label: 'CPL', value: c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—', color: cplColor(c.cpl) },
                { label: 'Gasto', value: `R$${c.spend.toFixed(0)}`, color: 'text-white/80' },
                { label: 'Impres.', value: c.impressions > 0 ? c.impressions.toLocaleString('pt-BR') : '—', color: 'text-white/50' },
                { label: 'CTR', value: c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—', color: c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50' },
              ].map(m => (
                <div key={m.label} className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                  <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">{m.label}</div>
                  <div className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}</div>
                </div>
              ))}
              <div className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Budget</div>
                {editingBudget ? (
                  <div className="flex items-center gap-1 justify-center">
                    <input type="number" value={budgetVal} onChange={e => setBudgetVal(e.target.value)}
                      className="w-16 bg-white/10 text-white text-xs rounded px-1 py-0.5 text-center focus:outline-none" autoFocus />
                    <button onClick={handleBudgetSave} disabled={loading} className="text-green-400"><Check size={11}/></button>
                  </div>
                ) : (
                  <button onClick={() => setEditingBudget(true)} className="text-sm font-bold text-white/50 tabular-nums">R${c.daily_budget.toFixed(0)}</button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleToggleAdsets} disabled={loadingAdsets}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-semibold hover:bg-white/10 transition-colors">
                {showAdsets ? <ChevronUp size={13}/> : <ChevronDown size={13}/>} Conjuntos
              </button>
              <button onClick={handleDiagnose} disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 text-xs font-semibold">
                <Zap size={13}/> Diagnóstico
              </button>
              <button onClick={toggleStatus} disabled={loading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${c.status === 'ACTIVE' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                {c.status === 'ACTIVE' ? <><Pause size={13}/> Pausar</> : <><Play size={13}/> Ativar</>}
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* ── ADSETS EXPANSION ── */}
      {showAdsets && (
        <tr>
          <td colSpan={10} className="pb-1 px-4 sm:pl-12">
            {adsets.length === 0 ? (
              <div className="text-center text-white/20 text-xs py-3">Nenhum conjunto encontrado</div>
            ) : (
              <div className="flex flex-col gap-1">
                {adsets.map(a => (
                  <div key={a.adset_id}
                    className="bg-white/[0.015] border border-white/[0.05] rounded-xl px-4 py-2.5 flex items-center gap-3 group/adset">
                    {/* dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${adsetDeliveryDot(a.status)}`} />
                    {/* name + status */}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white/60 truncate block">{a.adset_name}</span>
                      <span className={`text-[10px] font-semibold ${a.status === 'ACTIVE' ? 'text-blue-400/70' : 'text-white/25'}`}>
                        {a.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    {/* metrics */}
                    <div className="hidden sm:flex gap-4 shrink-0 text-right">
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">Leads</div>
                        <div className={`text-xs font-semibold tabular-nums ${a.leads > 0 ? 'text-white/80' : 'text-white/25'}`}>{a.leads || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">CPL</div>
                        <div className={`text-xs font-semibold tabular-nums ${cplColor(a.cpl)}`}>{a.cpl > 0 ? `R$${a.cpl.toFixed(2)}` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">Gasto</div>
                        <div className="text-xs font-semibold tabular-nums text-white/50">R${a.spend.toFixed(0)}</div>
                      </div>
                    </div>
                    {/* pause/activate adset */}
                    <button
                      onClick={() => handleToggleAdset(a)}
                      disabled={togglingAdset === a.adset_id}
                      className={`p-1.5 rounded-lg opacity-0 group-hover/adset:opacity-100 transition-all shrink-0 ${
                        a.status === 'ACTIVE'
                          ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                          : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
                      } ${togglingAdset === a.adset_id ? 'opacity-50 animate-pulse' : ''}`}
                      title={a.status === 'ACTIVE' ? 'Pausar conjunto' : 'Ativar conjunto'}
                    >
                      {a.status === 'ACTIVE' ? <Pause size={12}/> : <Play size={12}/>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}

      {/* ── DIAGNOSIS ── */}
      {showDiag && diagnosis && (
        <tr>
          <td colSpan={10} className="pb-2 px-4 sm:pl-12">
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-100/80 leading-relaxed">
              <span className="text-yellow-400 font-bold">🔍 Diagnóstico IA</span><br/>
              {diagnosis}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
