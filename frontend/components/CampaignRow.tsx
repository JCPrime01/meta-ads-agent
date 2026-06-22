'use client';
import { useState } from 'react';
import { Campaign, AdsetInsight, pauseCampaign, activateCampaign, updateBudget, getDiagnosis, getAdsets } from '@/lib/api';
import { Pause, Play, Zap, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

interface Props {
  campaign: Campaign;
  onRefresh: () => void;
}

function statusBadge(c: Campaign) {
  if (c.status === 'ACTIVE') {
    if (c.cpl > 0 && c.cpl < 10) return { label: 'Escalando', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (c.cpl > 20) return { label: 'CPL Alto', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    return { label: 'Ativo', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
  }
  return { label: 'Pausado', color: 'bg-white/10 text-white/40 border-white/10' };
}

function cplColor(cpl: number) {
  if (cpl <= 0) return 'text-white/30';
  if (cpl > 20) return 'text-red-400';
  if (cpl < 10) return 'text-green-400';
  return 'text-white/80';
}

export default function CampaignRow({ campaign: c, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [showDiag, setShowDiag] = useState(false);
  const [showAdsets, setShowAdsets] = useState(false);
  const [adsets, setAdsets] = useState<AdsetInsight[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(String(c.daily_budget.toFixed(0)));
  const badge = statusBadge(c);
  const name = c.campaign_name.replace(/^\S+\s+/g, '').slice(0, 55);

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

  return (
    <>
      {/* ── DESKTOP ROW ── */}
      <tr className="hidden sm:table-row border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
        <td className="py-3 px-4 max-w-[240px]">
          <span className="text-sm text-white/90 truncate block" title={c.campaign_name}>{name}</span>
        </td>
        <td className="py-3 px-4 whitespace-nowrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm font-bold tabular-nums ${c.leads > 0 ? 'text-green-400' : 'text-white/30'}`}>{c.leads > 0 ? c.leads : '—'}</span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm font-bold tabular-nums ${cplColor(c.cpl)}`}>{c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—'}</span>
        </td>
        <td className="py-3 px-4 text-right">
          {editingBudget ? (
            <div className="flex items-center gap-1 justify-end">
              <span className="text-white/40 text-xs">R$</span>
              <input
                type="number"
                value={budgetVal}
                onChange={e => setBudgetVal(e.target.value)}
                className="w-20 bg-white/10 text-white text-xs rounded px-1.5 py-0.5 text-right focus:outline-none"
                autoFocus
              />
              <button onClick={handleBudgetSave} disabled={loading} className="p-0.5 text-green-400 hover:text-green-300"><Check size={12}/></button>
              <button onClick={() => setEditingBudget(false)} className="p-0.5 text-white/30 hover:text-white/60"><X size={12}/></button>
            </div>
          ) : (
            <button onClick={() => setEditingBudget(true)} className="text-sm tabular-nums text-white/50 hover:text-white/80 transition-colors">
              R${c.daily_budget.toFixed(0)}
            </button>
          )}
        </td>
        <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-white/90">R${c.spend.toFixed(2)}</td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm tabular-nums ${c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50'}`}>{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}</span>
        </td>
        <td className="py-3 px-4 text-right text-sm tabular-nums text-white/50">{c.cpc > 0 ? `R$${c.cpc.toFixed(2)}` : '—'}</td>
        <td className="py-3 px-4">
          <div className="flex gap-1.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={handleToggleAdsets} disabled={loadingAdsets} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors" title="Ver conjuntos">
              {showAdsets ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
            <button onClick={handleDiagnose} disabled={loading} className="p-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors" title="Diagnóstico IA">
              <Zap size={13}/>
            </button>
            <button onClick={toggleStatus} disabled={loading} className={`p-1.5 rounded-lg transition-colors ${c.status === 'ACTIVE' ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'}`} title={c.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}>
              {c.status === 'ACTIVE' ? <Pause size={13}/> : <Play size={13}/>}
            </button>
          </div>
        </td>
      </tr>

      {/* ── MOBILE CARD ── */}
      <tr className="sm:hidden">
        <td colSpan={9} className="px-3 py-2">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-white leading-tight">{name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}>{badge.label}</span>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Leads', value: c.leads > 0 ? String(c.leads) : '—', color: c.leads > 0 ? 'text-green-400' : 'text-white/30' },
                { label: 'CPL', value: c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—', color: cplColor(c.cpl) },
                { label: 'Gasto', value: `R$${c.spend.toFixed(0)}`, color: 'text-white/80' },
                { label: 'CTR', value: c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—', color: c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50' },
                { label: 'CPC', value: c.cpc > 0 ? `R$${c.cpc.toFixed(2)}` : '—', color: 'text-white/50' },
              ].map(m => (
                <div key={m.label} className="bg-white/[0.03] rounded-xl p-2.5 text-center">
                  <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">{m.label}</div>
                  <div className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}</div>
                </div>
              ))}
              {/* Budget editable */}
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

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={handleToggleAdsets} disabled={loadingAdsets}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-semibold hover:bg-white/10 transition-colors">
                {showAdsets ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                Conjuntos
              </button>
              <button onClick={handleDiagnose} disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 text-xs font-semibold hover:bg-yellow-500/20 transition-colors">
                <Zap size={13}/>
                Diagnóstico
              </button>
              <button onClick={toggleStatus} disabled={loading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${c.status === 'ACTIVE' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                {c.status === 'ACTIVE' ? <><Pause size={13}/> Pausar</> : <><Play size={13}/> Ativar</>}
              </button>
            </div>
          </div>
        </td>
      </tr>

      {/* ── ADSETS EXPANSION (shared desktop+mobile) ── */}
      {showAdsets && (
        <tr>
          <td colSpan={9} className="pb-2 px-3 sm:px-4">
            {adsets.length === 0 ? (
              <div className="text-center text-white/20 text-xs py-3">Nenhum conjunto encontrado</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {adsets.map(a => (
                  <div key={a.adset_id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white/60 truncate block">{a.adset_name.slice(0, 50)}</span>
                      <span className={`text-[10px] font-semibold ${a.status === 'ACTIVE' ? 'text-green-400/70' : 'text-white/30'}`}>{a.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}</span>
                    </div>
                    <div className="flex gap-3 shrink-0 text-right">
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">Leads</div>
                        <div className={`text-xs font-bold ${a.leads > 0 ? 'text-green-400' : 'text-white/30'}`}>{a.leads || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">CPL</div>
                        <div className={`text-xs font-bold ${cplColor(a.cpl)}`}>{a.cpl > 0 ? `R$${a.cpl.toFixed(2)}` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-white/20 uppercase">Gasto</div>
                        <div className="text-xs font-bold text-white/60">R${a.spend.toFixed(0)}</div>
                      </div>
                    </div>
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
          <td colSpan={9} className="pb-2 px-3 sm:px-4">
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
