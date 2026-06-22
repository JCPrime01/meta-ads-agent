'use client';
import { useState } from 'react';
import { Campaign, AdsetInsight, pauseCampaign, activateCampaign, updateBudget, getDiagnosis, getAdsets, pauseAdset, activateAdset } from '@/lib/api';
import { Zap, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

interface Props {
  campaign: Campaign;
  onRefresh: () => void;
}

function deliveryLabel(status: string, spend: number): string {
  if (status === 'ACTIVE') return spend > 0 ? 'Ativo' : 'Programado';
  return 'Pausado';
}

function cplColor(cpl: number) {
  if (cpl <= 0) return 'text-white/30';
  if (cpl > 20) return 'text-red-400';
  if (cpl < 10) return 'text-green-400';
  return 'text-white/80';
}

function Toggle({ active, loading, onToggle, title }: { active: boolean; loading: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={title}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed ${active ? 'bg-blue-500' : 'bg-white/20'} ${loading ? 'opacity-60' : ''}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

export default function CampaignRow({ campaign: c, onRefresh }: Props) {
  const [localStatus, setLocalStatus] = useState(c.status);
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [showDiag, setShowDiag] = useState(false);
  const [showAdsets, setShowAdsets] = useState(false);
  const [adsets, setAdsets] = useState<AdsetInsight[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [adsetStatuses, setAdsetStatuses] = useState<Record<string, string>>({});
  const [togglingAdset, setTogglingAdset] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(String(c.daily_budget.toFixed(0)));

  const isActive = localStatus === 'ACTIVE';
  const label = deliveryLabel(localStatus, c.spend);
  const name = c.campaign_name.replace(/^\S+\s+/g, '').slice(0, 60);

  async function toggleStatus() {
    const next = isActive ? 'PAUSED' : 'ACTIVE';
    setLocalStatus(next); // otimista: anima imediatamente
    setLoading(true);
    try {
      isActive ? await pauseCampaign(c.campaign_id) : await activateCampaign(c.campaign_id);
      onRefresh();
    } catch {
      setLocalStatus(localStatus); // reverte se falhar
    } finally {
      setLoading(false);
    }
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
    const cur = adsetStatuses[a.adset_id] ?? a.status;
    const next = cur === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setAdsetStatuses(prev => ({ ...prev, [a.adset_id]: next })); // otimista
    setTogglingAdset(a.adset_id);
    try {
      cur === 'ACTIVE' ? await pauseAdset(a.adset_id) : await activateAdset(a.adset_id);
      const data = await getAdsets(c.campaign_id);
      setAdsets(data);
      setAdsetStatuses({});
    } catch {
      setAdsetStatuses(prev => ({ ...prev, [a.adset_id]: cur })); // reverte
    } finally {
      setTogglingAdset(null);
    }
  }

  return (
    <>
      {/* ── TABLE ROW (desktop + mobile scroll) ── */}
      <tr className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors group">
        {/* Toggle switch */}
        <td className="py-3 pl-4 pr-2 w-12">
          <Toggle
            active={isActive}
            loading={loading}
            onToggle={toggleStatus}
            title={isActive ? 'Pausar campanha' : 'Ativar campanha'}
          />
        </td>
        {/* Campaign name — clica para expandir conjuntos */}
        <td className="py-3 px-2 max-w-[260px]">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={handleToggleAdsets}
              disabled={loadingAdsets}
              className="text-sm text-white/90 truncate block leading-tight text-left hover:text-white transition-colors cursor-pointer"
              title={c.campaign_name}
            >
              {name}
            </button>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] text-white/25 flex items-center gap-0.5 transition-colors ${showAdsets ? 'text-blue-400/60' : ''}`}>
                {showAdsets ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                {loadingAdsets ? 'Carregando...' : 'Conjuntos'}
              </span>
              <button onClick={handleDiagnose} disabled={loading}
                className="text-[10px] text-white/25 hover:text-yellow-400 transition-colors px-1 py-0.5 rounded hover:bg-yellow-500/10 flex items-center gap-0.5">
                <Zap size={9}/> IA
              </button>
            </div>
          </div>
        </td>
        {/* Delivery */}
        <td className="py-3 px-3 whitespace-nowrap">
          <span className={`text-xs ${isActive ? 'text-white/50' : 'text-white/25'}`}>{label}</span>
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
        <td className="py-3 px-3 pr-4 text-right">
          <span className={`text-sm tabular-nums ${c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50'}`}>{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}</span>
        </td>
      </tr>

      {/* ── ADSETS EXPANSION ── */}
      {showAdsets && (
        <tr>
          <td colSpan={9} className="pb-1 px-4 sm:pl-14">
            {adsets.length === 0 ? (
              <div className="text-center text-white/20 text-xs py-3">Nenhum conjunto encontrado</div>
            ) : (
              <div className="flex flex-col gap-1">
                {adsets.map(a => {
                  const adsetActive = (adsetStatuses[a.adset_id] ?? a.status) === 'ACTIVE';
                  return (
                    <div key={a.adset_id}
                      className="bg-white/[0.015] border border-white/[0.05] rounded-xl px-4 py-2.5 flex items-center gap-3">
                      <Toggle
                        active={adsetActive}
                        loading={togglingAdset === a.adset_id}
                        onToggle={() => handleToggleAdset(a)}
                        title={adsetActive ? 'Pausar conjunto' : 'Ativar conjunto'}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-white/60 truncate block">{a.adset_name}</span>
                        <span className={`text-[10px] font-semibold ${adsetActive ? 'text-blue-400/70' : 'text-white/25'}`}>
                          {adsetActive ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>
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
                    </div>
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      )}

      {/* ── DIAGNOSIS ── */}
      {showDiag && diagnosis && (
        <tr>
          <td colSpan={9} className="pb-2 px-4 sm:pl-14">
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
