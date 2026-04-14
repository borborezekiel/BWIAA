"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ChevronRight, ChevronLeft, CheckCircle2, Upload, Loader2,
  User, FileText, CreditCard, AlertCircle, Camera, X
} from 'lucide-react';
import Link from 'next/link';

// ── Dynamic config loaded from Supabase election_settings ─────────────────────
interface PositionFee { position: string; fee: number; }
interface ElectionConfig {
  org_name: string; election_title: string; election_year: string;
  currency: string; currency_symbol: string;
  chapters: string[]; positions_fees: PositionFee[];
}

const DEFAULT_CONFIG: ElectionConfig = {
  org_name: "BWIAA", election_title: "National Alumni Election", election_year: "2026",
  currency: "USD", currency_symbol: "$",
  chapters: [
    "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
    "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
    "Paynesville Branch","Mother Chapter",
  ],
  positions_fees: [
    { position: "President", fee: 2000 },
    { position: "Vice President for Administration", fee: 1500 },
    { position: "Vice President for Operations", fee: 1500 },
    { position: "Secretary General", fee: 1000 },
    { position: "Financial Secretary", fee: 1000 },
    { position: "Treasurer", fee: 500 },
    { position: "Parliamentarian", fee: 500 },
    { position: "Chaplain", fee: 500 },
  ],
};

async function loadConfig(): Promise<ElectionConfig> {
  const { data } = await supabase.from('election_settings').select('*');
  if (!data) return DEFAULT_CONFIG;
  const get = (k: string) => data.find((r: any) => r.key === k)?.value;
  const merged = { ...DEFAULT_CONFIG };
  if (get('org_name'))        merged.org_name        = get('org_name');
  if (get('election_title'))  merged.election_title  = get('election_title');
  if (get('election_year'))   merged.election_year   = get('election_year');
  if (get('currency'))        merged.currency        = get('currency');
  if (get('currency_symbol')) merged.currency_symbol = get('currency_symbol');
  if (get('chapters'))        { try { merged.chapters = JSON.parse(get('chapters')); } catch {} }
  if (get('positions_fees'))  { try { merged.positions_fees = JSON.parse(get('positions_fees')); } catch {} }
  return merged;
}

type Step = 1 | 2 | 3 | 4;

interface FormData {
  full_name: string; dob: string; class_name: string;
  year_graduated: string; sponsor_name: string; principal_name: string;
  id_number: string; applicant_email: string;
  chapter: string; position_name: string;
  photoFile: File | null; photoPreview: string | null;
  payment_method: 'screenshot' | 'in_person' | '';
  screenshotFiles: (File | null)[]; screenshotPreviews: (string | null)[];
}

