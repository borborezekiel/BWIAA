"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MemberLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [mode, setMode]         = useState<'login'|'reset'>('login');
  const [resetSent, setResetSent] = useState(false);

  async function loginEmail() {
    if (!email.includes('@')) { setError('Valid email required.'); return; }
    if (!password) { setError('Password required.'); return; }
    setLoading(true); setError('');
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) { setError(e.message); setLoading(false); return; }
    // Link auth_user_id to member profile if not yet linked
    if (data.user) {
      const { data: mem } = await supabase.from('members')
        .select('id, auth_user_id').eq('email', email.trim().toLowerCase()).maybeSingle();
      if (mem && !mem.auth_user_id) {
        await supabase.from('members').update({ auth_user_id: data.user.id }).eq('id', mem.id);
      }
    }
    setLoading(false);
    router.push('/members/dashboard');
  }

  async function loginGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/members/dashboard` },
    });
  }

  async function sendReset() {
    if (!email.includes('@')) { setError('Enter your email above first.'); return; }
    setLoading(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/members/reset-password`,
    });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setResetSent(true);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/members" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Member Portal</Link>
          <div className="w-16 h-16 bg-red-600 rounded-3xl flex items-center justify-center mx-auto mt-6 mb-4">
            <Lock size={28} className="text-white"/>
          </div>
          <h1 className="text-white text-3xl font-black uppercase italic">Member Login</h1>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-2">Sign in to your member account</p>
        </div>

        <div className="bg-white rounded-[3rem] p-8 shadow-2xl space-y-4">
          {mode === 'login' ? (
            <>
              {/* Google */}
              <button onClick={loginGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 border-2 border-slate-200 hover:border-slate-400 rounded-2xl px-6 py-4 font-black text-slate-700 transition-all text-sm disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"/>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">or</p>
                <div className="flex-1 h-px bg-slate-200"/>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Email Address</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com"
                  onKeyDown={e => e.key === 'Enter' && loginEmail()}
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Password</label>
                <div className="relative">
                  <input value={password} onChange={e => setPassword(e.target.value)} type={showPass?'text':'password'} placeholder="Your password"
                    onKeyDown={e => e.key === 'Enter' && loginEmail()}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 pr-12 font-bold outline-none"/>
                  <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPass ? <EyeOff size={18}/> : <Eye size={18}/>}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/>
                  <p className="text-red-700 text-sm font-bold">{error}</p>
                </div>
              )}

              <button onClick={loginEmail} disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin"/> : null}
                Sign In
              </button>

              <div className="flex justify-between text-xs font-black">
                <button onClick={() => { setMode('reset'); setError(''); }} className="text-slate-400 hover:text-red-600 transition-all uppercase tracking-widest">
                  Forgot Password?
                </button>
                <Link href="/members/register" className="text-red-600 hover:underline uppercase tracking-widest">
                  Create Account
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-2">
                <p className="font-black text-slate-800 uppercase">Reset Password</p>
                <p className="text-xs text-slate-500 font-bold mt-1">Enter your email to receive a reset link</p>
              </div>
              {resetSent ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
                  <p className="font-black text-green-700 text-sm">✓ Reset link sent!</p>
                  <p className="text-xs text-green-600 font-bold mt-1">Check your email inbox.</p>
                </div>
              ) : (
                <>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@email.com"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
                  {error && <p className="text-red-600 text-xs font-bold">{error}</p>}
                  <button onClick={sendReset} disabled={loading}
                    className="w-full bg-slate-900 hover:bg-slate-700 text-white font-black uppercase py-4 rounded-2xl transition-all disabled:opacity-50">
                    Send Reset Link
                  </button>
                </>
              )}
              <button onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
                className="w-full text-xs font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-all">
                ← Back to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
