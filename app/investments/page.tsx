"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Loader2, Lock, PieChart, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface Investment {
  id: string; title: string; category: string; description: string|null;
  invested_amount: number; currency: string; return_amount: number|null;
  return_date: string|null; status: 'active'|'returned'|'pending';
  member_share_each: number|null; eligible_members: number|null;
  distributed_at: string|null; created_by: string; created_at: string;
}
interface MemberReturn {
  id: string; investment_id: string; member_id: string; member_name: string;
  share_amount: number; currency: string; distributed_at: string;
  investments: { title: string; category: string }|null;
}

function useAuth() {
  const [ok, setOk]             = useState<boolean|null>(null);
  const [memberId, setMemberId] = useState('');
  const [memberName, setMemberName] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setOk(false); return; }
      const { data: mem } = await supabase.from('members').select('id,full_name,status')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email?.toLowerCase()}`).maybeSingle();
      const { data: adm } = await supabase.from('election_admins').select('email')
        .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
      const { data: ha } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
      let heads = ['ezekielborbor17@gmail.com'];
      if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
      const isAdmin = !!adm || heads.includes(user.email?.toLowerCase() ?? '');
      if (mem) { setMemberId(mem.id); setMemberName(mem.full_name); }
      setOk(isAdmin || (!!mem && mem.status === 'approved'));
    });
  }, []);
  return { ok, memberId, memberName };
}

const CAT_COLORS: Record<string,string> = {
  'Stock Market':'bg-blue-600','Transportation':'bg-amber-600',
  'Entertainment':'bg-purple-600','Real Estate':'bg-green-600','Other':'bg-slate-600',
};

export default function InvestmentsPage() {
  const { ok: authOk, memberId, memberName } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [myReturns, setMyReturns]     = useState<MemberReturn[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<string|null>(null);
  const [orgName, setOrgName]         = useState('BWIAA');

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }
      const { data: inv } = await supabase.from('investments').select('*')
        .order('created_at', { ascending: false });
      if (inv) setInvestments(inv);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!memberId) return;
    supabase.from('member_returns')
      .select('*, investments(title,category)')
      .eq('member_id', memberId)
      .order('distributed_at', { ascending: false })
      .then(({ data }) => { if (data) setMyReturns(data); });
  }, [memberId]);

  const totalInvested   = investments.reduce((s, i) => s + i.invested_amount, 0);
  const totalReturned   = investments.filter(i => i.status === 'returned').reduce((s, i) => s + (i.return_amount ?? 0), 0);
  const totalMyEarnings = myReturns.reduce((s, r) => s + r.share_amount, 0);
  const activeCount     = investments.filter(i => i.status === 'active').length;

  if (authOk === null || loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-green-500" size={48}/>
    </div>
  );

  if (!authOk) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-red-600"/>
        </div>
        <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Members Only</h2>
        <p className="text-slate-500 font-bold text-sm mb-8">Investment records are only visible to active BWIAA members.</p>
        <Link href="/members/login" className="block w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm hover:bg-red-700 transition-all mb-3">Sign In</Link>
        <Link href="/members/register" className="block w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase text-sm hover:bg-slate-200 transition-all">Register</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-xl"><TrendingUp size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Investment Portfolio</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Member-Owned Cooperative Fund</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-8 space-y-8">

        {/* Personal earnings card */}
        {memberId && (
          <div className="bg-gradient-to-br from-green-900/60 to-emerald-950 border border-green-500/30 rounded-3xl p-7">
            <p className="text-green-400 text-[10px] font-black uppercase tracking-widest mb-1">Your Cumulative Earnings</p>
            <p className="text-white/60 text-xs font-bold mb-2">{memberName}</p>
            <p className="text-6xl font-black text-green-400 mb-1">${totalMyEarnings.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
            <p className="text-green-300/50 text-xs font-bold">Across {myReturns.length} distribution{myReturns.length !== 1 ? 's' : ''}</p>
            {myReturns.length > 0 && (
              <div className="mt-5 space-y-2">
                {myReturns.slice(0,4).map(r => (
                  <div key={r.id} className="flex justify-between items-center bg-white/5 rounded-2xl px-5 py-3">
                    <div>
                      <p className="text-white text-xs font-black">{r.investments?.title ?? '—'}</p>
                      <p className="text-white/30 text-[10px] font-bold">{r.investments?.category} · {new Date(r.distributed_at).toLocaleDateString()}</p>
                    </div>
                    <p className="text-green-400 font-black text-sm">+${r.share_amount.toLocaleString(undefined,{minimumFractionDigits:2})}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Portfolio stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:'Total Invested',   value:`$${totalInvested.toLocaleString()}`,  bg:'bg-blue-600' },
            { label:'Total Returned',   value:`$${totalReturned.toLocaleString()}`,   bg:'bg-green-600' },
            { label:'Active Positions', value:String(activeCount),                    bg:'bg-amber-600' },
            { label:'All Investments',  value:String(investments.length),             bg:'bg-slate-700' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} text-white rounded-3xl p-5 text-center shadow-lg`}>
              <p className="text-2xl font-black">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-white font-black uppercase italic text-lg mb-5 flex items-center gap-2">
            <PieChart size={16} className="text-green-400"/> How the Cooperative Fund Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { pct:'70%', color:'border-green-500 bg-green-900/20', label:'Distributed to Members',
                desc:'Split equally among all members who have paid dues when a return comes in.' },
              { pct:'30%', color:'border-blue-500 bg-blue-900/20', label:'Reinvested to Fund',
                desc:"Goes back on top of the organisation's capital to grow the next investment cycle." },
              { pct:'100%', color:'border-amber-500 bg-amber-900/20', label:'Fully Transparent',
                desc:'Every investment, return and distribution is visible to all active members.' },
            ].map(c => (
              <div key={c.pct} className={`border-2 ${c.color} rounded-2xl p-5`}>
                <p className="text-4xl font-black text-white mb-1">{c.pct}</p>
                <p className="text-white font-black text-sm uppercase tracking-widest mb-2">{c.label}</p>
                <p className="text-white/50 text-xs font-bold leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Investments list */}
        <div>
          <h3 className="text-white font-black uppercase italic text-xl mb-5">All Investments</h3>
          {investments.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-16 text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-white/20"/>
              <p className="text-white/30 font-black uppercase tracking-widest text-sm">No investments recorded yet</p>
              <p className="text-white/20 text-xs font-bold mt-2">The administrator will post investments as they are made</p>
            </div>
          ) : investments.map(inv => {
            const isOpen = expanded === inv.id;
            const roi = inv.return_amount && inv.invested_amount
              ? ((inv.return_amount - inv.invested_amount) / inv.invested_amount * 100).toFixed(1) : null;
            const catBg = CAT_COLORS[inv.category] ?? CAT_COLORS['Other'];
            return (
              <div key={inv.id} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden mb-3 hover:border-white/20 transition-all">
                <button onClick={() => setExpanded(isOpen ? null : inv.id)}
                  className="w-full flex items-start gap-4 p-6 text-left">
                  <span className={`${catBg} text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl tracking-widest shrink-0 mt-0.5`}>
                    {inv.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black uppercase">{inv.title}</p>
                    {inv.description && <p className="text-white/40 text-xs font-bold mt-1">{inv.description}</p>}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs font-bold text-white/40">
                      <span>Invested: <span className="text-white">${inv.invested_amount.toLocaleString()}</span></span>
                      {inv.return_amount && <span>Return: <span className="text-green-400">${inv.return_amount.toLocaleString()}</span></span>}
                      {roi && <span className="flex items-center gap-0.5 text-green-400"><ArrowUpRight size={11}/>{roi}% ROI</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                      inv.status==='returned'?'bg-green-900/50 text-green-400':
                      inv.status==='active'  ?'bg-blue-900/50 text-blue-400':
                      'bg-amber-900/50 text-amber-400'}`}>
                      {inv.status}
                    </span>
                    <div className="mt-2">{isOpen?<ChevronUp size={14} className="text-white/30 ml-auto"/>:<ChevronDown size={14} className="text-white/30 ml-auto"/>}</div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-white/10 p-6 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ['Capital In',      `$${inv.invested_amount.toLocaleString()}`],
                        ['Total Return',    inv.return_amount?`$${inv.return_amount.toLocaleString()}`:'Pending'],
                        ['Your Share',      inv.member_share_each?`$${inv.member_share_each.toFixed(2)}`:'—'],
                        ['Members Paid',    inv.eligible_members?String(inv.eligible_members):'—'],
                      ].map(([l,v]) => (
                        <div key={l} className="bg-white/5 rounded-2xl p-4">
                          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">{l}</p>
                          <p className="text-white font-black">{v}</p>
                        </div>
                      ))}
                    </div>
                    {inv.distributed_at && (
                      <p className="text-white/40 text-xs font-bold">
                        Member shares distributed: {new Date(inv.distributed_at).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-white/20 text-xs font-bold uppercase tracking-widest text-center pb-4">
          {orgName} Cooperative Fund · 70% member distributions · 30% reinvested · All figures in USD unless stated
        </p>
      </div>
    </div>
  );
}
