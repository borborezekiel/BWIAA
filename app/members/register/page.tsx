"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ChevronRight, ChevronLeft, CheckCircle2, Upload, Loader2,
  User, Camera, AlertCircle, Eye, EyeOff, Lock, CreditCard, X
} from 'lucide-react';
import Link from 'next/link';

const DEFAULT_CHAPTERS = [
  "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
  "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
  "Paynesville Branch","Mother Chapter",
];
const MEMBERSHIP_FEE = 100;
const MEMBERSHIP_CURRENCY = "LRD";

type Step = 1 | 2 | 3 | 4 | 5;

interface FormData {
  // Account
  full_name: string; email: string; password: string; confirmPassword: string; phone: string;
  // Background
  class_name: string; year_graduated: string; sponsor_name: string; principal_name: string; id_number: string;
  // Chapter
  chapter: string;
  // Photo
  photoFile: File | null; photoPreview: string | null;
  // Payment
  paymentMethod: 'screenshot' | 'in_person';
  screenshotFile: File | null; screenshotPreview: string | null;
}

export default function MemberRegisterPage() {
  const [chapters, setChapters]       = useState<string[]>(DEFAULT_CHAPTERS);
  const [orgName, setOrgName]         = useState('BWIAA');
  const [step, setStep]               = useState<Step>(1);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [memberId, setMemberId]       = useState('');
  const [error, setError]             = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState<FormData>({
    full_name:'', email:'', password:'', confirmPassword:'', phone:'',
    class_name:'', year_graduated:'', sponsor_name:'', principal_name:'', id_number:'',
    chapter: DEFAULT_CHAPTERS[0],
    photoFile: null, photoPreview: null,
    paymentMethod: 'screenshot', screenshotFile: null, screenshotPreview: null,
  });

  useEffect(() => {
    supabase.from('election_settings').select('*').then(({ data }) => {
      if (!data) return;
      const get = (k: string) => data.find((r: any) => r.key === k)?.value;
      if (get('org_name')) setOrgName(get('org_name'));
      if (get('chapters')) {
        try { const c = JSON.parse(get('chapters')); setChapters(c); setForm(f => ({...f, chapter: c[0]})); } catch {}
      }
    });
  }, []);

  function set(field: keyof FormData, value: any) {
    setForm(prev => ({...prev, [field]: value}));
  }

  async function compressImage(file: File, maxPx = 600): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b],'img.jpg',{type:'image/jpeg'})) : reject(), 'image/jpeg', 0.85);
      };
      img.onerror = reject; img.src = url;
    });
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const c = await compressImage(file, 500); set('photoFile', c); set('photoPreview', URL.createObjectURL(c)); }
    catch { setError('Failed to process photo.'); }
  }

  async function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const c = await compressImage(file, 1200); set('screenshotFile', c); set('screenshotPreview', URL.createObjectURL(c)); }
    catch { setError('Failed to process screenshot.'); }
  }

  const validations: Record<number, () => string> = {
    1: () => {
      if (!form.full_name.trim()) return 'Full name required.';
      if (!form.email.trim() || !form.email.includes('@')) return 'Valid email required.';
      if (form.password.length < 8) return 'Password must be at least 8 characters.';
      if (form.password !== form.confirmPassword) return 'Passwords do not match.';
      if (!form.id_number.trim()) return 'ID number required.';
      if (!form.photoFile) return 'Passport photo required.';
      return '';
    },
    2: () => {
      if (!form.class_name.trim()) return 'Class name required.';
      if (!form.year_graduated || isNaN(Number(form.year_graduated))) return 'Valid graduation year required.';
      if (!form.sponsor_name.trim()) return 'Class sponsor required.';
      if (!form.principal_name.trim()) return 'Principal name required.';
      return '';
    },
    3: () => form.chapter ? '' : 'Please select a chapter.',
    4: () => {
      if (!form.paymentMethod) return 'Please select a payment method.';
      if (form.paymentMethod === 'screenshot' && !form.screenshotFile) return 'Please upload payment proof.';
      return '';
    },
  };

  function nextStep() {
    setError('');
    const err = validations[step]?.() ?? '';
    if (err) { setError(err); return; }
    setStep(s => (s + 1) as Step);
  }

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const emailLower = form.email.trim().toLowerCase();

      // 1. Check duplicate
      const { data: existing } = await supabase.from('members').select('id,status')
        .eq('email', emailLower).maybeSingle();
      if (existing) throw new Error(existing.status === 'approved'
        ? 'This email is already a registered member. Please log in.'
        : 'An application with this email is already pending review.');

      // 2. Upload photo first (no auth needed)
      let photo_url: string | null = null;
      if (form.photoFile) {
        const fn = `members/${Date.now()}_${form.full_name.replace(/\s+/g,'_')}.jpg`;
        const { data: ud, error: ue } = await supabase.storage
          .from('candidate-photos').upload(fn, form.photoFile, { upsert: true });
        if (ue) throw new Error(`Photo upload failed: ${ue.message}`);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }

      // 3. Upload payment screenshot
      let screenshot_url: string | null = null;
      if (form.screenshotFile) {
        const fn = `membership-fees/${Date.now()}_${form.full_name.replace(/\s+/g,'_')}.jpg`;
        const { data: ud, error: ue } = await supabase.storage
          .from('payment-screenshots').upload(fn, form.screenshotFile, { upsert: true });
        if (ue) throw new Error(`Screenshot upload failed: ${ue.message}`);
        screenshot_url = supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }

      // 4. Create member profile WITHOUT auth_user_id (linked by email on first login)
      // This avoids the FK constraint error caused by unconfirmed Supabase auth accounts
      const { data: member, error: ie } = await supabase.from('members').insert([{
        full_name:      form.full_name.trim(),
        email:          emailLower,
        phone:          form.phone.trim() || null,
        class_name:     form.class_name.trim(),
        year_graduated: parseInt(form.year_graduated, 10),
        sponsor_name:   form.sponsor_name.trim(),
        principal_name: form.principal_name.trim(),
        id_number:      form.id_number.trim(),
        chapter:        form.chapter,
        chapter_locked: true,
        theme:          'system',
        photo_url,
        status:         'pending',
      }]).select().single();
      if (ie) throw new Error(`Registration failed: ${ie.message}`);

      // 5. Create Supabase Auth account (after member record, so FK never blocks)
      const { data: sd } = await supabase.auth.signUp({
        email: emailLower,
        password: form.password,
        options: { data: { full_name: form.full_name.trim() } },
      });
      // Link auth_user_id if signup succeeded immediately (no email confirm required)
      if (sd?.user) {
        await supabase.from('members').update({ auth_user_id: sd.user.id }).eq('id', member.id);
      }

      // 6. Record membership fee
      await supabase.from('dues_payments').insert([{
        member_id:      member.id,
        member_name:    member.full_name,
        chapter:        member.chapter,
        amount:         MEMBERSHIP_FEE,
        currency:       MEMBERSHIP_CURRENCY,
        period:         'Membership Registration Fee',
        payment_method: form.paymentMethod,
        screenshot_url,
        notes:          'Initial membership registration fee',
        status:         'pending',
      }]);

      // 7. Log activity
      await supabase.from('activity_log').insert([{
        member_id:   member.id,
        member_name: member.full_name,
        chapter:     member.chapter,
        action:      'Member account created',
        details:     `Joined ${member.chapter} · Fee: ${MEMBERSHIP_FEE} ${MEMBERSHIP_CURRENCY} (${form.paymentMethod === 'in_person' ? 'In Person' : 'Screenshot'})`,
      }]);

      setMemberId(member.id);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  const stepLabels = ['Account', 'Background', 'Chapter', 'Payment', 'Review'];

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3.5rem] p-10 max-w-lg w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-600"/>
        </div>
        <h1 className="text-3xl font-black uppercase italic text-slate-900 mb-3">Application Submitted!</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-5 text-left">
          <p className="text-yellow-800 font-black text-xs uppercase mb-1">Verify Your Email</p>
          <p className="text-yellow-700 text-xs font-bold leading-relaxed">
            Check <strong>{form.email}</strong> for a verification link. Your account needs email verification before you can log in.
          </p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left border border-slate-100 space-y-2">
          {[
            ['Member ID', memberId.slice(0,8).toUpperCase()],
            ['Name', form.full_name],
            ['Chapter', form.chapter],
            ['Membership Fee', `${MEMBERSHIP_FEE} ${MEMBERSHIP_CURRENCY} (${form.paymentMethod === 'in_person' ? 'In Person' : 'Screenshot'})`],
            ['Status', 'Pending Approval'],
          ].map(([l,v]) => (
            <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
              <span className={`text-xs font-black text-right max-w-[55%] ${l==='Member ID'?'text-red-600 font-mono':'text-slate-800'}`}>{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 font-bold mb-6">Your chapter admin will review your application and payment. You'll be notified when approved.</p>
        <Link href="/members/login" className="block w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-700 transition-all mb-3">
          Go to Login
        </Link>
        <Link href="/" className="block w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-200 transition-all">
          Back to Home
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 pb-20">
      <div className="max-w-2xl mx-auto mb-8 flex items-center justify-between">
        <Link href="/members" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Back</Link>
        <h1 className="text-white font-black uppercase italic text-sm">{orgName} — Create Member Account</h1>
      </div>

      {/* Step indicator */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            return (
              <div key={n} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all
                    ${step > n ? 'bg-green-500 text-white' : step === n ? 'bg-red-600 text-white' : 'bg-white/10 text-white/30'}`}>
                    {step > n ? <CheckCircle2 size={14}/> : n}
                  </div>
                  <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${step === n ? 'text-white' : 'text-white/30'}`}>{label}</p>
                </div>
                {i < 4 && <div className={`h-px flex-1 mb-4 transition-all ${step > n ? 'bg-green-500' : 'bg-white/10'}`}/>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl">

        {/* Step 1 — Account */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><Lock size={22}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Account Setup</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Create your login credentials</p>
              </div>
            </div>

            {/* Photo */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Passport-Style Photo *</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 shrink-0 flex items-center justify-center">
                  {form.photoPreview
                    ? <img src={form.photoPreview} className="w-full h-full object-cover" alt="Preview"/>
                    : <Camera size={24} className="text-slate-300"/>}
                </div>
                <label className="flex-1 cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-5 text-center transition-all">
                  <Upload size={20} className="mx-auto mb-2 text-slate-400"/>
                  <p className="text-sm font-bold text-slate-500">{form.photoFile ? form.photoFile.name : 'Click to upload photo'}</p>
                  <p className="text-xs text-slate-400 mt-1">Auto-compressed · JPG, PNG</p>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhoto}/>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Full Name *</label>
                <input value={form.full_name} onChange={e=>set('full_name',e.target.value)} placeholder="As on your ID"
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">ID Number *</label>
                <input value={form.id_number} onChange={e=>set('id_number',e.target.value)} placeholder="National ID / Passport"
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Phone Number</label>
                <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+231 xxx" type="tel"
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Email Address *</label>
                <input value={form.email} onChange={e=>set('email',e.target.value)} type="email" placeholder="your@email.com"
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Password * (min 8 chars)</label>
                <div className="relative">
                  <input value={form.password} onChange={e=>set('password',e.target.value)} type={showPass?'text':'password'} placeholder="Min 8 characters"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 pr-12 font-bold outline-none"/>
                  <button type="button" onClick={()=>setShowPass(p=>!p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPass?<EyeOff size={18}/>:<Eye size={18}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Confirm Password *</label>
                <div className="relative">
                  <input value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} type={showConfirm?'text':'password'} placeholder="Repeat password"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 pr-12 font-bold outline-none"/>
                  <button type="button" onClick={()=>setShowConfirm(p=>!p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    {showConfirm?<EyeOff size={18}/>:<Eye size={18}/>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Academic Background */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><User size={22}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Academic Background</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Required for screening and verification by EC</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {l:'Class Name *', f:'class_name', ph:'e.g. The Magnificent'},
                {l:'Year Graduated *', f:'year_graduated', ph:'e.g. 1998', t:'number'},
                {l:'Class Sponsor *', f:'sponsor_name', ph:'Full name'},
                {l:'Principal *', f:'principal_name', ph:'Full name'},
              ].map(({l,f,ph,t='text'}) => (
                <div key={f}>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{l}</label>
                  <input type={t} value={(form as any)[f]} onChange={e=>set(f as any, e.target.value)} placeholder={ph}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Chapter */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><CheckCircle2 size={22}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Select Your Chapter</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Permanent — only admin can transfer you</p>
              </div>
            </div>
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 font-black text-sm">⚠ Your chapter is permanent</p>
              <p className="text-amber-700 text-xs font-bold mt-1 leading-relaxed">
                All your records, dues, and activity will be permanently tied to this chapter. Choose carefully.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chapters.map(ch => (
                <button key={ch} onClick={() => set('chapter', ch)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all ${form.chapter===ch?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                  <p className={`font-black text-sm ${form.chapter===ch?'text-red-700':'text-slate-800'}`}>{ch}</p>
                  {form.chapter===ch && <p className="text-red-500 text-xs font-bold mt-1">✓ Selected</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 — Payment */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><CreditCard size={22}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Membership Fee</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">One-time registration fee</p>
              </div>
            </div>

            {/* Fee display */}
            <div className="bg-slate-900 rounded-2xl p-6 text-center">
              <p className="text-white/50 text-xs font-black uppercase tracking-widest mb-1">Amount Due</p>
              <p className="text-5xl font-black text-red-500">{MEMBERSHIP_FEE} <span className="text-2xl">{MEMBERSHIP_CURRENCY}</span></p>
              <p className="text-white/40 text-xs font-bold mt-2">One-time membership registration fee · {form.chapter}</p>
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Payment Method *</label>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => set('paymentMethod', 'screenshot')}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${form.paymentMethod==='screenshot'?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                  <Upload size={22} className={`mb-3 ${form.paymentMethod==='screenshot'?'text-red-600':'text-slate-400'}`}/>
                  <p className="font-black text-slate-800 text-sm">Upload Screenshot</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Transfer & upload proof</p>
                </button>
                <button onClick={() => set('paymentMethod', 'in_person')}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${form.paymentMethod==='in_person'?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                  <User size={22} className={`mb-3 ${form.paymentMethod==='in_person'?'text-red-600':'text-slate-400'}`}/>
                  <p className="font-black text-slate-800 text-sm">Pay In Person</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Meet your chapter admin</p>
                </button>
              </div>
            </div>

            {form.paymentMethod === 'screenshot' && (
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Payment Proof *</label>
                {form.screenshotPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs">
                    <img src={form.screenshotPreview} className="w-full max-h-48 object-cover" alt="Screenshot"/>
                    <button onClick={() => { set('screenshotFile', null); set('screenshotPreview', null); }}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1">
                      <X size={14}/>
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center h-32 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                    <Upload size={22} className="text-slate-400 mb-2"/>
                    <p className="text-sm font-bold text-slate-500">Upload payment screenshot</p>
                    <input type="file" accept="image/*" className="hidden" onChange={handleScreenshot}/>
                  </label>
                )}
              </div>
            )}

            {form.paymentMethod === 'in_person' && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
                <p className="font-black text-yellow-800 text-sm">📋 In-Person Payment</p>
                <p className="text-yellow-700 text-xs font-bold mt-2 leading-relaxed">
                  Contact your chapter administrator after submitting this form to pay the {MEMBERSHIP_FEE} {MEMBERSHIP_CURRENCY} fee.
                  Your application stays pending until payment is confirmed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5 — Review */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-green-600 text-white p-3 rounded-2xl shrink-0"><CheckCircle2 size={22}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Review & Submit</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Confirm everything is correct</p>
              </div>
            </div>

            {form.photoPreview && (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                <img src={form.photoPreview} className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200" alt="Photo"/>
                <div>
                  <p className="font-black text-slate-800">{form.full_name}</p>
                  <p className="text-xs text-red-600 font-bold uppercase">{form.chapter}</p>
                  <p className="text-xs text-slate-400 font-bold">{form.email}</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application Summary</p>
              {[
                ['Full Name', form.full_name],
                ['Email', form.email],
                ['ID Number', form.id_number],
                ['Class Name', form.class_name],
                ['Year Graduated', form.year_graduated],
                ['Class Sponsor', form.sponsor_name],
                ['Principal', form.principal_name],
                ['Chapter', form.chapter],
                ['Membership Fee', `${MEMBERSHIP_FEE} ${MEMBERSHIP_CURRENCY}`],
                ['Payment Method', form.paymentMethod === 'in_person' ? 'In Person' : 'Screenshot Uploaded'],
              ].map(([l,v]) => (
                <div key={l} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className="text-xs font-black text-slate-800 text-right max-w-[55%]">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-blue-800 text-xs font-bold leading-relaxed">
                By submitting, you confirm all information is accurate. Your account will be created and your
                application sent to your chapter administrator for review.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 mt-4">
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/>
            <p className="text-red-700 text-sm font-bold">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button onClick={() => { setStep(s => (s-1) as Step); setError(''); }}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-6 py-4 rounded-2xl transition-all text-sm">
              <ChevronLeft size={16}/> Back
            </button>
          )}
          {step < 5 ? (
            <button onClick={nextStep}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm">
              Continue <ChevronRight size={16}/>
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm disabled:opacity-50">
              {submitting ? <><Loader2 size={16} className="animate-spin"/> Creating Account...</> : <><CheckCircle2 size={16}/> Submit Application</>}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 font-bold mt-4">
          Already have an account?{' '}
          <Link href="/members/login" className="text-red-600 hover:underline font-black">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
