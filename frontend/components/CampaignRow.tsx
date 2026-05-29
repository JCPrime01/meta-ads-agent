'use client';
import { useState } from 'react';
import { Campaign, pauseCampaign, activateCampaign, getDiagnosis } from '@/lib/api';
import { Pause, Play, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

  const name = c.campaign_name.replace(/^\S+\s+/g, '').slice(0, 55);

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-bold truncate text-white/90">{name}</span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
            <span className="text-[10px] text-white/30">R${c.daily_budget.toFixed(0)}/dia</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleDiagnose}
            disabled={loading}
            className="p-2 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors"
            title="Diagnóstico IA"
          >
            <Zap size={14} />
          </button>
          <button
            onClick={toggleStatus}
            disabled={loading}
            className={`p-2 rounded-xl transition-colors ${
              c.status === 'ACTIVE'
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'
            }`}
            title={c.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
          >
            {c.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Metric label="Gasto" value={`R$${c.spend.toFixed(2)}`} />
        <Metric label="CPL" value={c.cpl > 0 ? `R$${c.cpl.toFixed(2)}` : '—'} highlight={c.cpl > 20 ? 'bad' : c.cpl > 0 && c.cpl < 10 ? 'good' : 'neutral'} />
        <Metric label="CTR" value={c.ctr > 0 ? `${c.ctr.toFixed(1)}%` : '—'} highlight={c.ctr < 0.8 && c.ctr > 0 ? 'bad' : 'neutral'} />
        <Metric label="Leads" value={String(c.leads)} highlight={c.leads > 0 ? 'good' : 'neutral'} />
      </div>

      {showDiag && diagnosis && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-100/80 leading-relaxed">
          <span className="text-yellow-400 font-bold">🔍 Diagnóstico IA</span><br />
          {diagnosis}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight = 'neutral' }: { label: string; value: string; highlight?: 'good' | 'bad' | 'neutral' }) {
  const colors = { good: 'text-green-400', bad: 'text-red-400', neutral: 'text-white/70' };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-white/30 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-bold ${colors[highlight]}`}>{value}</span>
    </div>
  );
}
