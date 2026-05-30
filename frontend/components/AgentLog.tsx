'use client';
import { AgentAction } from '@/lib/api';
import { TrendingDown, TrendingUp, Bell, User, Bot } from 'lucide-react';

const actionStyle: Record<string, { icon: typeof TrendingDown; color: string; bg: string }> = {
  PAUSE_CAMPAIGN:       { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-500/10' },
  PAUSE_ADSET:          { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-500/10' },
  PAUSE_AD:             { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-500/10' },
  SCALE_UP:             { icon: TrendingUp,   color: 'text-green-400',  bg: 'bg-green-500/10' },
  REDUCE_BUDGET:        { icon: TrendingDown, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  MANUAL_PAUSE:         { icon: TrendingDown, color: 'text-red-400',    bg: 'bg-red-500/10' },
  ACTIVATE_CAMPAIGN:    { icon: TrendingUp,   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  MANUAL_ACTIVATE:      { icon: TrendingUp,   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  MANUAL_SCALE_UP:      { icon: TrendingUp,   color: 'text-green-400',  bg: 'bg-green-500/10' },
  MANUAL_REDUCE_BUDGET: { icon: TrendingDown, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  DEFAULT:              { icon: Bell,         color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
};

export default function AgentLog({ actions }: { actions: AgentAction[] }) {
  if (!actions.length) {
    return (
      <div className="text-center text-white/30 py-12 text-sm">
        Nenhuma ação registrada ainda.<br />O agente roda a cada 30 min.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map(a => {
        const cfg = actionStyle[a.action] ?? actionStyle.DEFAULT;
        const Icon = cfg.icon;
        const isManual = a.source === 'MANUAL';
        const date = new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return (
          <div
            key={a.id}
            className={`flex items-center gap-3 border rounded-xl p-3 ${
              isManual ? 'bg-blue-500/5 border-blue-500/20' : 'bg-[#1a1a1a] border-white/10'
            }`}
          >
            <div className={`p-2 rounded-lg ${cfg.bg}`}>
              <Icon size={14} className={cfg.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {isManual
                  ? <User size={10} className="text-blue-400 shrink-0" />
                  : <Bot size={10} className="text-white/30 shrink-0" />
                }
                <span className={`text-xs font-semibold ${isManual ? 'text-blue-300' : 'text-white/80'}`}>
                  {a.reason}
                </span>
              </div>
              <div className="text-[10px] text-white/30 truncate mt-0.5">ID: {a.campaign_id}</div>
            </div>
            <div className="text-[10px] text-white/30 shrink-0">{date}</div>
          </div>
        );
      })}
    </div>
  );
}
