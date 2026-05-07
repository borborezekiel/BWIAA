"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CreditCard, Upload, CheckCircle2, Loader2, AlertCircle,
  Clock, X, ChevronDown, ChevronUp, Receipt, Lock, Info
} from 'lucide-react';
import Link from 'next/link';

function useAuth() {
  const [ok, setOk] = useState<boolean|null>(null);
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setOk(false); return; }
      setUserEmail(user.email ?? '');
      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('id,status,auth_user_id')
        .eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; } else {
        const { data: m2 } = await supabase.from('members').select('id,status,auth_user_id')
          .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) { mem = m2; if (!m2.auth_user_id) await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id); }
      }
      const { data: adm } = await supabase.from('election_admins').select('email').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
      const { data: ha } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
      let heads = ['ezekielborbor17@gmail.com'];
      if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
      const isAdmin = !!adm || heads.includes(user.email?.toLowerCase() ?? '');
      setOk(isAdmin || (!!mem && mem.status === 'approved'));
    });
  }, []);
  return { ok, userEmail };
}

function MemberOnly() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{backdropFilter:'blur(12px)', background:'rgba(15,23,42,0.7)'}}>
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl mx-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-red-600"/>
        </div>
        <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Members Only</h2>
        <p className="text-slate-500 font-bold text-sm mb-8 leading-relaxed">
          Dues payments are only accessible to active BWIAA members.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/members/login" className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm hover:bg-red-700 transition-all">Sign In</Link>
          <Link href="/members/register" className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase text-sm hover:bg-slate-200 transition-all">Register as Member</Link>
        </div>
      </div>
    </div>
  );
}

interface DuesPayment {
  id: string; member_id: string | null; member_name: string;
  chapter: string; amount: number; dues_amount: number; maintenance_fee: number;
  currency: string; period: string; payment_method: string;
  screenshot_url: string | null; status: string; notes: string | null;
  approved_by: string | null; approved_at: string | null; created_at: string;
}
interface Member { id: string; full_name: string; email: string; chapter: string; status: string; }

const CURRENT_YEAR = new Date().getFullYear();
const PERIODS = [
  `${CURRENT_YEAR} Annual Dues`,
  `${CURRENT_YEAR} Q1`, `${CURRENT_YEAR} Q2`,
  `${CURRENT_YEAR} Q3`, `${CURRENT_YEAR} Q4`,
  `${CURRENT_YEAR - 1} Annual Dues (Arrears)`,
  'Special Levy', 'Event Contribution', 'Other',
];

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending Review', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  approved: { label: 'Approved',       color: 'text-green-700',  bg: 'bg-green-50 border-green-200'   },
  rejected: { label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-50 border-red-200'       },
};

