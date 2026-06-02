"use client";

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Receipt, Upload, CheckCircle2, Loader2, AlertCircle,
  X, ChevronDown, ChevronUp, Lock, TrendingDown,
  TrendingUp, DollarSign, Clock, AlertTriangle, Info,
  ArrowRight, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = ['Administrative','Events','Welfare','Travel','Maintenance','Equipment','Communication','Catering','Security','Other'];

const WORKFLOW_STEPS = [
  { step: 1, label: 'Submit',  desc: 'Officer submits expense with full details before spending', icon: <Receipt size={18}/>, color: 'bg-blue-600' },
  { step: 2, label: 'Review',  desc: 'President or Head Admin reviews and approves or rejects',  icon: <ShieldCheck size={18}/>, color: 'bg-yellow-500' },
  { step: 3, label: 'Spend',   desc: 'Money is released ONLY after approval — never before',    icon: <CheckCircle2 size={18}/>, color: 'bg-green-600' },
  { step: 4, label: 'Report',  desc: 'Approved expense deducted from balance with full audit trail', icon: <TrendingDown size={18}/>, color: 'bg-red-600' },
];

export default function ExpensesPage() {
  const [member, setMember]         = useState<any>(null);
  const [authOk, setAuthOk]         = useState<boolean|null>(null);
  const [canSubmit, setCanSubmit]   = useState(false);
  const [expenses, setExpenses]     = useState<any[]>([]);
  const [income, setIncome]         = useState<{label:string;amount:number;currency:string}[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<'ledger'|'submit'|'workflow'>('ledger');
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [orgName, setOrgName]       = useState('BWIAA');
  const [baseCurrency, setBaseCurrency] = useState('LRD');
  const [exchangeRates, setExchangeRates] = useState<Record<string,number>>({LRD:1,USD:184});
  const [currencies, setCurrencies] = useState<string[]>(['LRD','USD']);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Mobile Money','Bank Transfer','Cash / In Person']);
  const [events, setEvents]         = useState<any[]>([]);

  // Form
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]     = useState('Administrative');
  const [amount, setAmount]         = useState('');
  const [currency, setCurrency]     = useState('LRD');
  const [convertedAmount, setConvertedAmount] = useState(0);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0,10));
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money');
  const [linkedEvent, setLinkedEvent] = useState('');
  const [committee, setCommittee]   = useState('');
  const [notes, setNotes]           = useState('');
  const [receiptFile, setReceiptFile]   = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('base_currency')) setBaseCurrency(get('base_currency'));
        if (get('exchange_rates')) { try { setExchangeRates(JSON.parse(get('exchange_rates'))); } catch {} }
        if (get('supported_currencies')) { try { setCurrencies(JSON.parse(get('supported_currencies'))); } catch {} }
        if (get('payment_methods')) { try { const m=JSON.parse(get('payment_methods')); setPaymentMethods(m); setPaymentMethod(m[0]); } catch {} }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthOk(false); setLoading(false); return; }

      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (m1) mem = m1;
      else {
        const { data: m2 } = await supabase.from('members').select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) mem = m2;
      }
      if (!mem || mem.status !== 'approved') { setAuthOk(false); setLoading(false); return; }
      setMember(mem); setAuthOk(true);

      const { data: adminRec } = await supabase.from('election_admins').select('role').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
      const { data: ha } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
      let heads = ['ezekielborbor17@gmail.com'];
      if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
      const financialRoles = ['president','financial_secretary','treasurer','admin','vp_admin'];
      const isFinancial = heads.includes(user.email?.toLowerCase() ?? '') || Boolean(adminRec && financialRoles.includes(adminRec.role ?? ''));
      setCanSubmit(isFinancial);

      const expQuery = isFinancial
        ? supabase.from('expenses').select('*').order('expense_date',{ascending:false})
        : supabase.from('expenses').select('*').eq('status','approved').order('expense_date',{ascending:false});
      const [{ data: expData },{ data: dues },{ data: membership },{ data: candidates },{ data: donations },{ data: evs }] = await Promise.all([
        expQuery,
        supabase.from('dues_payments').select('amount').eq('status','approved').neq('period','Membership Registration Fee'),
        supabase.from('dues_payments').select('amount').eq('status','approved').eq('period','Membership Registration Fee'),
        supabase.from('candidate_applications').select('registration_fee').eq('status','approved'),
        supabase.from('donations').select('amount').eq('status','approved').eq('donation_type','money'),
        supabase.from('events').select('id,title,event_date').eq('chapter', mem.chapter).order('event_date',{ascending:false}).limit(20),
      ]);

      if (expData) setExpenses(expData);
      if (evs) setEvents(evs);
      setIncome([
        { label:'Annual Dues',     amount:(dues??[]).reduce((s:number,d:any)=>s+(d.amount??0),0),                currency: 'LRD' },
        { label:'Membership Fees', amount:(membership??[]).reduce((s:number,d:any)=>s+(d.amount??0),0),          currency: 'LRD' },
        { label:'Candidate Fees',  amount:(candidates??[]).reduce((s:number,c:any)=>s+(c.registration_fee??0),0),currency: 'LRD' },
        { label:'Donations',       amount:(donations??[]).reduce((s:number,d:any)=>s+(d.amount??0),0),           currency: 'LRD' },
      ]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const num = parseFloat(amount);
    if (!isNaN(num) && num > 0) {
      const rate = exchangeRates[currency] ?? 1;
      setConvertedAmount(Math.round(num * rate * 100) / 100);
    } else { setConvertedAmount(0); }
  }, [amount, currency, exchangeRates]);

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve,reject)=>{
      const img=new window.Image(); const url=URL.createObjectURL(file);
      img.onload=()=>{
        const MAX=1200; let {width,height}=img;
        if(width>MAX||height>MAX){if(width>height){height=Math.round(height*MAX/width);width=MAX;}else{width=Math.round(width*MAX/height);height=MAX;}}
        const c=document.createElement('canvas'); c.width=width; c.height=height;
        c.getContext('2d')!.drawImage(img,0,0,width,height); URL.revokeObjectURL(url);
        c.toBlob(b=>b?resolve(new File([b],'receipt.jpg',{type:'image/jpeg'})):reject(),'image/jpeg',0.88);
      }; img.onerror=reject; img.src=url;
    });
  }

  async function submit() {
    if (!title.trim())       { setError('Title required.'); return; }
    if (!description.trim()) { setError('Full description required — what, where, why.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Valid amount required.'); return; }
    setSubmitting(true); setError('');
    try {
      let receipt_url: string|null = null;
      if (receiptFile) {
        const fn=`expenses/${Date.now()}_${member.id}.jpg`;
        const {data:ud,error:ue}=await supabase.storage.from('payment-screenshots').upload(fn,receiptFile,{upsert:true});
        if(ue) throw new Error(ue.message);
        receipt_url=supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }
      const rate = exchangeRates[currency] ?? 1;
      const {data,error:ie}=await supabase.from('expenses').insert([{
        title:title.trim(), description:description.trim(), category,
        amount:convertedAmount, currency:baseCurrency,
        original_amount:parseFloat(amount), original_currency:currency,
        converted_amount:convertedAmount, exchange_rate:rate,
        expense_date:expenseDate, submitted_by:member.full_name,
        authorized_by:authorizedBy.trim()||null,
        payment_method:paymentMethod,
        event_id:linkedEvent||null, committee:committee.trim()||null,
        notes:notes.trim()||null, receipt_url, status:'pending',
      }]).select().single();
      if(ie) throw new Error(ie.message);
      setExpenses(prev=>[data,...prev]);
      setSubmitted(true);
    } catch(e:any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (authOk===null||loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-red-600" size={48}/></div>;
  if (!authOk) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <Lock size={36} className="text-red-600 mx-auto mb-4"/>
        <h2 className="text-2xl font-black uppercase italic mb-3">Members Only</h2>
        <Link href="/members/login" className="block w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm">Sign In</Link>
      </div>
    </div>
  );

  const totalIncome   = income.reduce((s,i)=>s+i.amount,0);
  const totalExpenses = expenses.filter(e=>e.status==='approved').reduce((s,e)=>s+(e.converted_amount??e.amount),0);
  const balance       = totalIncome - totalExpenses;
  const pendingCount  = expenses.filter(e=>e.status==='pending').length;
  const pendingAmount = expenses.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.converted_amount??e.amount),0);

  const STATUS_CFG: Record<string,{label:string;color:string;bg:string;icon:ReactNode}> = {
    pending:  {label:'Awaiting Approval', color:'text-yellow-700', bg:'bg-yellow-50 border-yellow-200', icon:<Clock size={12}/>},
    approved: {label:'Approved & Deducted',color:'text-green-700', bg:'bg-green-50 border-green-200',  icon:<CheckCircle2 size={12}/>},
    rejected: {label:'Rejected',           color:'text-red-700',   bg:'bg-red-50 border-red-200',      icon:<X size={12}/>},
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Receipt size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Financial Ledger & Expenses</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Submit → Approve → Spend · Full Audit Trail</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Balance overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {label:'Total Income',    value:totalIncome,    color:'bg-green-600', icon:<TrendingUp size={18}/>},
            {label:'Total Spent',     value:totalExpenses,  color:'bg-red-600',   icon:<TrendingDown size={18}/>},
            {label:'Net Balance',     value:balance,        color:balance>=0?'bg-blue-600':'bg-orange-600', icon:<DollarSign size={18}/>},
            {label:`Pending (${pendingCount})`,value:pendingAmount,color:'bg-yellow-500',icon:<Clock size={18}/>},
          ].map(s=>(
            <div key={s.label} className={`${s.color} text-white rounded-3xl p-5 shadow`}>
              <div className="mb-2 opacity-70">{s.icon}</div>
              <p className="text-2xl font-black">{s.value.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">{s.label} ({baseCurrency})</p>
            </div>
          ))}
        </div>

        {/* Critical notice */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5"/>
            <div>
              <p className="font-black text-amber-800 uppercase tracking-widest text-xs mb-1">⚠️ {pendingCount} Expense{pendingCount!==1?'s':''} Awaiting Approval</p>
              <p className="text-amber-700 text-xs font-bold leading-relaxed">
                <strong>{pendingAmount.toLocaleString()} {baseCurrency}</strong> is committed but not yet approved.
                No money should be spent until the President or Head Admin approves these submissions.
                Spending before approval violates BWIAA financial policy.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm">
          {([
            {id:'ledger',   label:'📊 Ledger'},
            {id:'workflow', label:'ℹ️ How It Works'},
            ...(canSubmit?[{id:'submit',label:'➕ Submit Expense'}]:[]),
          ] as any[]).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t.id?'bg-slate-900 text-white':'text-slate-500 hover:text-slate-900'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── WORKFLOW TAB ── */}
        {tab==='workflow' && (
          <div className="space-y-5">
            <div className="bg-white rounded-[2rem] p-8 shadow-sm">
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Expense Policy</h2>
              <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
                BWIAA operates a strict <strong>pre-approval expense model</strong>.
                This means expenses must be submitted and approved <strong>before</strong> any money is spent.
                This protects the association and every officer involved.
              </p>

              {/* Workflow steps */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
                {WORKFLOW_STEPS.map((s,i)=>(
                  <div key={s.step} className="relative">
                    <div className={`${s.color} text-white rounded-2xl p-5 text-center`}>
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">{s.icon}</div>
                      <p className="font-black uppercase text-sm tracking-widest">{s.label}</p>
                      <p className="text-[10px] opacity-80 font-bold mt-2 leading-relaxed">{s.desc}</p>
                    </div>
                    {i < WORKFLOW_STEPS.length-1 && (
                      <div className="hidden sm:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                        <ArrowRight size={16} className="text-slate-400"/>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Rules */}
              <div className="space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Key Rules</p>
                {[
                  {icon:'✅', text:'Submit the expense request BEFORE purchasing anything'},
                  {icon:'✅', text:'Include full description: what, where, why, and how much'},
                  {icon:'✅', text:'Name who authorized the expenditure'},
                  {icon:'✅', text:'Link to an event if the expense is event-related'},
                  {icon:'✅', text:'Upload receipt or proof after purchase (for non-cash)'},
                  {icon:'🚫', text:'NEVER spend first and report later — this is a violation'},
                  {icon:'🚫', text:'NEVER split a large expense into smaller ones to avoid approval'},
                  {icon:'🚫', text:'NEVER approve your own expense submission'},
                ].map((r,i)=>(
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${r.icon==='✅'?'bg-green-50':'bg-red-50'}`}>
                    <span className="text-base shrink-0">{r.icon}</span>
                    <p className={`text-xs font-bold ${r.icon==='✅'?'text-green-800':'text-red-800'}`}>{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SUBMIT TAB ── */}
        {tab==='submit' && canSubmit && (
          submitted ? (
            <div className="bg-white rounded-[2rem] p-10 text-center shadow-sm">
              <CheckCircle2 size={48} className="text-blue-600 mx-auto mb-4"/>
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Expense Submitted!</h2>
              <p className="text-slate-500 font-bold text-sm mb-2">Pending President / Head Admin approval.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
                <p className="text-amber-800 font-black text-xs uppercase tracking-widest mb-1">⚠️ Important Reminder</p>
                <p className="text-amber-700 text-xs font-bold">Do NOT spend this money until you receive approval. Check back for the decision.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{setSubmitted(false);setTitle('');setDescription('');setAmount('');setAuthorizedBy('');setNotes('');setCommittee('');setLinkedEvent('');setReceiptFile(null);setReceiptPreview(null);}}
                  className="flex-1 bg-red-600 text-white font-black uppercase py-4 rounded-2xl text-sm">Submit Another</button>
                <button onClick={()=>setTab('ledger')} className="flex-1 bg-slate-100 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm">View Ledger</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] p-8 shadow-sm space-y-5">
              {/* Pre-approval banner */}
              <div className="bg-blue-900 rounded-2xl p-5 flex items-start gap-3">
                <Info size={18} className="text-blue-300 shrink-0 mt-0.5"/>
                <div>
                  <p className="text-white font-black uppercase text-xs tracking-widest mb-1">Pre-Approval Required</p>
                  <p className="text-blue-200 text-xs font-bold leading-relaxed">
                    Submit this request BEFORE spending. Money can only be released after the President or Head Admin approves.
                    This protects you and the association.
                  </p>
                </div>
              </div>

              <div><h2 className="text-2xl font-black uppercase italic text-slate-900">Submit Expense Request</h2></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Expense Title *</label>
                  <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Venue rental for Annual Meeting"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Category *</label>
                  <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                    {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Expense Date *</label>
                  <input value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} type="date" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                {/* Amount + Currency */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount *</label>
                  <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Currency *</label>
                  <select value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                    {currencies.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                {/* Conversion */}
                {currency !== baseCurrency && convertedAmount > 0 && (
                  <div className="sm:col-span-2 bg-green-50 border-2 border-green-200 rounded-2xl p-4">
                    <p className="text-xs font-black text-green-700 uppercase tracking-widest mb-2">🔄 Conversion</p>
                    <div className="flex items-center gap-3 flex-wrap text-sm font-black text-green-800">
                      <span>{parseFloat(amount||'0').toLocaleString()} {currency}</span>
                      <span>× {exchangeRates[currency]??1}</span>
                      <span>=</span>
                      <span className="text-xl">{convertedAmount.toLocaleString()} {baseCurrency}</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Authorized By *</label>
                  <input value={authorizedBy} onChange={e=>setAuthorizedBy(e.target.value)} placeholder="Name of authorizing officer"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Payment Method</label>
                  <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                    {paymentMethods.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                {/* Link to event */}
                {events.length > 0 && (
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Link to Event (optional)</label>
                    <select value={linkedEvent} onChange={e=>setLinkedEvent(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                      <option value="">— Not event-related —</option>
                      {events.map(ev=><option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.event_date).toLocaleDateString()})</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Committee (if applicable)</label>
                  <input value={committee} onChange={e=>setCommittee(e.target.value)} placeholder="e.g. Events Planning Committee"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Full Description * — What, Where, Why</label>
                  <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4}
                    placeholder="Provide complete details: What is being purchased or paid for? Where? Why is it necessary? Who will benefit? Include vendor/supplier name if applicable."
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 resize-none text-sm"/>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Additional Notes</label>
                  <input value={notes} onChange={e=>setNotes(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              </div>

              {/* Receipt upload */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Receipt / Quote / Estimate (upload after spending)</label>
                {receiptPreview
                  ? <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs"><img src={receiptPreview} className="w-full max-h-40 object-cover"/><button onClick={()=>{setReceiptFile(null);setReceiptPreview(null);}} className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14}/></button></div>
                  : <label className="cursor-pointer flex flex-col items-center justify-center h-24 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                      <Upload size={20} className="text-slate-400 mb-1"/>
                      <p className="text-xs font-bold text-slate-500">Upload quote, estimate or receipt</p>
                      <input type="file" accept="image/*" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const c=await compressImage(f);setReceiptFile(c);setReceiptPreview(URL.createObjectURL(c));}}/>
                    </label>}
              </div>

              {error && <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"><AlertCircle size={16} className="text-red-600 shrink-0"/><p className="text-red-700 text-sm font-bold">{error}</p></div>}
              <button onClick={submit} disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                {submitting?<><Loader2 size={16} className="animate-spin"/>Submitting...</>:<><CheckCircle2 size={16}/>Submit for Approval</>}
              </button>
            </div>
          )
        )}

        {/* ── LEDGER TAB ── */}
        {tab==='ledger' && (
          <div className="space-y-5">
            {/* Income */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase italic text-lg mb-4 border-l-8 border-green-500 pl-4">Income</h3>
              <div className="space-y-2">
                {income.map(i=>(
                  <div key={i.label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3"><div className="w-2 h-2 bg-green-500 rounded-full"/><span className="font-bold text-slate-700 text-sm">{i.label}</span></div>
                    <span className="font-black text-green-700">+ {i.amount.toLocaleString()} {i.currency}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                  <span className="font-black text-slate-800 text-xs uppercase tracking-widest">Total Income</span>
                  <span className="font-black text-green-700 text-lg">+ {totalIncome.toLocaleString()} {baseCurrency}</span>
                </div>
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase italic text-lg mb-4 border-l-8 border-red-500 pl-4">Expenses</h3>
              {expenses.length===0
                ? <p className="text-slate-400 font-bold text-sm text-center py-6">No expenses recorded yet.</p>
                : <>
                  {expenses.map(e=>{
                    const cfg=STATUS_CFG[e.status]??STATUS_CFG['pending'];
                    const isOpen=expanded===e.id;
                    const showConv=e.original_currency && e.original_currency!==baseCurrency;
                    return (
                      <div key={e.id} className="border border-slate-100 rounded-2xl overflow-hidden mb-2">
                        <button onClick={()=>setExpanded(isOpen?null:e.id)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-all">
                          <div className="w-2 h-2 bg-red-500 rounded-full shrink-0"/>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <p className="font-black text-slate-800 text-sm">{e.title}</p>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.bg} ${cfg.color}`}>{cfg.icon}{cfg.label}</span>
                              {e.committee&&<span className="text-[10px] bg-purple-100 text-purple-700 font-black uppercase px-2 py-0.5 rounded-full">{e.committee}</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{e.category} · {new Date(e.expense_date).toLocaleDateString()} · by {e.submitted_by}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {showConv
                              ? <>
                                  <p className="font-black text-red-600">{(e.original_amount??e.amount).toLocaleString()} {e.original_currency}</p>
                                  <p className="text-xs text-slate-400 font-bold">= {(e.converted_amount??e.amount).toLocaleString()} {baseCurrency}</p>
                                </>
                              : <p className="font-black text-red-600">{(e.converted_amount??e.amount).toLocaleString()} {e.currency}</p>}
                          </div>
                          {isOpen?<ChevronUp size={14} className="text-slate-400"/>:<ChevronDown size={14} className="text-slate-400"/>}
                        </button>
                        {isOpen&&(
                          <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-2 text-xs">
                            <p className="text-slate-700 font-bold leading-relaxed">{e.description}</p>
                            {e.authorized_by&&<p className="text-slate-500 font-bold">Authorized by: <span className="text-slate-700">{e.authorized_by}</span></p>}
                            {e.payment_method&&<p className="text-slate-500 font-bold">Payment: {e.payment_method}</p>}
                            {showConv&&<p className="text-blue-600 font-bold">Rate: 1 {e.original_currency} = {e.exchange_rate} {baseCurrency}</p>}
                            {e.status==='approved'&&<p className="text-green-600 font-bold">✓ Approved by {e.approved_by} on {new Date(e.approved_at).toLocaleDateString()}</p>}
                            {e.status==='rejected'&&<p className="text-red-600 font-bold">✗ Rejected</p>}
                            {e.receipt_url&&<img src={e.receipt_url} className="rounded-xl max-h-32 cursor-pointer border border-slate-200" onClick={()=>window.open(e.receipt_url,'_blank')}/>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                    <span className="font-black text-slate-800 text-xs uppercase tracking-widest">Total Approved Expenses</span>
                    <span className="font-black text-red-600 text-lg">− {totalExpenses.toLocaleString()} {baseCurrency}</span>
                  </div>
                </>}
            </div>

            {/* Balance */}
            <div className={`${balance>=0?'bg-blue-900':'bg-orange-800'} rounded-[2rem] p-6 flex items-center justify-between`}>
              <div>
                <p className="text-white/50 font-black text-xs uppercase tracking-widest">Net Balance</p>
                <p className="text-white font-black text-4xl mt-1">{balance.toLocaleString()} <span className="text-xl">{baseCurrency}</span></p>
                {pendingAmount>0&&<p className="text-white/40 text-xs font-bold mt-1">({pendingAmount.toLocaleString()} {baseCurrency} pending — not yet deducted)</p>}
              </div>
              <span className="text-5xl">{balance>=0?'📈':'📉'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
