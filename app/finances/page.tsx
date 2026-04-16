"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, TrendingUp, Users, ChevronDown, ChevronUp, Search, DollarSign } from 'lucide-react';
import Link from 'next/link';

interface DuesPayment {
  id: string; member_name: string; chapter: string;
  amount: number; currency: string; period: string;
  payment_method: string; status: string; created_at: string;
}

export default function FinancesPage() {
  const [payments, setPayments]         = useState<DuesPayment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [orgName, setOrgName]           = useState('BWIAA');
  const [symbol, setSymbol]             = useState('$');
  const [currency, setCurrency]         = useState('USD');
  const [chapters, setChapters]         = useState<string[]>([]);
  const [chapterFilter, setChapterFilter] = useState('All');
  const [periodFilter, setPeriodFilter] = useState('All');
  const [search, setSearch]             = useState('');
  const [expandedChapter, setExpandedChapter] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name'))        setOrgName(get('org_name'));
        if (get('currency'))        setCurrency(get('currency'));
        if (get('currency_symbol')) setSymbol(get('currency_symbol'));
        if (get('chapters'))        { try { setChapters(JSON.parse(get('chapters'))); } catch {} }
      }
      // Only show approved payments for transparency
      const { data } = await supabase.from('dues_payments').select('*')
        .eq('status', 'approved').order('created_at', { ascending: false });
      if (data) setPayments(data);
      setLoading(false);
    })();
  }, []);

  const periods = ['All', ...Array.from(new Set(payments.map(p => p.period))).sort()];
  const allChapters = ['All', ...chapters];

  const filtered = payments.filter(p => {
    const matchChapter = chapterFilter === 'All' || p.chapter === chapterFilter;
    const matchPeriod  = periodFilter  === 'All' || p.period === periodFilter;
    const matchSearch  = !search || p.member_name.toLowerCase().includes(search.toLowerCase());
    return matchChapter && matchPeriod && matchSearch;
  });

  const totalCollected = filtered.reduce((sum, p) => sum + p.amount, 0);

  // Group by chapter
  const byChapter = chapters.reduce<Record<string, DuesPayment[]>>((acc, ch) => {
    acc[ch] = filtered.filter(p => p.chapter === ch);
    return acc;
  }, {});

  const CURRENT_YEAR = new Date().getFullYear();

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-6 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><DollarSign size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Financial Transparency</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Official Dues & Payments Record — {CURRENT_YEAR}</p>
            </div>
          </div>
          <Link href="/members" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all">← Members</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-8 space-y-8">

        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
            <p className="text-3xl font-black text-red-500">{symbol}{totalCollected.toLocaleString()}</p>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Total Collected</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
            <p className="text-3xl font-black text-white">{filtered.length}</p>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Payments</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
            <p className="text-3xl font-black text-white">{chapters.filter(ch => byChapter[ch]?.length > 0).length}</p>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Active Chapters</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
            <p className="text-3xl font-black text-white">
              {filtered.length > 0 ? symbol + Math.round(totalCollected / filtered.length).toLocaleString() : symbol + '0'}
            </p>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Avg Payment</p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by member name..."
              className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 focus:border-red-600 rounded-2xl font-bold outline-none text-sm text-white placeholder-white/30"/>
          </div>
          <select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-white rounded-2xl px-5 py-4 font-bold outline-none text-sm focus:border-red-600">
            {allChapters.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
          </select>
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-white rounded-2xl px-5 py-4 font-bold outline-none text-sm focus:border-red-600">
            {periods.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
          </select>
        </div>

        {/* Chapter breakdown */}
        <div className="space-y-4">
          <h2 className="text-white font-black uppercase italic text-xl">By Chapter</h2>
          {chapters.map(ch => {
            const chPayments = byChapter[ch] ?? [];
            const chTotal = chPayments.reduce((s, p) => s + p.amount, 0);
            const isOpen = expandedChapter === ch;
            if (chPayments.length === 0 && chapterFilter !== 'All' && chapterFilter !== ch) return null;

            return (
              <div key={ch} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                <button onClick={() => setExpandedChapter(isOpen ? null : ch)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-white/5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"/>
                    <div>
                      <p className="text-white font-black uppercase">{ch}</p>
                      <p className="text-white/40 text-xs font-bold">{chPayments.length} payment{chPayments.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-white font-black text-xl">{symbol}{chTotal.toLocaleString()}</p>
                      <p className="text-white/40 text-[10px] font-bold uppercase">{currency}</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-white/40"/> : <ChevronDown size={16} className="text-white/40"/>}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-white/10">
                    {chPayments.length === 0 ? (
                      <p className="text-white/30 font-bold text-sm text-center py-8">No approved payments for this chapter yet.</p>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {chPayments.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-6 py-4">
                            <div>
                              <p className="text-white font-black text-sm">{p.member_name}</p>
                              <p className="text-white/40 text-xs font-bold">{p.period} · {new Date(p.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-white font-black">{symbol}{p.amount.toLocaleString()}</p>
                              <p className="text-[10px] text-white/30 font-bold uppercase">{p.payment_method === 'in_person' ? 'In Person' : 'Transfer'}</p>
                            </div>
                          </div>
                        ))}
                        {/* Chapter subtotal */}
                        <div className="flex items-center justify-between px-6 py-4 bg-white/5">
                          <p className="text-white/60 font-black text-xs uppercase tracking-widest">Chapter Total</p>
                          <p className="text-red-400 font-black text-lg">{symbol}{chTotal.toLocaleString()} {currency}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* All payments table */}
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-white font-black uppercase italic text-lg">All Approved Payments</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
              Showing {filtered.length} records · Total: {symbol}{totalCollected.toLocaleString()} {currency}
            </p>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <TrendingUp size={48} className="mx-auto mb-4 text-white/10"/>
              <p className="text-white/30 font-black uppercase tracking-widest text-sm">No approved payments match your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {/* Header row */}
              <div className="grid grid-cols-4 md:grid-cols-6 gap-4 px-6 py-3 bg-white/5">
                {['Member','Chapter','Period','Amount','Method','Date'].map(h => (
                  <p key={h} className="text-[10px] font-black text-white/30 uppercase tracking-widest hidden md:block first:block">{h}</p>
                ))}
              </div>
              {filtered.map(p => (
                <div key={p.id} className="grid grid-cols-1 md:grid-cols-6 gap-1 md:gap-4 px-6 py-4 hover:bg-white/5 transition-all">
                  <p className="text-white font-black text-sm">{p.member_name}</p>
                  <p className="text-white/50 text-xs font-bold hidden md:block">{p.chapter}</p>
                  <p className="text-white/50 text-xs font-bold hidden md:block">{p.period}</p>
                  <p className="text-red-400 font-black">{symbol}{p.amount.toLocaleString()}</p>
                  <p className="text-white/30 text-xs font-bold hidden md:block capitalize">{p.payment_method === 'in_person' ? 'In Person' : 'Transfer'}</p>
                  <p className="text-white/30 text-xs font-bold hidden md:block">{new Date(p.created_at).toLocaleDateString()}</p>
                  {/* Mobile only */}
                  <p className="text-white/40 text-xs font-bold md:hidden">{p.chapter} · {p.period} · {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
              ))}
              {/* Grand total */}
              <div className="flex items-center justify-between px-6 py-5 bg-slate-900">
                <p className="text-white font-black uppercase tracking-widest text-sm">Grand Total — {filtered.length} payments</p>
                <p className="text-red-400 font-black text-2xl">{symbol}{totalCollected.toLocaleString()} {currency}</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-white/20 text-xs font-bold uppercase tracking-widest text-center pb-4">
          {orgName} Financial Transparency Report · Only approved payments are shown · All amounts in {currency}
        </p>
      </div>
    </div>
  );
}
