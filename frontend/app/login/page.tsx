'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, isLoggedIn } from '@/lib/api';
import { Bot, Shield } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [require2fa, setRequire2fa] = useState(false);
  const [is2faEnabled, setIs2faEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoggedIn()) { router.replace('/'); return; }
    fetch('/api/backend/auth/2fa/status')
      .then(r => r.json())
      .then(d => setIs2faEnabled(d.enabled))
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(password, is2faEnabled || require2fa ? code : undefined);
      if (res.ok) {
        router.replace('/');
      } else if (res.require2fa) {
        setRequire2fa(true);
        setError('');
      } else {
        setError(res.error ?? 'Credenciais inválidas');
      }
    } catch {
      setError('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  const show2fa = is2faEnabled || require2fa;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center">
            <Bot size={20} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-white font-black text-lg leading-none">Meta Ads Agent</h1>
            <p className="text-white/30 text-xs">Painel de controle</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/50 font-semibold uppercase tracking-wider">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus={!require2fa}
              required
              placeholder="••••••••"
              className="bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 placeholder:text-white/20 transition-colors"
            />
          </div>

          {show2fa && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-white/50 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={11} />
                Código 2FA (Google Authenticator)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus={require2fa}
                placeholder="000000"
                className="bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 placeholder:text-white/20 transition-colors tracking-[0.3em] text-center"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || (show2fa && code.length !== 6)}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
