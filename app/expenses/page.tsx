"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DollarSign, Upload, CheckCircle2, Loader2, AlertCircle,
  X, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Lock, Receipt
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CATEGORIES = ['Administrative','Events','Welfare','Travel','Maintenance','Equipment','Communication','Other'];

export default function ExpensesPage() {
  const [member, setMember]         = useState<any>(null);
  const [authOk, setAuthOk]         = useState<boolean|null>(null);
  const [canSubmit, setCanSubmit]   = useState(false);
  const [expenses, setExpenses]     = useState<any[]>([]);
  const [income, setIncome]         = useState<{label:string;amount:number}[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<'ledger'|'submit'>('ledger');
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [orgName, setOrgName]       = useState('BWIAA');
  const [currency, setCurrency]     = useState('LRD');
  // Form
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]     = useState('Administrative');
  const [amount, setAmount]         = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0,10));
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [notes, setNotes]           = useState('');
  const [receiptFile, setReceiptFile]   = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthOk(false); setLoading(false); return; }
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('currency')) setCurrency(get('currency') ?? 'LRD');
      }
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
      const isHead = heads.includes(user.email?.toLowerCase() ?? '');
      const financialRoles = ['president','financial_secretary','treasurer','admin','vp_admin'];
      const canSubmitExpense = isHead || Boolean(adminRec && financialRoles.includes(adminRec.role ?? ''));
      setCanSubmit(canSubmitExpense);
      const expQuery = canSubmitExpense
        ? supabase.from('expenses').select('*').order('expense_date',{ascending:false})
        : supabase.from('expenses').select('*').eq('status','approved').order('expense_date',{ascending:false});
      const { data: expData } = await expQuery;
      if (expData) setExpenses(expData);
      const [{ data: dues },{ data: membership },{ data: candidates },{ data: donations }] = await Promise.all([
        supabase.from('dues_payments').select('amount').eq('status','approved').neq('period','Membership Registration Fee'),
        supabase.from('dues_payments').select('amount').eq('status','approved').eq('period','Membership Registration Fee'),
        supabase.from('candidate_applications').select('registration_fee').eq('status','approved'),
        supabase.from('donations').select('amount').eq('status','approved').eq('donation_type','money'),
      ]);
      setIncome([
        { label:'Annual Dues',        amount:(dues??[]).reduce((s:number,d:any)=>s+(d.amount??0),0) },
        { label:'Membership Fees',    amount:(membership??[]).reduce((s:number,d:any)=>s+(d.amount??0),0) },
        { label:'Candidate Fees',     amount:(candidates??[]).reduce((s:number,c:any)=>s+(c.registration_fee??0),0) },
        { label:'Donations',          amount:(donations??[]).reduce((s:number,d:any)=>s+(d.amount??0),0) },
      ]);
      setLoading(false);
    })();
  }, []);

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
    if (!description.trim()) { setError('Description required.'); return; }
    if (!amount||isNaN(parseFloat(amount))||parseFloat(amount)<=0) { setError('Valid amount required.'); return; }
    setSubmitting(true); setError('');
    try {
      let receipt_url: string|null = null;
      if (receiptFile) {
        const fn=`expenses/${Date.now()}_${member.id}.jpg`;
        const {data:ud,error:ue}=await supabase.storage.from('payment-screenshots').upload(fn,receiptFile,{upsert:true});
        if(ue) throw new Error(ue.message);
        receipt_url=supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }
      const {data,error:ie}=await supabase.from('expenses').insert([{
        title:title.trim(), description:description.trim(), category,
        amount:parseFloat(amount), currency, expense_date:expenseDate,
        submitted_by:member.full_name, authorized_by:authorizedBy.trim()||null,
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
        <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Members Only</h2>
        <p className="text-slate-500 font-bold text-sm mb-6">Please sign in as an approved member.</p>
        <Link href="/members/login" className="block w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm">Sign In</Link>
      </div>
    </div>
  );

  const totalIncome   = income.reduce((s,i)=>s+i.amount,0);
  const totalExpenses = expenses.filter(e=>e.status==='approved').reduce((s,e)=>s+e.amount,0);
  const balance       = totalIncome - totalExpenses;
  const pendingExp    = expenses.filter(e=>e.status==='pending').reduce((s,e)=>s+e.amount,0);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-xl"><DollarSign size={18} className="text-white"/></div>
            <div><h1 className="text-white font-black uppercase italic text-sm">{orgName} Financial Ledger</h1><p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Transparency & Accountability</p></div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Balance cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {label:'Total Income',    value:totalIncome,    color:'bg-green-600', icon:<TrendingUp size={20}/>},
            {label:'Total Expenses',  value:totalExpenses,  color:'bg-red-600',   icon:<TrendingDown size={20}/>},
            {label:'Net Balance',     value:balance,        color:balance>=0?'bg-blue-600':'bg-orange-600', icon:<DollarSign size={20}/>},
            {label:'Pending Expense', value:pendingExp,     color:'bg-yellow-500',icon:<Receipt size={20}/>},
          ].map(s=>(
            <div key={s.label} className={`${s.color} text-white rounded-3xl p-5 shadow-lg`}>
              <div className="mb-2 opacity-70">{s.icon}</div>
              <p className="text-2xl font-black">{s.value.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">{s.label} ({currency})</p>
            </div>
          ))}
        </div>
        {/* Tabs */}
        <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm">
          {([{id:'ledger',label:'📊 Full Ledger'},...(canSubmit?[{id:'submit',label:'➕ Submit Expense'}]:[])]) .map((t:any)=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t.id?'bg-slate-900 text-white':'text-slate-500 hover:text-slate-900'}`}>{t.label}</button>
          ))}
        </div>
        {tab==='ledger' && (
          <div className="space-y-5">
            <div className="bg-white rounded-[2rem] p-6 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase italic text-lg mb-4 border-l-8 border-green-500 pl-4">Income</h3>
              <div className="space-y-2">
                {income.map(i=>(
                  <div key={i.label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3"><div className="w-2 h-2 bg-green-500 rounded-full"/><span className="font-bold text-slate-700 text-sm">{i.label}</span></div>
                    <span className="font-black text-green-700 text-sm">+ {i.amount.toLocaleString()} {currency}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t-2 border-slate-200">
                  <span className="font-black text-slate-800 uppercase tracking-widest text-xs">Total Income</span>
                  <span className="font-black text-green-700 text-lg">+ {totalIncome.toLocaleString()} {currency}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] p-6 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase italic text-lg mb-4 border-l-8 border-red-500 pl-4">Expenses</h3>
              {expenses.filter(e=>e.status==='approved').length===0
                ? <p className="text-slate-400 font-bold text-sm text-center py-6">No approved expenses yet.</p>
                : <>
                    {expenses.filter(e=>e.status==='approved').map(e=>{
                      const isOpen=expanded===e.id;
                      return (
                        <div key={e.id} className="border border-slate-100 rounded-2xl overflow-hidden mb-2">
                          <button onClick={()=>setExpanded(isOpen?null:e.id)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-all">
                            <div className="w-2 h-2 bg-red-500 rounded-full shrink-0"/>
                            <div className="flex-1"><p className="font-black text-slate-800 text-sm">{e.title}</p><p className="text-[10px] text-slate-400 font-bold uppercase">{e.category} · {new Date(e.expense_date).toLocaleDateString()}</p></div>
                            <span className="font-black text-red-600 text-sm shrink-0">− {e.amount.toLocaleString()} {e.currency}</span>
                            {isOpen?<ChevronUp size={14} className="text-slate-400"/>:<ChevronDown size={14} className="text-slate-400"/>}
                          </button>
                          {isOpen&&<div className="border-t border-slate-100 p-4 bg-slate-50 text-xs space-y-1">
                            <p className="text-slate-600 font-bold">{e.description}</p>
                            {e.authorized_by&&<p className="text-slate-400 font-bold">Auth: {e.authorized_by}</p>}
                            {e.receipt_url&&<img src={e.receipt_url} className="rounded-xl max-h-32 mt-2 cursor-pointer" onClick={()=>window.open(e.receipt_url,'_blank')}/>}
                          </div>}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-3 border-t-2 border-slate-200 mt-2">
                      <span className="font-black text-slate-800 uppercase tracking-widest text-xs">Total Expenses</span>
                      <span className="font-black text-red-600 text-lg">− {totalExpenses.toLocaleString()} {currency}</span>
                    </div>
                  </>}
            </div>
            <div className={`${balance>=0?'bg-blue-900':'bg-orange-800'} rounded-[2rem] p-6 flex items-center justify-between`}>
              <div><p className="text-white/50 font-black text-xs uppercase tracking-widest">Net Balance</p><p className="text-white font-black text-4xl mt-1">{balance.toLocaleString()} <span className="text-xl">{currency}</span></p>{pendingExp>0&&<p className="text-white/40 text-xs font-bold mt-1">({pendingExp.toLocaleString()} pending)</p>}</div>
              <div className="text-5xl">{balance>=0?'📈':'📉'}</div>
            </div>
            {expenses.filter(e=>e.status==='pending').length>0&&(
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-[2rem] p-6">
                <h3 className="font-black text-yellow-800 uppercase italic text-base mb-4">⏳ Pending Expenses ({expenses.filter(e=>e.status==='pending').length})</h3>
                {expenses.filter(e=>e.status==='pending').map(e=>(
                  <div key={e.id} className="flex items-center justify-between py-2 border-b border-yellow-200 last:border-0">
                    <div><p className="font-black text-yellow-900 text-sm">{e.title}</p><p className="text-[10px] text-yellow-700 font-bold uppercase">{e.category} · {e.submitted_by}</p></div>
                    <span className="font-black text-yellow-700 text-sm">{e.amount.toLocaleString()} {e.currency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab==='submit'&&canSubmit&&(
          submitted?(
            <div className="bg-white rounded-[2rem] p-10 text-center shadow-sm">
              <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4"/>
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Submitted!</h2>
              <p className="text-slate-500 font-bold text-sm mb-6">Pending approval before it reflects in the ledger.</p>
              <div className="flex gap-3">
                <button onClick={()=>{setSubmitted(false);setTitle('');setDescription('');setAmount('');}} className="flex-1 bg-red-600 text-white font-black uppercase py-4 rounded-2xl text-sm">Submit Another</button>
                <button onClick={()=>setTab('ledger')} className="flex-1 bg-slate-100 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm">View Ledger</button>
              </div>
            </div>
          ):(
            <div className="bg-white rounded-[2rem] p-8 shadow-sm space-y-5">
              <div><h2 className="text-2xl font-black uppercase italic text-slate-900">Submit Expense</h2><p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Requires President or Head Admin approval</p></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Title *</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Meeting Hall Rental" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Category *</label><select value={category} onChange={e=>setCategory(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount ({currency}) *</label><input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Expense Date *</label><input value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} type="date" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Authorized By</label><input value={authorizedBy} onChange={e=>setAuthorizedBy(e.target.value)} placeholder="Who authorized this?" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/></div>
                <div className="sm:col-span-2"><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Full Description * (what, where, why)</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 resize-none"/></div>
              </div>
              {receiptPreview?<div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs"><img src={receiptPreview} className="w-full max-h-40 object-cover"/><button onClick={()=>{setReceiptFile(null);setReceiptPreview(null);}} className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14}/></button></div>
              :<label className="cursor-pointer flex flex-col items-center justify-center h-24 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all"><Upload size={20} className="text-slate-400 mb-1"/><p className="text-xs font-bold text-slate-500">Upload receipt (optional)</p><input type="file" accept="image/*" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const c=await compressImage(f);setReceiptFile(c);setReceiptPreview(URL.createObjectURL(c));}}/></label>}
              {error&&<div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"><AlertCircle size={16} className="text-red-600 shrink-0"/><p className="text-red-700 text-sm font-bold">{error}</p></div>}
              <button onClick={submit} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                {submitting?<><Loader2 size={16} className="animate-spin"/>Submitting...</>:<><CheckCircle2 size={16}/>Submit for Approval</>}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
