"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Loader2, Lock, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export const TIERS = [
  { name:'Platinum', minLRD:5000, points:5, color:'text-purple-700', bg:'bg-purple-50',  border:'border-purple-300',  pill:'bg-purple-600'  },
  { name:'Gold',     minLRD:2000, points:3, color:'text-amber-700',  bg:'bg-amber-50',   border:'border-amber-300',   pill:'bg-amber-500'   },
  { name:'Silver',   minLRD:500,  points:2, color:'text-slate-600',  bg:'bg-slate-100',  border:'border-slate-300',   pill:'bg-slate-500'   },
  { name:'Bronze',   minLRD:0,    points:1, color:'text-orange-700', bg:'bg-orange-50',  border:'border-orange-300',  pill:'bg-orange-500'  },
];

function getTier(totalLRD: number) {
  return TIERS.find(t => totalLRD >= t.minLRD) ?? TIERS[TIERS.length - 1];
}

function isActive(lastDate: string | null): boolean {
  if (!lastDate) return false;
  return (Date.now() - new Date(lastDate).getTime()) / 86400000 <= 90;
}

interface Investment {
  id: string; title: string; category: string; description: string|null;
  invested_amount: number; currency: string; return_amount: number|null;
  return_date: string|null; status: string; distributed_at: string|null;
  total_points_used: number|null; member_count_used: number|null;
  created_at: string;
}
interface MemberReturn {
  id: string; investment_id: string; member_id: string; member_name: string;
  share_amount: number; tier: string; points: number; currency: string;
  distributed_at: string;
  investments: { title: string; category: string }|null;
}

