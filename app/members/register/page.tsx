"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ChevronRight, ChevronLeft, CheckCircle2, Upload,
  Loader2, User, Camera, AlertCircle, X
} from 'lucide-react';
import Link from 'next/link';

const DEFAULT_CHAPTERS = [
  "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
  "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
  "Paynesville Branch","Mother Chapter",
];

type Step = 1 | 2 | 3;

interface FormData {
  full_name: string; email: string; phone: string;
  class_name: string; year_graduated: string;
  sponsor_name: string; principal_name: string;
  id_number: string; chapter: string;
  photoFile: File | null; photoPreview: string | null;
}

export default function MemberRegisterPage() {
  const [chapters, setChapters]     = useState<string[]>(DEFAULT_CHAPTERS);
  const [orgName, setOrgName]       = useState('BWIAA');
  const [step, setStep]             = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [memberId, setMemberId]     = useState('');
  const [error, setError]           = useState('');
  const [form, setForm] = useState<FormData>({
    full_name: '', email: '', phone: '', class_name: '',
    year_graduated: '', sponsor_name: '', principal_name: '',
    id_number: '', chapter: DEFAULT_CHAPTERS[0],
    photoFile: null, photoPreview: null,
  });

  useEffect(() => {
    supabase.from('election_settings').select('*').then(({ data }) => {
      if (!data) return;
      const get = (k: string) => data.find((r: any) => r.key === k)?.value;
      if (get('org_name')) setOrgName(get('org_name'));
      if (get('chapters')) { try { const c = JSON.parse(get('chapters')); setChapters(c); setForm(f => ({ ...f, chapter: c[0] })); } catch {} }
    });
  }, []);

  function set(field: keyof FormData, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 500;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      set('photoFile', compressed);
      set('photoPreview', URL.createObjectURL(compressed));
    } catch { setError('Failed to process photo. Please try another image.'); }
  }

  function validateStep1() {
    if (!form.full_name.trim()) return 'Full name is required.';
    if (!form.email.trim() || !form.email.includes('@')) return 'Valid email is required.';
    if (!form.id_number.trim()) return 'ID number is required.';
    if (!form.photoFile) return 'A passport-style photo is required.';
    return '';
  }

  function validateStep2() {
    if (!form.class_name.trim()) return 'Class name is required.';
    if (!form.year_graduated || isNaN(Number(form.year_graduated))) return 'Valid graduation year is required.';
    if (!form.sponsor_name.trim()) return 'Class sponsor name is required.';
    if (!form.principal_name.trim()) return 'Principal name is required.';
    if (!form.chapter) return 'Please select your chapter.';
    return '';
  }

  function nextStep() {
    setError('');
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : '';
    if (err) { setError(err); return; }
    setStep(s => (s + 1) as Step);
  }

  async function submit() {
    setSubmitting(true); setError('');
    try {
      // Check for duplicate email
      const { data: existing } = await supabase
        .from('members').select('id, status').eq('email', form.email.trim().toLowerCase()).maybeSingle();
      if (existing) {
        setError(existing.status === 'approved'
          ? 'This email is already a registered member.'
          : 'An application with this email is already pending review.');
        setSubmitting(false); return;
      }

      // Upload photo
      let photo_url: string | null = null;
      if (form.photoFile) {
        const fileName = `members/${Date.now()}_${form.full_name.replace(/\s+/g, '_')}.jpg`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('candidate-photos').upload(fileName, form.photoFile, { upsert: true });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(upData.path).data.publicUrl;
      }

      const { data, error: insertErr } = await supabase.from('members').insert([{
        full_name:      form.full_name.trim(),
        email:          form.email.trim().toLowerCase(),
        phone:          form.phone.trim() || null,
        class_name:     form.class_name.trim(),
        year_graduated: parseInt(form.year_graduated, 10),
        sponsor_name:   form.sponsor_name.trim(),
        principal_name: form.principal_name.trim(),
        id_number:      form.id_number.trim(),
        chapter:        form.chapter,
        photo_url,
        status:         'pending',
      }]).select().single();

      if (insertErr) throw new Error(`Registration failed: ${insertErr.message}`);

      // Log activity
      await supabase.from('activity_log').insert([{
        member_id:   data.id,
        member_name: data.full_name,
        chapter:     data.chapter,
        action:      'Member registration submitted',
        details:     `Applied to join ${data.chapter}`,
      }]);

      setMemberId(data.id);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3.5rem] p-10 md:p-14 max-w-lg w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-600"/>
        </div>
        <h1 className="text-3xl font-black uppercase italic text-slate-900 mb-3">Registration Submitted!</h1>
        <p className="text-slate-500 font-bold mb-6 leading-relaxed text-sm">
          Your membership application has been received and is now pending approval by your chapter administrator.
          You will be notified once reviewed.
        </p>
        <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application Summary</p>
          {[
            ['Member ID', memberId.slice(0,8).toUpperCase()],
            ['Name', form.full_name],
            ['Chapter', form.chapter],
            ['Class', `${form.class_name} — ${form.year_graduated}`],
            ['Status', 'Pending Approval'],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
              <span className={`text-xs font-black text-right max-w-[60%] ${l === 'Member ID' ? 'text-red-600 font-mono' : 'text-slate-800'}`}>{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 font-bold mb-6">
          Save your Member ID: <span className="font-mono font-black text-slate-700">{memberId.slice(0,8).toUpperCase()}</span>
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/members" className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm hover:bg-slate-700 transition-all">
            View Member Portal
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
        <h1 className="text-white font-black uppercase italic text-sm">{orgName} — Member Registration</h1>
      </div>

      {/* Step indicator */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center">
          {[{n:1,label:'Personal Info'},{n:2,label:'Background'},{n:3,label:'Review'}].map(({n,label},i) => (
            <div key={n} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-all
                  ${step > n ? 'bg-green-500 text-white' : step === n ? 'bg-red-600 text-white' : 'bg-white/10 text-white/30'}`}>
                  {step > n ? <CheckCircle2 size={16}/> : n}
                </div>
                <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${step === n ? 'text-white' : 'text-white/30'}`}>{label}</p>
              </div>
              {i < 2 && <div className={`h-px flex-1 mb-4 transition-all ${step > n ? 'bg-green-500' : 'bg-white/10'}`}/>}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl">

        {/* Step 1 — Personal Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><User size={24}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Personal Information</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Fill in your details exactly as they appear on your ID</p>
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
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect}/>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Full Name *', field: 'full_name', placeholder: 'As on your ID' },
                { label: 'Email Address *', field: 'email', placeholder: 'your@email.com', type: 'email' },
                { label: 'Phone Number', field: 'phone', placeholder: '+231 xxx xxx xxxx', type: 'tel' },
                { label: 'ID Number *', field: 'id_number', placeholder: 'National ID / Passport' },
              ].map(({ label, field, placeholder, type = 'text' }) => (
                <div key={field}>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{label}</label>
                  <input type={type} value={(form as any)[field]} onChange={e => set(field as keyof FormData, e.target.value)}
                    placeholder={placeholder}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Academic Background & Chapter */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-red-600 text-white p-3 rounded-2xl shrink-0"><CheckCircle2 size={24}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Academic Background</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Used for screening and verification by the EC</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Class Name *', field: 'class_name', placeholder: 'e.g. The Magnificent' },
                { label: 'Year Graduated *', field: 'year_graduated', placeholder: 'e.g. 1998', type: 'number' },
                { label: 'Name of Class Sponsor *', field: 'sponsor_name', placeholder: 'Full name' },
                { label: 'Name of Principal *', field: 'principal_name', placeholder: 'Full name' },
              ].map(({ label, field, placeholder, type = 'text' }) => (
                <div key={field}>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{label}</label>
                  <input type={type} value={(form as any)[field]} onChange={e => set(field as keyof FormData, e.target.value)}
                    placeholder={placeholder}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Your Chapter *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {chapters.map(ch => (
                  <button key={ch} onClick={() => set('chapter', ch)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${form.chapter === ch ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className={`font-black text-sm ${form.chapter === ch ? 'text-red-700' : 'text-slate-800'}`}>{ch}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 mb-2">
              <div className="bg-green-600 text-white p-3 rounded-2xl shrink-0"><CheckCircle2 size={24}/></div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Review & Submit</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Confirm your information before submitting</p>
              </div>
            </div>

            {form.photoPreview && (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                <img src={form.photoPreview} className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200" alt="Photo"/>
                <div>
                  <p className="font-black text-slate-800">{form.full_name}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase">{form.chapter}</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application Summary</p>
              {[
                ['Full Name', form.full_name],
                ['Email', form.email],
                ['Phone', form.phone || '—'],
                ['ID Number', form.id_number],
                ['Class Name', form.class_name],
                ['Year Graduated', form.year_graduated],
                ['Class Sponsor', form.sponsor_name],
                ['Principal', form.principal_name],
                ['Chapter', form.chapter],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className="text-xs font-black text-slate-800 text-right max-w-[55%]">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-blue-800 text-xs font-bold leading-relaxed">
                By submitting, you confirm all information is accurate. Your application will be reviewed by your chapter
                administrator before your membership is activated.
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
          {step < 3 ? (
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
