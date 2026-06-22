'use client';
import { useState, useEffect } from 'react';
import { Gestor, GestorAccount, addGestorAccount, removeGestorAccount, toggleGestorAgent, toggleGestorAccountAgent, ACCOUNT_NAMES } from '@/lib/api';
import { Crown, Plus, X, ChevronRight, Bot } from 'lucide-react';

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; avatar: string }> = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20',   avatar: 'bg-blue-500/20 text-blue-400' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', avatar: 'bg-purple-500/20 text-purple-400' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20',  avatar: 'bg-green-500/20 text-green-400' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', avatar: 'bg-orange-500/20 text-orange-400' },
  pink:   { bg: 'bg-pink-500/10',   text: 'text-pink-400',   border: 'border-pink-500/20',   avatar: 'bg-pink-500/20 text-pink-400' },
};

const ALL_ACCOUNT_IDS = Object.keys(ACCOUNT_NAMES);

interface Props {
  gestor: Gestor;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  canEdit: boolean; // only true when IVAN (director) is viewing
  agentOnly?: boolean; // render only the agent toggle button
}

const PROJECTS = ['JOTAP', 'RAMON', 'ZECA'];

export default function GestorCard({ gestor, isSelected, onSelect, onRefresh, canEdit, agentOnly = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(!!gestor.agent_enabled);
  const [projectForAccount, setProjectForAccount] = useState<Record<string, string>>({});
  const [accountAgentStates, setAccountAgentStates] = useState<Record<string, boolean>>(
    () => Object.fromEntries(gestor.accounts.map(a => [a.account_id, !!a.agent_enabled]))
  );
  const [togglingAccount, setTogglingAccount] = useState<string | null>(null);

  // Sync when parent re-fetches gestor data
  useEffect(() => { setAgentEnabled(!!gestor.agent_enabled); }, [gestor.agent_enabled]);
  useEffect(() => {
    setAccountAgentStates(Object.fromEntries(gestor.accounts.map(a => [a.account_id, !!a.agent_enabled])));
  }, [gestor.accounts]);

  const colors = COLOR_MAP[gestor.color] || COLOR_MAP.blue;
  const assignedIds = gestor.accounts.map(a => a.account_id);

  async function handleToggleAgent(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (gestor.accounts.length === 0) return;
    const prev = agentEnabled;
    setAgentEnabled(!prev); // optimistic
    setTogglingAgent(true);
    try {
      const next = await toggleGestorAgent(gestor.id);
      setAgentEnabled(next);
    } catch {
      setAgentEnabled(prev); // revert on error
    } finally { setTogglingAgent(false); }
  }

  async function handleToggleAccount(accountId: string) {
    setSaving(true);
    try {
      if (assignedIds.includes(accountId)) {
        await removeGestorAccount(gestor.id, accountId);
      } else {
        const project = projectForAccount[accountId] || 'JOTAP';
        await addGestorAccount(gestor.id, accountId, project);
      }
      onRefresh();
    } finally { setSaving(false); }
  }

  // Group accounts by project
  const byProject: Record<string, GestorAccount[]> = {};
  for (const acc of gestor.accounts) {
    if (!byProject[acc.project_name]) byProject[acc.project_name] = [];
    byProject[acc.project_name].push(acc);
  }

  async function handleToggleAccountAgent(accountId: string) {
    const prev = accountAgentStates[accountId] ?? false;
    setAccountAgentStates(s => ({ ...s, [accountId]: !prev }));
    setTogglingAccount(accountId);
    try {
      const next = await toggleGestorAccountAgent(gestor.id, accountId);
      setAccountAgentStates(s => ({ ...s, [accountId]: next }));
    } catch {
      setAccountAgentStates(s => ({ ...s, [accountId]: prev }));
    } finally { setTogglingAccount(null); }
  }

  if (agentOnly) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {gestor.accounts.map(acc => {
          const on = accountAgentStates[acc.account_id] ?? false;
          const toggling = togglingAccount === acc.account_id;
          return (
            <button
              key={acc.account_id}
              onClick={() => handleToggleAccountAgent(acc.account_id)}
              disabled={toggling}
              title={`${ACCOUNT_NAMES[acc.account_id] ?? acc.account_id} — ${on ? 'Ativo' : 'Inativo'}`}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                on
                  ? 'bg-green-500/15 border-green-500/30 text-green-400'
                  : 'bg-white/[0.03] border-white/10 text-white/30 hover:text-white/50'
              } ${toggling ? 'opacity-50' : ''}`}
            >
              <Bot size={9} className={toggling ? 'animate-pulse' : ''} />
              <span>{ACCOUNT_NAMES[acc.account_id] ?? acc.account_id}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border transition-all ${colors.bg} ${colors.border} ${isSelected ? 'ring-2 ring-offset-1 ring-offset-[#0a0a0a] ' + colors.text.replace('text-', 'ring-') : ''} ${!editing ? 'cursor-pointer hover:brightness-110' : ''}`}
      onClick={!editing ? onSelect : undefined}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${colors.avatar}`}>
              {gestor.name[0]}
            </div>
            <div>
              <div className={`text-sm font-bold ${colors.text}`}>{gestor.name}</div>
              {gestor.is_director && (
                <div className="flex items-center gap-1 text-[10px] text-white/30">
                  <Crown size={9} className="text-yellow-400" />
                  <span className="text-yellow-400/70">Diretor</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Agent toggle — só para gestores com contas */}
            {gestor.accounts.length > 0 && (
              <button
                onClick={handleToggleAgent}
                disabled={togglingAgent}
                title={agentEnabled ? 'Agente ativo — clique para desativar' : 'Agente inativo — clique para ativar'}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                  agentEnabled
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : 'bg-white/[0.03] border-white/10 text-white/30 hover:text-white/50'
                } ${togglingAgent ? 'opacity-50' : ''}`}
              >
                <Bot size={10} className={togglingAgent ? 'animate-pulse' : ''} />
                {agentEnabled ? 'ON' : 'OFF'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={e => { e.stopPropagation(); setEditing(!editing); }}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${editing ? 'bg-white/10 border-white/20 text-white/70' : 'border-white/10 text-white/30 hover:text-white/60 hover:bg-white/5'}`}
              >
                {editing ? 'Fechar' : 'Editar'}
              </button>
            )}
            {!editing && (
              <ChevronRight size={14} className={`${colors.text} opacity-50`} />
            )}
          </div>
        </div>

        {/* Account chips (view mode) */}
        {!editing && (
          <>
            {gestor.accounts.length === 0 ? (
              <p className="text-[11px] text-white/25 italic">Sem contas atribuídas</p>
            ) : (
              Object.entries(byProject).map(([project, accs]) => (
                <div key={project}>
                  <div className="text-[9px] text-white/25 uppercase tracking-wider mb-1.5">{project}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {accs.map(a => (
                      <span key={a.account_id} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                        {ACCOUNT_NAMES[a.account_id] ?? a.account_id}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Edit mode */}
        {editing && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-white/40 uppercase tracking-wider">Contas atribuídas</div>
            <div className="flex flex-col gap-1.5">
              {ALL_ACCOUNT_IDS.map(accId => {
                const assigned = assignedIds.includes(accId);
                const assignedAccount = gestor.accounts.find(a => a.account_id === accId);
                return (
                  <div key={accId} className="flex items-center justify-between py-1 px-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/60">{ACCOUNT_NAMES[accId] ?? accId}</span>
                      {assigned && assignedAccount && (
                        <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{assignedAccount.project_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!assigned && (
                        <select
                          value={projectForAccount[accId] || 'JOTAP'}
                          onChange={e => setProjectForAccount(prev => ({ ...prev, [accId]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          className="appearance-none bg-white/5 border border-white/10 text-white/50 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
                        >
                          {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      )}
                      <button
                        onClick={() => handleToggleAccount(accId)}
                        disabled={saving}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${assigned ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
                      >
                        {assigned ? <><X size={10}/> Remover</> : <><Plus size={10}/> Adicionar</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