function useAuth() {
  const [ok, setOk]           = useState<boolean|null>(null);
  const [memberId, setId]     = useState('');
  const [memberName, setName] = useState('');
  const [tier, setTier]       = useState<typeof TIERS[0]|null>(null);
  const [totalLRD, setLRD]    = useState(0);
  const [active, setActive]   = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setOk(false); return; }
      const { data: mem } = await supabase.from('members').select('id,full_name,status')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email?.toLowerCase()}`).maybeSingle();
      const { data: adm } = await supabase.from('election_admins').select('email')
        .eq('email', user.email?.toLowerCase()??'').maybeSingle();
      const { data: ha  } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
      let heads = ['ezekielborbor17@gmail.com'];
      if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
      const isAdmin = !!adm || heads.includes(user.email?.toLowerCase()??'');
      if (mem) {
        setId(mem.id); setName(mem.full_name);
        const { data: dues } = await supabase.from('dues_payments')
          .select('amount,currency,created_at').eq('member_id', mem.id).eq('status','approved')
          .order('created_at',{ascending:false});
        if (dues && dues.length > 0) {
          const lrd = dues.reduce((s:number,d:any) => s+(d.currency==='LRD'?d.amount:d.amount*190),0);
          setLRD(lrd); setTier(getTier(lrd)); setActive(isActive(dues[0].created_at));
        } else { setTier(TIERS[TIERS.length-1]); }
      }
      setOk(isAdmin||(!!mem && mem.status==='approved'));
    });
  },[]);
  return { ok, memberId, memberName, tier, totalLRD, active };
}

const CAT: Record<string,string> = {
  'Stock Market':'bg-blue-600','Transportation':'bg-amber-600',
  'Entertainment':'bg-purple-600','Real Estate':'bg-green-600','Other':'bg-slate-600',
};

export default function InvestmentsPage() {
  const { ok, memberId, memberName, tier, totalLRD, active } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [myReturns, setMyReturns]     = useState<MemberReturn[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<string|null>(null);
  const [orgName, setOrgName]         = useState('BWIAA');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('election_settings').select('*');
      if (s) { const g=(k:string)=>s.find((r:any)=>r.key===k)?.value; if(g('org_name')) setOrgName(g('org_name')); }
      const { data: inv } = await supabase.from('investments').select('*').order('created_at',{ascending:false});
      if (inv) setInvestments(inv);
      setLoading(false);
    })();
  },[]);

  useEffect(() => {
    if (!memberId) return;
    supabase.from('member_returns').select('*,investments(title,category)')
      .eq('member_id',memberId).order('distributed_at',{ascending:false})
      .then(({data})=>{ if(data) setMyReturns(data); });
  },[memberId]);

  const totalEarned   = myReturns.reduce((s,r)=>s+r.share_amount,0);
  const totalInvested = investments.reduce((s,i)=>s+i.invested_amount,0);
  const totalReturned = investments.filter(i=>i.status==='returned').reduce((s,i)=>s+(i.return_amount??0),0);

  if (ok===null||loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-green-500" size={48}/></div>;

  if (!ok) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5"><Lock size={28} className="text-red-600"/></div>
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
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Chapter Growth Fund</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Member-Owned Cooperative · 70/30 Split</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-8 space-y-8">

        {/* My tier card */}
        {memberId && tier && (
          <div className={`rounded-3xl p-7 border-2 ${tier.border} ${tier.bg}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${tier.color} mb-1`}>Your Membership Tier</p>
                <p className="text-slate-900 font-black uppercase italic text-lg mb-2">{memberName}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`${tier.pill} text-white font-black text-sm uppercase px-4 py-1.5 rounded-full`}>{tier.name}</span>
                  <span className={`font-black text-sm ${tier.color}`}>{tier.points} point{tier.points>1?'s':''} per distribution</span>
                  <span className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${active?'bg-green-100 text-green-700 border-green-300':'bg-red-100 text-red-700 border-red-300'}`}>
                    {active ? '✓ Active' : '⏸ Paused'}
                  </span>
                </div>
                {!active && <p className="text-red-600 text-xs font-bold mt-2">No approved dues in 90 days. Pay dues to reactivate.</p>}
              </div>
              <div className="text-right">
                <p className={`text-[10px] font-black uppercase tracking-widest ${tier.color} mb-1`}>Total Earned</p>
                <p className="text-4xl font-black text-slate-900">${totalEarned.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                <p className="text-slate-500 text-xs font-bold">{myReturns.length} distribution{myReturns.length!==1?'s':''}</p>
              </div>
            </div>

            {/* Tier ladder */}
            <div className="mt-5 pt-5 border-t border-slate-200">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Tier Ladder — based on total dues paid</p>
              <div className="flex gap-2 flex-wrap">
                {[...TIERS].reverse().map(t => (
                  <div key={t.name} className={`flex-1 min-w-0 p-3 rounded-2xl border-2 transition-all ${tier.name===t.name?`${t.border} ${t.bg}`:'border-slate-200 bg-white/60'}`}>
                    <p className={`font-black text-xs uppercase ${tier.name===t.name?t.color:'text-slate-400'}`}>{t.name}</p>
                    <p className="font-black text-slate-800 text-sm">{t.points}pt</p>
                    <p className="text-[10px] text-slate-400 font-bold">{t.minLRD.toLocaleString()}+ LRD</p>
                    {tier.name===t.name && <p className={`text-[10px] font-black ${t.color} mt-1`}>← You are here</p>}
                  </div>
                ))}
              </div>
              <p className={`text-[10px] font-bold mt-2 ${tier.color}`}>Your cumulative dues: <strong>{totalLRD.toLocaleString()} LRD</strong></p>
            </div>

            {/* My return history */}
            {myReturns.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-200 space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Your Distribution History</p>
                {myReturns.map(r => {
                  const rt = TIERS.find(t=>t.name===r.tier)??TIERS[TIERS.length-1];
                  return (
                    <div key={r.id} className="flex items-center justify-between bg-white/60 rounded-2xl px-4 py-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 text-sm truncate">{r.investments?.title??'—'}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{r.investments?.category} · {new Date(r.distributed_at).toLocaleDateString()} · {r.tier} ({r.points}pt)</p>
                      </div>
                      <p className="text-green-700 font-black shrink-0">+${r.share_amount.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {label:'Total Invested',  value:`$${totalInvested.toLocaleString()}`, bg:'bg-blue-600'},
            {label:'Total Returned',  value:`$${totalReturned.toLocaleString()}`,  bg:'bg-green-600'},
            {label:'Active',          value:String(investments.filter(i=>i.status==='active').length), bg:'bg-amber-600'},
            {label:'My Earnings',     value:`$${totalEarned.toFixed(2)}`, bg:'bg-purple-600'},
          ].map(s=>(
            <div key={s.label} className={`${s.bg} text-white rounded-3xl p-5 text-center shadow-lg`}>
              <p className="text-2xl font-black">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
          <h3 className="text-white font-black uppercase italic text-lg mb-5">How the Chapter Growth Fund Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-4">
                <p className="text-green-400 font-black text-sm uppercase">70% — Member Distributions</p>
                <p className="text-white/60 text-xs font-bold mt-1 leading-relaxed">Split among active dues-paying members using weighted points. Higher tier = larger share.</p>
              </div>
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-4">
                <p className="text-blue-400 font-black text-sm uppercase">30% — Chapter Reserve</p>
                <p className="text-white/60 text-xs font-bold mt-1 leading-relaxed">Stays with the chapter for future growth, emergency support, projects and reinvestment.</p>
              </div>
              <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4">
                <p className="text-red-400 font-black text-sm uppercase">Inactive = Paused</p>
                <p className="text-white/60 text-xs font-bold mt-1 leading-relaxed">No approved dues in 90 days means you're paused. Pay dues to reactivate immediately.</p>
              </div>
            </div>
            <div>
              <p className="text-white/50 text-xs font-black uppercase tracking-widest mb-3">Reward Tiers</p>
              <div className="space-y-2 mb-4">
                {TIERS.map(t=>(
                  <div key={t.name} className={`flex items-center justify-between p-3 rounded-2xl border-2 ${t.border} ${t.bg}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 ${t.pill} rounded-xl flex items-center justify-center`}>
                        <span className="text-white font-black text-xs">{t.points}pt</span>
                      </div>
                      <div>
                        <p className={`font-black text-sm ${t.color}`}>{t.name}</p>
                        <p className="text-slate-500 text-[10px] font-bold">{t.minLRD.toLocaleString()}+ LRD total dues</p>
                      </div>
                    </div>
                    <p className={`font-black text-xs ${t.color}`}>{t.points}× share</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-800 rounded-2xl p-4">
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Example: $700 pool, 3 members</p>
                <p className="text-white text-xs font-bold leading-relaxed">
                  Bronze(1) + Silver(2) + Platinum(5) = <strong>8 pts</strong><br/>
                  $700 ÷ 8 = <strong className="text-green-400">$87.50/pt</strong><br/>
                  Bronze→$87.50 · Silver→$175 · Platinum→<strong className="text-green-400">$437.50</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Investment list */}
        <div>
          <h3 className="text-white font-black uppercase italic text-xl mb-5">All Investments</h3>
          {investments.length===0 ? (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-16 text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-white/20"/>
              <p className="text-white/30 font-black uppercase tracking-widest text-sm">No investments recorded yet</p>
            </div>
          ) : investments.map(inv => {
            const isOpen   = expanded===inv.id;
            const roi      = inv.return_amount&&inv.invested_amount ? ((inv.return_amount-inv.invested_amount)/inv.invested_amount*100).toFixed(1) : null;
            const myReturn = myReturns.find(r=>r.investment_id===inv.id);
            return (
              <div key={inv.id} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden mb-3 hover:border-white/20 transition-all">
                <button onClick={()=>setExpanded(isOpen?null:inv.id)} className="w-full flex items-start gap-4 p-6 text-left">
                  <span className={`${CAT[inv.category]??'bg-slate-600'} text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl tracking-widest shrink-0 mt-0.5`}>{inv.category}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black uppercase">{inv.title}</p>
                    {inv.description&&<p className="text-white/40 text-xs font-bold mt-1">{inv.description}</p>}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs font-bold text-white/40">
                      <span>Capital: <span className="text-white">${inv.invested_amount.toLocaleString()}</span></span>
                      {inv.return_amount&&<span>Return: <span className="text-green-400">${inv.return_amount.toLocaleString()}</span></span>}
                      {roi&&<span className="flex items-center gap-0.5 text-green-400"><ArrowUpRight size={11}/>{roi}% ROI</span>}
                      {myReturn&&<span className="text-green-400 font-black">My share: ${myReturn.share_amount.toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <span className={`block text-[10px] font-black uppercase px-3 py-1 rounded-full ${inv.status==='returned'?'bg-green-900/50 text-green-400':inv.status==='active'?'bg-blue-900/50 text-blue-400':'bg-amber-900/50 text-amber-400'}`}>{inv.status}</span>
                    <div>{isOpen?<ChevronUp size={14} className="text-white/30 ml-auto"/>:<ChevronDown size={14} className="text-white/30 ml-auto"/>}</div>
                  </div>
                </button>
                {isOpen&&(
                  <div className="border-t border-white/10 p-6 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ['Capital In',   `$${inv.invested_amount.toLocaleString()}`],
                        ['Total Return', inv.return_amount?`$${inv.return_amount.toLocaleString()}`:'Pending'],
                        ['Members',      inv.member_count_used?String(inv.member_count_used):'—'],
                        ['Total Points', inv.total_points_used?String(inv.total_points_used):'—'],
                      ].map(([l,v])=>(
                        <div key={l} className="bg-white/5 rounded-2xl p-4">
                          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">{l}</p>
                          <p className="text-white font-black">{v}</p>
                        </div>
                      ))}
                    </div>
                    {myReturn&&(
                      <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-4 flex justify-between items-center">
                        <div>
                          <p className="text-green-400 font-black text-sm">Your Distribution</p>
                          <p className="text-white/50 text-xs font-bold">{myReturn.tier} · {myReturn.points}pt</p>
                        </div>
                        <p className="text-green-400 font-black text-2xl">+${myReturn.share_amount.toFixed(2)}</p>
                      </div>
                    )}
                    {inv.distributed_at&&(
                      <p className="text-white/40 text-xs font-bold">
                        Distributed: {new Date(inv.distributed_at).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-white/20 text-xs font-bold uppercase tracking-widest text-center pb-4">
          {orgName} Chapter Growth Fund · 70% weighted member distributions · 30% chapter reserve · Inactive members paused
        </p>
      </div>
    </div>
  );
}
