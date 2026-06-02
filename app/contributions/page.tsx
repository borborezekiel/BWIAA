"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Heart, Upload, CheckCircle2, Loader2, AlertCircle,
  X, ChevronDown, ChevronUp, Lock, TrendingUp, Info
} from 'lucide-react';
import Link from 'next/link';

interface Contribution {
  id: string; member_id: string; member_name: string; chapter: string;
  amount: number; currency: string; original_amount: number;
  original_currency: string; converted_amount: number; exchange_rate: number;
  reason: string; payment_method: string; screenshot_url: string | null;
  status: string; created_at: string; notes: string | null;
  approved_by: string | null; approved_at: string | null;
}

export default function ContributionsPage() {
  const [member, setMember]           = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [tab, setTab]                 = useState<'view' | 'submit'>('view');
  const [submitted, setSubmitted]     = useState(false);

  // Settings from DB (SSS)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ LRD: 1, USD: 184 });
  const [baseCurrency, setBaseCurrency]   = useState('LRD');
  const [currencies, setCurrencies]       = useState<string[]>(['LRD', 'USD']);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Mobile Money', 'Bank Transfer', 'Cash / In Person']);
  const [label, setLabel]                 = useState('Contributions');
  const [orgName, setOrgName]             = useState('BWIAA');

  // Form
  const [amount, setAmount]           = useState('');
  const [currency, setCurrency]       = useState('LRD');
  const [convertedAmount, setConvertedAmount] = useState(0);
  const [reason, setReason]           = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money');
  const [notes, setNotes]             = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('contributions_label')) setLabel(get('contributions_label'));
        if (get('base_currency')) setBaseCurrency(get('base_currency'));
        if (get('exchange_rates')) {
          try {
            const rates = JSON.parse(get('exchange_rates'));
            setExchangeRates(rates);
          } catch {}
        }
        if (get('supported_currencies')) {
          try { setCurrencies(JSON.parse(get('supported_currencies'))); } catch {}
        }
        if (get('payment_methods')) {
          try {
            const methods = JSON.parse(get('payment_methods'));
            setPaymentMethods(methods);
            setPaymentMethod(methods[0]);
          } catch {}
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (m1) mem = m1;
      else {
        const { data: m2 } = await supabase.from('members').select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) mem = m2;
      }
      if (mem?.status === 'approved') setMember(mem);

      const { data: contribs } = await supabase.from('contributions')
        .select('*').order('created_at', { ascending: false });
      if (contribs) setContributions(contribs);
      setLoading(false);
    })();
  }, []);

  // Auto-convert when amount or currency changes
  useEffect(() => {
    const num = parseFloat(amount);
    if (!isNaN(num) && num > 0) {
      const rate = exchangeRates[currency] ?? 1;
      setConvertedAmount(Math.round(num * rate * 100) / 100);
    } else {
      setConvertedAmount(0);
    }
  }, [amount, currency, exchangeRates]);

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new window.Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200; let { width, height } = img;
        if (width > MAX || height > MAX) { if (width > height) { height = Math.round(height * MAX / width); width = MAX; } else { width = Math.round(width * MAX / height); height = MAX; } }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d')!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(new File([b], 'proof.jpg', { type: 'image/jpeg' })) : reject(), 'image/jpeg', 0.88);
      }; img.onerror = reject; img.src = url;
    });
  }

  const needsScreenshot = paymentMethod !== 'Cash / In Person';

  async function submit() {
    if (!member) return;
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount.'); return; }
    if (!reason.trim()) { setError('Please describe the reason for this contribution.'); return; }
    if (needsScreenshot && !screenshotFile) { setError('Please upload a payment screenshot for this payment method.'); return; }
    setSubmitting(true); setError('');
    try {
      let screenshot_url: string | null = null;
      if (screenshotFile) {
        const fn = `contributions/${member.id}_${Date.now()}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('payment-screenshots').upload(fn, screenshotFile, { upsert: true });
        if (ue) throw new Error(ue.message);
        screenshot_url = supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }
      const rate = exchangeRates[currency] ?? 1;
      const { data, error: ie } = await supabase.from('contributions').insert([{
        member_id: member.id,
        member_name: member.full_name,
        chapter: member.chapter,
        amount: convertedAmount,         // stored in base currency (LRD)
        currency: baseCurrency,          // always stored as base currency
        original_amount: parseFloat(amount),
        original_currency: currency,     // what they actually paid in
        converted_amount: convertedAmount,
        exchange_rate: rate,
        reason: reason.trim(),
        payment_method: paymentMethod,
        screenshot_url,
        notes: notes.trim() || null,
        status: 'pending',
      }]).select().single();
      if (ie) throw new Error(ie.message);
      setContributions(prev => [data, ...prev]);
      setSubmitted(true);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  const totalApproved = contributions
    .filter(c => c.status === 'approved')
    .reduce((s, c) => s + (c.converted_amount ?? c.amount), 0);

  const myContributions = contributions.filter(c => c.member_id === member?.id);

  const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
    pending:  { label: 'Pending Approval', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
    approved: { label: 'Approved',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
    rejected: { label: 'Rejected',         color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl"><Heart size={18} className="text-white" /></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} {label}</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Member-to-Member Support · Multi-Currency</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: `Total ${label} (${baseCurrency})`, value: totalApproved.toLocaleString(),  color: 'bg-blue-600' },
            { label: 'Approved Records',                  value: contributions.filter(c=>c.status==='approved').length, color: 'bg-green-600' },
            { label: 'My Contributions',                  value: myContributions.length,          color: 'bg-slate-700' },
          ].map(s => (
            <div key={s.label} className={`${s.color} text-white rounded-3xl p-5 text-center shadow`}>
              <p className="text-2xl font-black">{s.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm">
          {[
            { id: 'view', label: `📋 All ${label}` },
            ...(member ? [{ id: 'submit', label: `💙 Submit ${label}` }] : []),
          ].map((t: any) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SUBMIT TAB ── */}
        {tab === 'submit' && member && (
          submitted ? (
            <div className="bg-white rounded-[2rem] p-10 text-center shadow-sm">
              <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Contribution Submitted!</h2>
              <p className="text-slate-500 font-bold text-sm mb-2">Pending review by your chapter administrator.</p>
              {convertedAmount > 0 && currency !== baseCurrency && (
                <p className="text-blue-600 font-black text-sm mb-6">
                  {parseFloat(amount).toLocaleString()} {currency} = {convertedAmount.toLocaleString()} {baseCurrency}
                  <span className="text-slate-400 font-bold text-xs ml-2">(rate: 1 {currency} = {exchangeRates[currency] ?? 1} {baseCurrency})</span>
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setSubmitted(false); setAmount(''); setReason(''); setScreenshotFile(null); setScreenshotPreview(null); setNotes(''); }}
                  className="flex-1 bg-blue-600 text-white font-black uppercase py-4 rounded-2xl text-sm">Submit Another</button>
                <button onClick={() => setTab('view')} className="flex-1 bg-slate-100 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm">View All</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] p-8 shadow-sm space-y-6">
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Submit a Contribution</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Pending admin approval before it appears in records</p>
              </div>

              {/* How it works */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-blue-800 uppercase tracking-widest mb-1">How Contributions Work</p>
                  <p className="text-xs text-blue-700 font-bold leading-relaxed">
                    Contributions are member-to-member solidarity payments. They are separate from organizational funds.
                    If you pay in USD or another currency, the system automatically converts to {baseCurrency} at the current exchange rate for record-keeping.
                    The original currency and amount are always preserved.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Amount + Currency */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount *</label>
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00"
                    className="w-full border-2 border-slate-200 focus:border-blue-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 text-xl" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Currency *</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full border-2 border-slate-200 focus:border-blue-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Conversion display */}
                {currency !== baseCurrency && convertedAmount > 0 && (
                  <div className="sm:col-span-2 bg-green-50 border-2 border-green-200 rounded-2xl p-4">
                    <p className="text-xs font-black text-green-700 uppercase tracking-widest mb-1">🔄 Currency Conversion</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-black text-green-800 text-lg">{parseFloat(amount || '0').toLocaleString()} {currency}</span>
                      <span className="text-green-600 font-bold">×</span>
                      <span className="font-bold text-green-700 text-sm">{exchangeRates[currency] ?? 1} (rate)</span>
                      <span className="text-green-600 font-bold">=</span>
                      <span className="font-black text-green-900 text-xl">{convertedAmount.toLocaleString()} {baseCurrency}</span>
                    </div>
                    <p className="text-[10px] text-green-600 font-bold mt-1">Both original and converted amounts are stored. Exchange rates are set by the administrator.</p>
                  </div>
                )}

                {/* Payment method */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Payment Method *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {paymentMethods.map(m => (
                      <button key={m} onClick={() => setPaymentMethod(m)}
                        className={`p-3 rounded-2xl border-2 text-xs font-black uppercase tracking-widest transition-all ${paymentMethod === m ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {m === 'Cash / In Person' ? '💵 ' : m.includes('Screenshot') ? '📸 ' : m.includes('Mobile') ? '📱 ' : '🏦 '}{m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Reason / Purpose *</label>
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Welfare support for Brother X, Event contribution..."
                    className="w-full border-2 border-slate-200 focus:border-blue-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800" />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Additional Notes</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional information"
                    className="w-full border-2 border-slate-200 focus:border-blue-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800" />
                </div>
              </div>

              {/* Screenshot — only if not cash */}
              {needsScreenshot ? (
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                    Payment Screenshot * <span className="text-red-500">(required for {paymentMethod})</span>
                  </label>
                  {screenshotPreview ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs">
                      <img src={screenshotPreview} className="w-full max-h-40 object-cover" />
                      <button onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }} className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14} /></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center h-24 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl transition-all">
                      <Upload size={20} className="text-slate-400 mb-1" />
                      <p className="text-xs font-bold text-slate-500">Upload payment screenshot</p>
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        const c = await compressImage(f); setScreenshotFile(c); setScreenshotPreview(URL.createObjectURL(c));
                      }} />
                    </label>
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  <p className="text-xs text-green-700 font-bold">Cash / In Person — no screenshot required. An officer will verify and approve this payment manually.</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm font-bold">{error}</p>
                </div>
              )}

              <button onClick={submit} disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                {submitting ? <><Loader2 size={16} className="animate-spin" />Submitting...</> : <><CheckCircle2 size={16} />Submit Contribution</>}
              </button>
            </div>
          )
        )}

        {/* ── VIEW TAB ── */}
        {tab === 'view' && (
          <div className="space-y-4">
            {contributions.length === 0 ? (
              <div className="bg-white rounded-[2rem] p-16 text-center shadow-sm">
                <Heart size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No contributions yet</p>
              </div>
            ) : contributions.map(c => {
              const cfg = STATUS_CFG[c.status] ?? STATUS_CFG['pending'];
              const isOpen = expanded === c.id;
              const showConversion = c.original_currency && c.original_currency !== baseCurrency;
              return (
                <div key={c.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">
                  <button onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-all">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-black text-slate-800">{c.member_name}</p>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-bold">{c.reason}</p>
                      <p className="text-[10px] text-slate-300 font-bold mt-0.5">{c.chapter} · {c.payment_method} · {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {/* Show original if different from base */}
                      {showConversion ? (
                        <>
                          <p className="font-black text-blue-600 text-lg">{(c.original_amount ?? c.amount).toLocaleString()} {c.original_currency}</p>
                          <p className="text-xs text-slate-400 font-bold">= {(c.converted_amount ?? c.amount).toLocaleString()} {baseCurrency}</p>
                        </>
                      ) : (
                        <p className="font-black text-slate-800 text-lg">{c.amount.toLocaleString()} {c.currency}</p>
                      )}
                    </div>
                    {isOpen ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-3">
                      {showConversion && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1">💱 Currency Record</p>
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-800 flex-wrap">
                            <span>Paid: {(c.original_amount ?? c.amount).toLocaleString()} {c.original_currency}</span>
                            <span className="text-blue-400">→</span>
                            <span>Rate: 1 {c.original_currency} = {c.exchange_rate ?? '?'} {baseCurrency}</span>
                            <span className="text-blue-400">→</span>
                            <span>Converted: {(c.converted_amount ?? c.amount).toLocaleString()} {baseCurrency}</span>
                          </div>
                        </div>
                      )}
                      {c.notes && <p className="text-xs text-slate-500 font-bold italic">"{c.notes}"</p>}
                      {c.approved_by && <p className="text-xs text-green-600 font-bold">✓ Approved by {c.approved_by}</p>}
                      {c.screenshot_url && (
                        <img src={c.screenshot_url} className="rounded-xl max-h-32 cursor-pointer border border-slate-200"
                          alt="Payment proof" onClick={() => window.open(c.screenshot_url!, '_blank')} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
