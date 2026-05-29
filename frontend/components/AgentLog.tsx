'use client';
import { AgentAction } from '@/lib/api';
import { TrendingDown, TrendingUp, Bell } from 'lucide-react';

const icons = {
  PAUSE: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
  SCALE_UP: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
  ALERT: { icon: Bell, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
};

const reasons: Record<string, string> = {
  cpl_high: 'CPL acima do limite',
  ctr_low: 'CTR abaixo do mínimo',
  frequency_high: 'Audiência saturada',
  cpl_good: 'CPL excelente — escalou',
};

export default function AgentLog({ actions }: { actions: AgentAction[] }) {
  if (!actions.length) {
    return (
      <div className="text-center text-white/30 py-12 text-sm">
        Nenhuma ação registrada ainda.<br />O agente roda de hora em hora.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map(a => {
        const cfg = icons[a.action as keyof typeof icons] || icons.ALERT;
        const Icon = cfg.icon;
        const date = new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return (
          <div key={a.id} className="flex items-center gap-3 bg-[#1a1a1a] border border-white/10 rounded-xl p-3">
            <div className={`p-2 rounded-lg ${cfg.bg}`}>
              <Icon size={14} className={cfg.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white/80">{reasons[a.reason] || a.reason}</div>
              <div className="text-[10px] text-white/30 truncate">ID: {a.campaign_id}</div>
            </div>
            <div className="text-[10px] text-white/30 shrink-0">{date}</div>
          </div>
        );
      })}
    </div>
  );
}
