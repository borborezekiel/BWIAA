"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, CheckCircle2, Loader2, Upload, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const MEMBER_TYPES = [
  { value: 'supporting',  label: 'Supporting Member',   desc: 'Individual supporter of BWIAA and its mission' },
  { value: 'honorary',    label: 'Honorary Member',     desc: 'Distinguished individual recognized by BWIAA' },
  { value: 'affiliate',   label: 'Affiliate Member',    desc: 'Alumni from related institutions' },
  { value: 'corporate',   label: 'Corporate Member',    desc: 'Business or organization supporting BWIAA' },
];

export default function AssociatedRegisterPage() {
  const [step, setStep]           = useState<'form'|'success'>('form');
  const [fullName, setFullName]   = useState('');
  const [orgName, setOrgName]     = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [address, setAddress]     = useState('');
  const [memberType, setMemberType] = useState('supporting');
  const [photoFile, setPhotoFile] = useState<File|null>(null);
  const [photoPreview, setPhotoPreview] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve,reject) => {
      const img = new window.Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX=800; let {width,height}=img;
        if(width>MAX||height>MAX){if(width>height){height=Math.round(height*MAX/width);width=MAX;}else{width=Math.round(width*MAX/height);height=MAX;}}
        const c=document.createElement('canvas'); c.width=width; c.height=height;
        c.getContext('2d')!.drawImage(img,0,0,width,height); URL.revokeObjectURL(url);
        c.toBlob(b=>b?resolve(new File([b],'photo.jpg',{type:'image/jpeg'})):reject(),'image/jpeg',0.88);
      }; img.onerror=reject; img.src=url;
    });
  }

  async function submit() {
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Valid email is required.'); return; }
    setSubmitting(true); setError('');
    try {
      let photo_url: string|null = null;
      if (photoFile) {
        const fn = `associated/${Date.now()}_${email.replace(/[^a-z0-9]/gi,'_')}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('candidate-photos').upload(fn, photoFile, {upsert:true});
        if (ue) throw new Error(ue.message);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }
      const { error: ie } = await supabase.from('associated_members').insert([{
        full_name: fullName.trim(),
        organization_name: orgName.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        member_type: memberType,
        photo_url, status: 'pending',
      }]);
      if (ie) {
        if (ie.code === '23505') throw new Error('This email is already registered as an associated member.');
        throw new Error(ie.message);
      }
      setStep('success');
    } catch(e:any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (step === 'success') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <CheckCircle2 size={56} className="text-green-600 mx-auto mb-5"/>
        <h2 className="text-3xl font-black uppercase italic text-slate-900 mb-2">Application Received!</h2>
        <p className="text-slate-500 font-bold text-sm leading-relaxed mb-6">
          Thank you for applying to become an associated member of BWIAA. Your application is under review and you will be contacted once a decision is made.
        </p>
        <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2">
          {[['Name',fullName],['Email',email],['Type',MEMBER_TYPES.find(t=>t.value===memberType)?.label??memberType],['Status','Pending Review']].map(([l,v])=>(
            <div key={l} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
              <span className="text-xs font-black text-slate-800">{v}</span>
            </div>
          ))}
        </div>
        <Link href="/" className="block w-full bg-slate-900 text-white font-black uppercase py-4 rounded-2xl text-sm">Back to Home</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl"><Users size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">Associated Member Registration</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">BWIAA Community — Supporting Partners</p>
            </div>
          </div>
          <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Home</Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-8 space-y-6">
        {/* Info banner */}
        <div className="bg-blue-950 border border-blue-800 rounded-[2rem] p-6">
          <h2 className="text-blue-300 font-black uppercase tracking-widest text-sm mb-2">About Associated Membership</h2>
          <p className="text-blue-400 font-bold text-xs leading-relaxed">
            Associated membership is open to supporters, partners, honorary members and corporate sponsors of BWIAA who are not alumni of Booker Washington Institute. 
            Associated members enjoy access to community resources, events and BWIAA communications but do not vote in national elections.
          </p>
        </div>

        {/* Member type selector */}
        <div className="grid grid-cols-2 gap-3">
          {MEMBER_TYPES.map(t => (
            <button key={t.value} onClick={()=>setMemberType(t.value)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${memberType===t.value?'border-blue-500 bg-blue-950':'border-white/10 bg-white/5 hover:border-white/20'}`}>
              <p className={`font-black text-sm uppercase tracking-widest ${memberType===t.value?'text-blue-300':'text-white/70'}`}>{t.label}</p>
              <p className={`text-xs font-bold mt-1 leading-relaxed ${memberType===t.value?'text-blue-400':'text-white/30'}`}>{t.desc}</p>
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="bg-white rounded-[2rem] p-8 space-y-5 shadow-xl">
          <h3 className="font-black text-slate-900 uppercase italic text-xl">Your Information</h3>

          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
              {photoPreview?<img src={photoPreview} className="w-full h-full object-cover"/>:<div className="w-full h-full flex items-center justify-center text-slate-300"><Users size={28}/></div>}
            </div>
            <label className="flex-1 cursor-pointer flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl px-5 py-4 transition-all">
              <Upload size={16} className="text-slate-400 shrink-0"/>
              <span className="text-xs font-bold text-slate-500">{photoFile?photoFile.name:'Upload your photo (optional)'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={async e=>{
                const file=e.target.files?.[0]; if(!file) return;
                const c=await compressImage(file); setPhotoFile(c); setPhotoPreview(URL.createObjectURL(c));
              }}/>
            </label>
            {photoPreview&&<button onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}} className="text-red-400 p-1"><X size={16}/></button>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {l:'Full Name *',         v:fullName,  s:setFullName,  ph:'Your full legal name',                   col:'sm:col-span-2'},
              {l:'Organization / Title',v:orgName,   s:setOrgName,   ph:'Company, organization or job title',      col:'sm:col-span-2'},
              {l:'Email Address *',     v:email,     s:setEmail,     ph:'your@email.com',                          col:''},
              {l:'Phone Number',        v:phone,     s:setPhone,     ph:'+231 ...',                                col:''},
              {l:'Address',             v:address,   s:setAddress,   ph:'City, County, Country',                   col:'sm:col-span-2'},
            ].map(({l,v,s,ph,col})=>(
              <div key={l} className={col}>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{l}</label>
                <input value={v} onChange={e=>s(e.target.value)} placeholder={ph}
                  className="w-full border-2 border-slate-200 focus:border-blue-500 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
              </div>
            ))}
          </div>

          {error && <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"><AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/><p className="text-red-700 text-sm font-bold">{error}</p></div>}

          <button onClick={submit} disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
            {submitting?<><Loader2 size={16} className="animate-spin"/>Submitting...</>:<><CheckCircle2 size={16}/>Submit Application</>}
          </button>

          <p className="text-xs text-slate-400 font-bold text-center">Applications are reviewed by BWIAA administrators. You will be contacted by email once reviewed.</p>
        </div>
      </div>
    </div>
  );
}
