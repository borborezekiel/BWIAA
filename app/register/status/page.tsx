"use client";

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';
import Link from 'next/link';

function StatusContent() {
  const params = useSearchParams();
  const [appId, setAppId]     = useState(params.get('id') ?? '');
  const [email, setEmail]     = useState('');
  const [result, setResult]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function checkStatus() {
    if (!appId.trim() && !email.trim()) return;
    setLoading(true); setSearched(false); setResult(null);
    try {
      let data = null;
      if (email.trim()) {
        // Email search is most reliable
        const { data: d } = await supabase
          .from('candidate_applications')
          .select('*')
          .eq('applicant_email', email.trim().toLowerCase())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = d;
      } else if (appId.trim()) {
        // Search all apps and filter client-side by UUID prefix (avoids cast issues)
        const prefix = appId.trim().toLowerCase();
        const { data: all } = await supabase
          .from('candidate_applications')
          .select('*')
          .order('created_at', { ascending: false });
        data = all?.find(r => r.id.toLowerCase().startsWith(prefix)) ?? null;
      }
      setResult(data);
    } catch (e) {
      setResult(null);
    }
    setLoading(false); setSearched(true);
  }

  useEffect(() => { if (params.get('id')) checkStatus(); }, []);

  const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string; desc: string }> = {
    pending:  { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: <Clock size={40} className="text-yellow-500"/>, label: 'Under Review', desc: 'Your application is being reviewed by your chapter chairperson.' },
    approved: { color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: <CheckCircle2 size={40} className="text-green-500"/>, label: 'Approved ✓', desc: 'Congratulations! Your application has been approved. You have been added as a candidate.' },
    rejected: { color: 'text-red-700',   bg: 'bg-red-50 border-red-200',        icon: <XCircle size={40} className="text-red-500"/>, label: 'Not Approved', desc: 'Your application was not approved by the chairperson.' },
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Back to Home</Link>
          <h1 className="text-white text-3xl font-black uppercase italic mt-4">Application Status</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">BWIAA 2026 Candidate Registration</p>
        </div>

        <div className="bg-white rounded-[3rem] p-8 shadow-2xl">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Application ID</label>
              <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="First 8 characters of your ID"
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
            <p className="text-center text-xs text-slate-400 font-bold">— or —</p>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Your Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email"
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
          </div>

          <button onClick={checkStatus} disabled={loading || (!appId.trim() && !email.trim())}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 mb-6">
            {loading ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>}
            Check Status
          </button>

          {searched && !result && (
            <div className="text-center py-6 text-slate-400">
              <p className="font-black uppercase text-sm">No application found.</p>
              <p className="text-xs font-bold mt-1">Double-check your Application ID or email.</p>
            </div>
          )}

          {result && (() => {
            const cfg = statusConfig[result.status] ?? statusConfig['pending'];
            return (
              <div className={`rounded-2xl border-2 p-6 ${cfg.bg}`}>
                <div className="flex flex-col items-center text-center mb-4">
                  {cfg.icon}
                  <p className={`font-black text-xl uppercase mt-3 ${cfg.color}`}>{cfg.label}</p>
                  <p className={`text-sm font-bold mt-2 ${cfg.color} opacity-80`}>{cfg.desc}</p>
                  {result.status === 'rejected' && result.rejection_reason && (
                    <div className="mt-3 p-3 bg-red-100 rounded-xl w-full">
                      <p className="text-xs font-black text-red-700 uppercase">Reason:</p>
                      <p className="text-xs text-red-600 font-bold mt-1">{result.rejection_reason}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2 pt-4 border-t border-current/10">
                  {[
                    ['Application ID', result.id.slice(0,8).toUpperCase()],
                    ['Name', result.full_name],
                    ['Position', result.position_name],
                    ['Chapter', result.chapter],
                    ['Applied', new Date(result.created_at).toLocaleDateString()],
                    ['Payment', result.payment_method === 'in_person' ? 'In Person' : 'Screenshot'],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className={`text-xs font-black uppercase tracking-widest opacity-60 ${cfg.color}`}>{l}</span>
                      <span className={`text-xs font-black ${cfg.color}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function StatusPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-red-600" size={40}/></div>}>
    <StatusContent/>
  </Suspense>;
}