export default function RegisterPage() {
  const [config, setConfig]   = useState<ElectionConfig>(DEFAULT_CONFIG);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [step, setStep]       = useState<Step>(1);
  const [form, setForm]       = useState<FormData>({
    full_name: '', dob: '', class_name: '', year_graduated: '',
    sponsor_name: '', principal_name: '', id_number: '', applicant_email: '',
    chapter: DEFAULT_CONFIG.chapters[0], position_name: DEFAULT_CONFIG.positions_fees[0].position,
    photoFile: null, photoPreview: null,
    payment_method: '', screenshotFiles: [null, null, null], screenshotPreviews: [null, null, null],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [appId, setAppId]           = useState('');
  const [error, setError]           = useState('');

  // Load dynamic config on mount
  useEffect(() => {
    loadConfig().then(cfg => {
      setConfig(cfg);
      setForm(prev => ({
        ...prev,
        chapter: cfg.chapters[0] ?? prev.chapter,
        position_name: cfg.positions_fees[0]?.position ?? prev.position_name,
      }));
      setCfgLoaded(true);
    });
  }, []);

  const fee = config.positions_fees.find(p => p.position === form.position_name)?.fee ?? 0;

  function set(field: keyof FormData, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // ── Image compression ────────────────────────────────────────────────────────
  async function compressImage(file: File, maxPx = 600, quality = 0.82): Promise<File> {
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
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 500, 0.85);
    set('photoFile', compressed);
    set('photoPreview', URL.createObjectURL(compressed));
  }

  async function handleScreenshotSelect(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 1200, 0.88);
    const files = [...form.screenshotFiles]; files[idx] = compressed;
    const previews = [...form.screenshotPreviews]; previews[idx] = URL.createObjectURL(compressed);
    set('screenshotFiles', files); set('screenshotPreviews', previews);
  }

  function removeScreenshot(idx: number) {
    const files = [...form.screenshotFiles]; files[idx] = null;
    const previews = [...form.screenshotPreviews]; previews[idx] = null;
    set('screenshotFiles', files); set('screenshotPreviews', previews);
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validateStep1() {
    if (!form.full_name.trim()) return 'Full name is required.';
    if (!form.dob) return 'Date of birth is required.';
    if (!form.class_name.trim()) return 'Class name is required.';
    if (!form.year_graduated || isNaN(Number(form.year_graduated))) return 'Valid graduation year required.';
    if (!form.sponsor_name.trim()) return 'Class sponsor name is required.';
    if (!form.principal_name.trim()) return 'Principal name is required.';
    if (!form.id_number.trim()) return 'ID number is required.';
    if (!form.applicant_email.trim() || !form.applicant_email.includes('@')) return 'Valid email required.';
    if (!form.photoFile) return 'Passport-style photo is required.';
    return '';
  }

  function validateStep2() {
    if (!form.chapter) return 'Please select your chapter.';
    if (!form.position_name) return 'Please select a position.';
    return '';
  }

  function validateStep3() {
    if (!form.payment_method) return 'Please select a payment method.';
    if (form.payment_method === 'screenshot') {
      const hasOne = form.screenshotFiles.some(f => f !== null);
      if (!hasOne) return 'Please upload at least one payment screenshot.';
    }
    return '';
  }

  function nextStep() {
    setError('');
    let err = '';
    if (step === 1) err = validateStep1();
    if (step === 2) err = validateStep2();
    if (step === 3) err = validateStep3();
    if (err) { setError(err); return; }
    setStep(s => (s + 1) as Step);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function submit() {
    setSubmitting(true); setError('');
    try {
      // Upload profile photo
      let photo_url = '';
      if (form.photoFile) {
        const { data, error: upErr } = await supabase.storage.from('candidate-photos')
          .upload(`applicants/${Date.now()}_${form.full_name.replace(/\s+/g,'_')}.jpg`, form.photoFile, { upsert: true });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(data.path).data.publicUrl;
      }

      // Upload payment screenshots
      const screenshotUrls: string[] = [];
      for (let i = 0; i < 3; i++) {
        const file = form.screenshotFiles[i];
        if (!file) continue;
        const { data, error: upErr } = await supabase.storage.from('payment-screenshots')
          .upload(`${Date.now()}_${i}_${form.full_name.replace(/\s+/g,'_')}.jpg`, file, { upsert: true });
        if (upErr) throw new Error(`Screenshot upload failed: ${upErr.message}`);
        screenshotUrls.push(supabase.storage.from('payment-screenshots').getPublicUrl(data.path).data.publicUrl);
      }

      // Insert application
      const { data, error: insertErr } = await supabase.from('candidate_applications').insert([{
        full_name: form.full_name.trim(),
        dob: form.dob,
        class_name: form.class_name.trim(),
        year_graduated: parseInt(form.year_graduated),
        sponsor_name: form.sponsor_name.trim(),
        principal_name: form.principal_name.trim(),
        id_number: form.id_number.trim(),
        applicant_email: form.applicant_email.trim().toLowerCase(),
        chapter: form.chapter,
        position_name: form.position_name,
        payment_method: form.payment_method,
        photo_url,
        payment_screenshot_1: screenshotUrls[0] ?? null,
        payment_screenshot_2: screenshotUrls[1] ?? null,
        payment_screenshot_3: screenshotUrls[2] ?? null,
        status: 'pending',
      }]).select().single();

      if (insertErr) throw new Error(insertErr.message);
      setAppId(data.id);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading config ────────────────────────────────────────────────────────────
  if (!cfgLoaded) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-4 text-white">
      <Loader2 className="animate-spin text-red-600" size={36}/>
      <span className="font-black uppercase tracking-widest text-sm">Loading Registration Form...</span>
    </div>
  );

  // ── Success screen ───────────────────────────────────────────────────────────
  if (submitted) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3.5rem] p-10 md:p-16 max-w-lg w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-600"/>
        </div>
        <h1 className="text-3xl font-black uppercase italic text-slate-900 mb-3">Application Submitted!</h1>
        <p className="text-slate-500 font-bold mb-6 leading-relaxed">
          Your application has been sent to your chapter chairperson for review. You will be notified once it's approved.
        </p>
        <div className="bg-slate-50 rounded-2xl p-5 mb-8 text-left space-y-2 border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Application Details</p>
          <Row label="Application ID" value={appId.slice(0,8).toUpperCase()}/>
          <Row label="Name" value={form.full_name}/>
          <Row label="Position" value={form.position_name}/>
          <Row label="Chapter" value={form.chapter}/>
          <Row label="Payment" value={form.payment_method === 'in_person' ? 'In Person' : 'Screenshot Uploaded'}/>
          <Row label="Status" value="Pending Review"/>
        </div>
        <p className="text-xs text-slate-400 font-bold mb-6">
          Save your Application ID: <span className="font-black text-slate-700">{appId.slice(0,8).toUpperCase()}</span> — use it to check your status.
        </p>
        <div className="flex flex-col gap-3">
          <Link href={`/register/status?id=${appId.slice(0,8).toUpperCase()}`}
            className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-700 transition-all">
            Check Application Status
          </Link>
          <Link href="/" className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-200 transition-all">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 pb-20">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 flex items-center justify-between">
        <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all">← Back</Link>
        <h1 className="text-white font-black uppercase italic text-sm">{config.org_name} {config.election_year} — Candidate Registration</h1>
      </div>

      {/* Step indicator */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center gap-0">
          {[
            { n: 1, label: 'Personal Info' },
            { n: 2, label: 'Position' },
            { n: 3, label: 'Payment' },
            { n: 4, label: 'Review' },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all
                  ${step > n ? 'bg-green-500 text-white' : step === n ? 'bg-red-600 text-white' : 'bg-white/10 text-white/30'}`}>
                  {step > n ? <CheckCircle2 size={16}/> : n}
                </div>
                <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${step === n ? 'text-white' : 'text-white/30'}`}>{label}</p>
              </div>
              {i < 3 && <div className={`h-px flex-1 mb-4 transition-all ${step > n ? 'bg-green-500' : 'bg-white/10'}`}/>}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl">

        {/* ── STEP 1: Personal Info ── */}
        {step === 1 && (
          <div className="space-y-6">
            <StepHeader icon={<User size={24}/>} title="Personal Information" sub="Fill in your details exactly as they appear on your ID"/>

            {/* Photo upload */}
            <div>
              <Label>Passport-Style Photo *</Label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 shrink-0 flex items-center justify-center">
                  {form.photoPreview
                    ? <img src={form.photoPreview} className="w-full h-full object-cover" alt="Photo"/>
                    : <Camera size={24} className="text-slate-300"/>}
                </div>
                <label className="flex-1 cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-6 text-center transition-all">
                  <Upload size={20} className="mx-auto mb-2 text-slate-400"/>
                  <p className="text-sm font-bold text-slate-500">{form.photoFile ? form.photoFile.name : 'Click to upload photo'}</p>
                  <p className="text-xs text-slate-400 mt-1">Auto-compressed • JPG, PNG</p>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect}/>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name *" value={form.full_name} onChange={v => set('full_name', v)} placeholder="As on your ID"/>
              <Field label="Email Address *" value={form.applicant_email} onChange={v => set('applicant_email', v)} placeholder="your@email.com" type="email"/>
              <Field label="Date of Birth *" value={form.dob} onChange={v => set('dob', v)} type="date"/>
              <Field label="ID Number *" value={form.id_number} onChange={v => set('id_number', v)} placeholder="National ID / Passport No."/>
              <Field label="Class Name *" value={form.class_name} onChange={v => set('class_name', v)} placeholder="e.g. The Magnificent"/>
              <Field label="Year Graduated *" value={form.year_graduated} onChange={v => set('year_graduated', v)} placeholder="e.g. 1998" type="number"/>
              <Field label="Name of Class Sponsor *" value={form.sponsor_name} onChange={v => set('sponsor_name', v)} placeholder="Full name"/>
              <Field label="Name of Principal *" value={form.principal_name} onChange={v => set('principal_name', v)} placeholder="Full name"/>
            </div>
          </div>
        )}

        {/* ── STEP 2: Chapter & Position ── */}
        {step === 2 && (
          <div className="space-y-6">
            <StepHeader icon={<FileText size={24}/>} title="Chapter & Position" sub="Select the chapter you belong to and the position you're running for"/>
            <div>
              <Label>Your Chapter *</Label>
              <select value={form.chapter} onChange={e => set('chapter', e.target.value)}
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none">
                {config.chapters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Position You Are Running For *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {config.positions_fees.map(pf => (
                  <button key={pf.position} onClick={() => set('position_name', pf.position)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${form.position_name === pf.position ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-black text-slate-800 text-sm">{pf.position}</p>
                    <p className="text-red-600 font-black text-xs mt-1">{config.currency_symbol}{pf.fee.toLocaleString()} registration fee</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Payment ── */}
        {step === 3 && (
          <div className="space-y-6">
            <StepHeader icon={<CreditCard size={24}/>} title="Registration Payment" sub={`Fee for ${form.position_name}: ${config.currency_symbol}${fee.toLocaleString()} ${config.currency}`}/>
            <div className="bg-slate-900 rounded-2xl p-6 text-center">
              <p className="text-white/50 text-xs font-black uppercase tracking-widest mb-1">Amount Due</p>
              <p className="text-5xl font-black text-red-500">{config.currency_symbol}{fee.toLocaleString()}</p>
              <p className="text-white/40 text-xs font-bold mt-2">{form.position_name} — {form.chapter}</p>
            </div>
            <div>
              <Label>Choose Payment Method *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => set('payment_method', 'screenshot')}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${form.payment_method === 'screenshot' ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <Upload size={24} className="text-red-600 mb-3"/>
                  <p className="font-black text-slate-800">Upload Screenshots</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Transfer payment and upload up to 3 proof screenshots for chairperson review</p>
                </button>
                <button onClick={() => set('payment_method', 'in_person')}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${form.payment_method === 'in_person' ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <User size={24} className="text-slate-600 mb-3"/>
                  <p className="font-black text-slate-800">Pay In Person</p>
                  <p className="text-xs text-slate-500 font-bold mt-1">Meet your chapter chairperson directly and hand over the amount in cash</p>
                </button>
              </div>
            </div>

            {/* Screenshot upload */}
            {form.payment_method === 'screenshot' && (
              <div>
                <Label>Payment Screenshots (up to 3) *</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="relative">
                      {form.screenshotPreviews[i] ? (
                        <div className="relative rounded-2xl overflow-hidden border-2 border-green-400">
                          <img src={form.screenshotPreviews[i]!} className="w-full h-28 object-cover" alt={`Screenshot ${i+1}`}/>
                          <button onClick={() => removeScreenshot(i)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5">
                            <X size={12}/>
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center h-28 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                          <Upload size={18} className="text-slate-400 mb-1"/>
                          <p className="text-[10px] font-black text-slate-400 uppercase">Screenshot {i+1}</p>
                          <input type="file" accept="image/*" className="hidden" onChange={e => handleScreenshotSelect(i, e)}/>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 font-bold mt-2">
                  Upload screenshots of your mobile money, bank transfer, or any other payment proof.
                </p>
              </div>
            )}

            {form.payment_method === 'in_person' && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5">
                <p className="font-black text-yellow-800 text-sm">📋 In-Person Payment Instructions</p>
                <p className="text-yellow-700 text-xs font-bold mt-2 leading-relaxed">
                  After submitting this form, contact your chapter chairperson to arrange payment.
                  Your application will remain <strong>pending</strong> until the chairperson confirms your payment and approves your application.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Review & Submit ── */}
        {step === 4 && (
          <div className="space-y-6">
            <StepHeader icon={<CheckCircle2 size={24}/>} title="Review & Submit" sub="Confirm everything is correct before submitting"/>

            {form.photoPreview && (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                <img src={form.photoPreview} className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200" alt="Photo"/>
                <div>
                  <p className="font-black text-slate-800">{form.full_name}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase">{form.position_name} — {form.chapter}</p>
                </div>
              </div>
            )}

            <div className="space-y-2 bg-slate-50 rounded-2xl p-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application Summary</p>
              <Row label="Full Name" value={form.full_name}/>
              <Row label="Email" value={form.applicant_email}/>
              <Row label="Date of Birth" value={form.dob}/>
              <Row label="ID Number" value={form.id_number}/>
              <Row label="Class Name" value={form.class_name}/>
              <Row label="Year Graduated" value={form.year_graduated}/>
              <Row label="Class Sponsor" value={form.sponsor_name}/>
              <Row label="Principal" value={form.principal_name}/>
              <Row label="Chapter" value={form.chapter}/>
              <Row label="Position" value={form.position_name}/>
              <Row label="Registration Fee" value={`${config.currency_symbol}${fee.toLocaleString()} ${config.currency}`}/>
              <Row label="Payment Method" value={form.payment_method === 'in_person' ? 'In Person' : `${form.screenshotFiles.filter(Boolean).length} screenshot(s) uploaded`}/>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-blue-800 text-xs font-bold leading-relaxed">
                By submitting, you confirm that all information provided is accurate and truthful.
                False information may result in disqualification. Your application will be reviewed by your chapter chairperson.
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
            <button onClick={() => { setStep(s => (s - 1) as Step); setError(''); }}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-6 py-4 rounded-2xl transition-all text-sm">
              <ChevronLeft size={16}/> Back
            </button>
          )}
          {step < 4 ? (
            <button onClick={nextStep}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm">
              Continue <ChevronRight size={16}/>
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm disabled:opacity-50">
              {submitting ? <><Loader2 size={16} className="animate-spin"/> Submitting...</> : <><CheckCircle2 size={16}/> Submit Application</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────
function StepHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-4 mb-2">
      <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0">{icon}</div>
      <div>
        <h2 className="text-2xl font-black uppercase italic text-slate-900">{title}</h2>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{sub}</p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{children}</label>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <span className="text-xs font-black text-slate-800 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
