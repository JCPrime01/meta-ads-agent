'use client';
import { useState } from 'react';
import { Campaign, pauseCampaign, activateCampaign, getDiagnosis } from '@/lib/api';
import { Pause, Play, Zap } from 'lucide-react';

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

export default function CampaignRow({ campaign: c, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [showDiag, setShowDiag] = useState(false);
  const badge = statusBadge(c);

  async function toggleStatus() {
    setLoading(true);
    try {
      c.status === 'ACTIVE' ? await pauseCampaign(c.campaign_id) : await activateCampaign(c.campaign_id);
      onRefresh();
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
    } finally {
      setLoading(false);
    }
  }

  const name = c.campaign_name.replace(/^\S+\s+/g, '').slice(0, 60);

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
        <td className="py-3 px-4 max-w-[280px]">
          <span className="text-sm text-white/90 truncate block" title={c.campaign_name}>{name}</span>
        </td>
        <td className="py-3 px-4 whitespace-nowrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
            {badge.label}
          </span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm font-bold tabular-nums ${c.leads > 0 ? 'text-green-400' : 'text-white/30'}`}>
            {c.leads > 0 ? c.leads : '—'}
          </span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm font-bold tabular-nums ${c.cpl > 20 ? 'text-red-400' : c.cpl > 0 ? 'text-white/80' : 'text-white/30'}`}>
            {c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—'}
          </span>
        </td>
        <td className="py-3 px-4 text-right text-sm tabular-nums text-white/50">
          R${c.daily_budget.toFixed(0)}
        </td>
        <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-white/90">
          R${c.spend.toFixed(2)}
        </td>
        <td className="py-3 px-4 text-right">
          <span className={`text-sm tabular-nums ${c.ctr < 0.8 && c.ctr > 0 ? 'text-yellow-400' : 'text-white/50'}`}>
            {c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}
          </span>
        </td>
        <td className="py-3 px-4 text-right text-sm tabular-nums text-white/50">
          {c.cpc > 0 ? `R$${c.cpc.toFixed(2)}` : '—'}
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-1.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleDiagnose}
              disabled={loading}
              className="p-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors"
              title="Diagnóstico IA"
            >
              <Zap size={13} />
            </button>
            <button
              onClick={toggleStatus}
              disabled={loading}
              className={`p-1.5 rounded-lg transition-colors ${
                c.status === 'ACTIVE'
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                  : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
              }`}
              title={c.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
            >
              {c.status === 'ACTIVE' ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>
        </td>
      </tr>
      {showDiag && diagnosis && (
        <tr>
          <td colSpan={9} className="pb-2 px-4">
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-100/80 leading-relaxed">
              <span className="text-yellow-400 font-bold">🔍 Diagnóstico IA</span><br />
              {diagnosis}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