export default function DuesPage() {
  const { ok: authOk } = useAuth();
  const [tab, setTab]             = useState<'submit'|'history'>('submit');
  const [orgName, setOrgName]     = useState('BWIAA');
  const [currency, setCurrency]   = useState('LRD');
  const [symbol, setSymbol]       = useState('$');
  const [maintenanceFee, setMaintenanceFee]           = useState(50);
  const [maintenanceCurrency, setMaintenanceCurrency] = useState('LRD');
  const [chapters, setChapters]   = useState<string[]>([]);
  const [myMember, setMyMember]   = useState<Member|null>(null);
  const [payments, setPayments]   = useState<DuesPayment[]>([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState<string|null>(null);
  const [memberName, setMemberName] = useState('');
  const [email, setEmail]         = useState('');
  const [chapter, setChapter]     = useState('');
  const [amount, setAmount]       = useState('');
  const [period, setPeriod]       = useState(PERIODS[0]);
  const [method, setMethod]       = useState<'screenshot'|'in_person'>('screenshot');
  const [screenshotFile, setScreenshotFile]       = useState<File|null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string|null>(null);
  const [notes, setNotes]         = useState('');

  // Computed totals
  const duesAmt   = parseFloat(amount) || 0;
  const totalAmt  = duesAmt + maintenanceFee;

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name'))             setOrgName(get('org_name'));
        if (get('currency'))             setCurrency(get('currency'));
        if (get('currency_symbol'))      setSymbol(get('currency_symbol'));
        if (get('maintenance_fee'))      setMaintenanceFee(Number(get('maintenance_fee')));
        if (get('maintenance_currency')) setMaintenanceCurrency(get('maintenance_currency'));
        if (get('chapters'))             { try { const c = JSON.parse(get('chapters')); setChapters(c); setChapter(c[0]); } catch {} }
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setEmail(user.email);
        const { data: mem } = await supabase.from('members').select('*')
          .eq('email', user.email.toLowerCase()).eq('status','approved').maybeSingle();
        if (mem) { setMyMember(mem); setMemberName(mem.full_name); setChapter(mem.chapter); }
        const { data: pays } = await supabase.from('dues_payments').select('*')
          .eq('member_id', mem?.id ?? '00000000-0000-0000-0000-000000000000')
          .order('created_at', { ascending: false });
        if (pays) setPayments(pays);
      }
      setLoading(false);
    })();
  }, []);

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200; let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b],'payment.jpg',{type:'image/jpeg'})) : reject(), 'image/jpeg', 0.88);
      };
      img.onerror = reject; img.src = url;
    });
  }

  async function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const c = await compressImage(file); setScreenshotFile(c); setScreenshotPreview(URL.createObjectURL(c)); }
    catch { setError('Failed to process image.'); }
  }

  async function submit() {
    if (!memberName.trim())                                   { setError('Full name required.'); return; }
    if (!email.trim() || !email.includes('@'))                { setError('Valid email required.'); return; }
    if (!chapter)                                             { setError('Chapter required.'); return; }
    if (!amount || isNaN(duesAmt) || duesAmt <= 0)           { setError('Valid dues amount required.'); return; }
    if (method === 'screenshot' && !screenshotFile)           { setError('Please upload a payment screenshot.'); return; }
    setSubmitting(true); setError('');
    try {
      let screenshot_url: string|null = null;
      if (screenshotFile) {
        const fn = `dues/${Date.now()}_${memberName.replace(/\s+/g,'_')}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('payment-screenshots').upload(fn, screenshotFile, { upsert: true });
        if (ue) throw new Error(`Upload failed: ${ue.message}`);
        screenshot_url = supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }

      // ── SINGLE RECORD: total = dues + maintenance ──────────────────────────
      // dues_amount and maintenance_fee stored separately for admin reporting
      const { data, error: ie } = await supabase.from('dues_payments').insert([{
        member_id:       myMember?.id ?? null,
        member_name:     memberName.trim(),
        chapter,
        amount:          totalAmt,          // total paid
        dues_amount:     duesAmt,           // actual dues portion
        maintenance_fee: maintenanceFee,    // maintenance portion
        currency:        maintenanceCurrency, // all in same currency
        period,
        payment_method:  method,
        screenshot_url,
        notes:           notes.trim() || null,
        status:          'pending',
      }]).select().single();
      if (ie) throw new Error(ie.message);

      if (myMember) {
        await supabase.from('activity_log').insert([{
          member_id:   myMember.id,
          member_name: myMember.full_name,
          chapter,
          action:      'Dues payment submitted',
          details:     `${duesAmt} ${maintenanceCurrency} dues + ${maintenanceFee} ${maintenanceCurrency} maintenance = ${totalAmt} total for ${period}`,
        }]);
      }
      setPayments(prev => [data, ...prev]);
      setSubmitted(true);
    } catch (e: any) { setError(e.message ?? 'Submission failed.'); }
    finally { setSubmitting(false); }
  }

  if (authOk === null || loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-slate-950 pb-20">
      {authOk === false && <MemberOnly/>}

      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><CreditCard size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} — Dues Payment</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Submit & Track Your Dues</p>
            </div>
          </div>
          <Link href="/members" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Members</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-8 space-y-6">
        {myMember && (
          <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 size={16} className="text-green-400 shrink-0"/>
            <p className="text-green-300 text-xs font-bold">
              Logged in as <span className="font-black">{myMember.full_name}</span> · {myMember.chapter} · Active Member
            </p>
          </div>
        )}

        <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
          {(['submit','history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t?'bg-white text-slate-900':'text-white/50 hover:text-white'}`}>
              {t==='submit'?'Submit Payment':'Payment History'}
            </button>
          ))}
        </div>

        {tab === 'submit' && (submitted ? (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-2xl">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={32} className="text-green-600"/>
            </div>
            <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Payment Submitted!</h2>
            <p className="text-slate-500 font-bold text-sm mb-6">Pending review by your chapter administrator.</p>
            <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
              {[
                ['Name',              memberName],
                ['Chapter',           chapter],
                ['Dues Amount',       `${duesAmt.toLocaleString()} ${maintenanceCurrency}`],
                ['Maintenance Fee',   `${maintenanceFee} ${maintenanceCurrency}`],
                ['Total Paid',        `${totalAmt.toLocaleString()} ${maintenanceCurrency}`],
                ['Period',            period],
                ['Method',            method==='in_person'?'In Person':'Screenshot'],
                ['Status',            'Pending Review'],
              ].map(([l,v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className={`text-xs font-black ${l==='Maintenance Fee'?'text-amber-600':l==='Total Paid'?'text-green-700':'text-slate-800'}`}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setSubmitted(false); setScreenshotFile(null); setScreenshotPreview(null); setAmount(''); setNotes(''); }}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-red-700 transition-all">
                Submit Another Payment
              </button>
              <button onClick={() => setTab('history')}
                className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-200 transition-all">
                View History
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl space-y-6">
            <div>
              <h2 className="text-2xl font-black uppercase italic text-slate-900">Submit Dues Payment</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">All payments reviewed by your chapter administrator</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {l:'Full Name *',  v:memberName, set:setMemberName, ro:!!myMember, t:'text',  ph:'Your full name'},
                {l:'Email *',      v:email,      set:setEmail,      ro:!!myMember, t:'email', ph:'your@email.com'},
              ].map(({l,v,set:s,ro,t,ph}) => (
                <div key={l}>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{l}</label>
                  <input value={v} onChange={e => s(e.target.value)} type={t} placeholder={ph} readOnly={ro}
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 ${ro?'bg-slate-50 border-slate-100 text-slate-500':'border-slate-200 focus:border-red-600'}`}/>
                </div>
              ))}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Chapter *</label>
                <select value={chapter} onChange={e => setChapter(e.target.value)} disabled={!!myMember}
                  className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 ${myMember?'bg-slate-50 border-slate-100 text-slate-500':'border-slate-200 focus:border-red-600'}`}>
                  {chapters.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Period *</label>
                <select value={period} onChange={e => setPeriod(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Dues Amount ({maintenanceCurrency}) *
                </label>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0"
                  placeholder={`Enter dues amount in ${maintenanceCurrency}`}
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional info..."
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
              </div>
            </div>

            {/* ── Payment Breakdown — shown as soon as amount is entered ── */}
            {duesAmt > 0 && (
              <div className="bg-slate-900 rounded-2xl p-6">
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-4">Payment Breakdown</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 font-bold text-sm">Dues Amount</span>
                    <span className="text-white font-black text-sm">{duesAmt.toLocaleString()} {maintenanceCurrency}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400/80 font-bold text-sm">System Maintenance Fee</span>
                      <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Fixed</span>
                    </div>
                    <span className="text-amber-400 font-black text-sm">+ {maintenanceFee} {maintenanceCurrency}</span>
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                    <span className="text-white font-black uppercase tracking-widest text-sm">Total You Pay</span>
                    <span className="text-green-400 font-black text-2xl">{totalAmt.toLocaleString()} {maintenanceCurrency}</span>
                  </div>
                </div>
                <p className="text-white/20 text-[10px] font-bold mt-4 leading-relaxed">
                  The {maintenanceFee} {maintenanceCurrency} maintenance contribution supports the BWIAA digital platform and is collected with every dues payment.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Payment Method *</label>
              <div className="grid grid-cols-2 gap-4">
                {[{k:'screenshot',l:'Upload Screenshot',s:'Transfer & upload proof'},{k:'in_person',l:'Pay In Person',s:'Meet your chairperson'}].map(({k,l,s}) => (
                  <button key={k} onClick={() => setMethod(k as any)}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${method===k?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-black text-slate-800 text-sm">{l}</p>
                    <p className="text-xs text-slate-500 font-bold mt-1">{s}</p>
                  </button>
                ))}
              </div>
            </div>

            {method === 'screenshot' && (
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  Payment Screenshot * <span className="normal-case font-bold text-slate-400">(screenshot of full {duesAmt > 0 ? `${totalAmt.toLocaleString()} ${maintenanceCurrency}` : 'total'} payment)</span>
                </label>
                {screenshotPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs">
                    <img src={screenshotPreview} className="w-full max-h-48 object-cover" alt="Screenshot"/>
                    <button onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14}/></button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center h-36 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                    <Upload size={24} className="text-slate-400 mb-2"/>
                    <p className="text-sm font-bold text-slate-500">Click to upload payment proof</p>
                    <p className="text-xs text-slate-400 mt-1">Auto-compressed · JPG, PNG</p>
                    <input type="file" accept="image/*" className="hidden" onChange={handleScreenshot}/>
                  </label>
                )}
              </div>
            )}

            {method === 'in_person' && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
                <p className="font-black text-yellow-800 text-sm">In-Person Payment</p>
                <p className="text-yellow-700 text-xs font-bold mt-2 leading-relaxed">
                  Submit this form then bring the full amount of <strong>{duesAmt > 0 ? `${totalAmt.toLocaleString()} ${maintenanceCurrency}` : `dues + ${maintenanceFee} ${maintenanceCurrency} maintenance`}</strong> to your chapter administrator.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/>
                <p className="text-red-700 text-sm font-bold">{error}</p>
              </div>
            )}

            <button onClick={submit} disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
              {submitting
                ? <><Loader2 size={16} className="animate-spin"/> Submitting...</>
                : <><CheckCircle2 size={16}/> Submit {duesAmt > 0 ? `${totalAmt.toLocaleString()} ${maintenanceCurrency}` : 'Payment'}</>}
            </button>
          </div>
        ))}

        {tab === 'history' && (
          <div className="space-y-4">
            {payments.length === 0 ? (
              <div className="bg-white/5 rounded-3xl p-16 text-center">
                <Receipt size={48} className="mx-auto mb-4 text-white/20"/>
                <p className="text-white/40 font-black uppercase tracking-widest text-sm">No payment records yet</p>
              </div>
            ) : payments.map(p => {
              const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG['pending'];
              const isOpen = expanded === p.id;
              const dues   = p.dues_amount  || (p.amount - (p.maintenance_fee || 0));
              const mFee   = p.maintenance_fee || 0;
              return (
                <div key={p.id} className="bg-white rounded-3xl overflow-hidden shadow-sm">
                  <button onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-all">
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mb-1 ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <p className="font-black text-slate-800">{p.period}</p>
                      <p className="text-xs text-slate-400 font-bold">{new Date(p.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-2xl text-slate-900">{p.amount.toLocaleString()} <span className="text-sm text-slate-400 font-bold">{p.currency}</span></p>
                      {mFee > 0 && (
                        <p className="text-[10px] text-amber-600 font-bold">{dues.toLocaleString()} dues + {mFee} maint.</p>
                      )}
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{p.payment_method === 'in_person' ? 'In Person' : 'Screenshot'}</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400 shrink-0"/> : <ChevronDown size={16} className="text-slate-400 shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-3">
                      {/* Breakdown */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Breakdown</p>
                        <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Dues</span><span className="font-black text-slate-800">{dues.toLocaleString()} {p.currency}</span></div>
                        {mFee > 0 && <div className="flex justify-between text-xs"><span className="text-amber-600 font-bold">Maintenance Fee</span><span className="font-black text-amber-600">{mFee} {p.currency}</span></div>}
                        <div className="flex justify-between text-xs border-t border-slate-100 pt-2"><span className="font-black text-slate-700 uppercase">Total</span><span className="font-black text-green-700">{p.amount.toLocaleString()} {p.currency}</span></div>
                      </div>
                      {p.notes && <p className="text-sm font-bold text-slate-700 italic">"{p.notes}"</p>}
                      {p.screenshot_url && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Proof</p>
                          <img src={p.screenshot_url} className="rounded-2xl max-h-48 border border-slate-200 cursor-pointer"
                            alt="Payment proof" onClick={() => window.open(p.screenshot_url!, '_blank')}/>
                        </div>
                      )}
                      {p.approved_by && (
                        <p className="text-xs text-slate-500 font-bold">
                          {p.status === 'approved' ? '✓ Approved' : '✗ Reviewed'} by {p.approved_by} on {p.approved_at ? new Date(p.approved_at).toLocaleDateString() : '—'}
                        </p>
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
