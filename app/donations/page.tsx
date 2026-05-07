"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Heart, Upload, CheckCircle2, Loader2, AlertCircle,
  X, ChevronDown, ChevronUp, Gift, DollarSign,
  Package, BookOpen, Utensils, Wrench, Users
} from 'lucide-react';
import Link from 'next/link';

interface Donation {
  id: string; donor_name: string; donor_type: string; donor_contact: string | null;
  donor_organization: string | null; donation_type: string; amount: number | null;
  currency: string | null; material_description: string | null;
  estimated_value: number | null; quantity: string | null;
  purpose: string | null; receipt_url: string | null; photo_url: string | null;
  member_id: string | null; chapter: string | null;
  status: string; notes: string | null; created_at: string;
}

const DONATION_TYPES = [
  { key: 'money',     label: 'Money',     icon: <DollarSign size={20}/>, color: 'text-green-600', desc: 'Cash or bank transfer' },
  { key: 'books',     label: 'Books',     icon: <BookOpen size={20}/>,   color: 'text-blue-600',  desc: 'Educational materials' },
  { key: 'food',      label: 'Food',      icon: <Utensils size={20}/>,   color: 'text-orange-600',desc: 'Food items or provisions' },
  { key: 'tools',     label: 'Tools',     icon: <Wrench size={20}/>,     color: 'text-slate-600', desc: 'Equipment & tools' },
  { key: 'other',     label: 'Other',     icon: <Package size={20}/>,    color: 'text-purple-600',desc: 'Any other items' },
];

const DONOR_TYPES = ['individual','politician','business','organization','ngo','alumni','other'];

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  pending:  {label:'Pending',  color:'text-yellow-700', bg:'bg-yellow-50 border-yellow-200'},
  approved: {label:'Approved', color:'text-green-700',  bg:'bg-green-50 border-green-200'},
  rejected: {label:'Rejected', color:'text-red-700',    bg:'bg-red-50 border-red-200'},
};

export default function DonationsPage() {
  const [tab, setTab]           = useState<'donate'|'history'>('donate');
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<string|null>(null);
  const [orgName, setOrgName]   = useState('BWIAA');
  const [chapters, setChapters] = useState<string[]>([]);

  // Form state
  const [donorName, setDonorName]         = useState('');
  const [donorType, setDonorType]         = useState('individual');
  const [donorContact, setDonorContact]   = useState('');
  const [donorOrg, setDonorOrg]           = useState('');
  const [donationType, setDonationType]   = useState('money');
  const [amount, setAmount]               = useState('');
  const [currency, setCurrency]           = useState('LRD');
  const [materialDesc, setMaterialDesc]   = useState('');
  const [estValue, setEstValue]           = useState('');
  const [quantity, setQuantity]           = useState('');
  const [purpose, setPurpose]             = useState('');
  const [chapter, setChapter]             = useState('');
  const [notes, setNotes]                 = useState('');
  const [receiptFile, setReceiptFile]     = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string|null>(null);
  const [photoFile, setPhotoFile]         = useState<File|null>(null);
  const [photoPreview, setPhotoPreview]   = useState<string|null>(null);

  // Check if logged-in user is a member
  const [myMember, setMyMember] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name'))   setOrgName(get('org_name'));
        if (get('currency'))   setCurrency(get('currency') ?? 'LRD');
        if (get('chapters'))   { try { const c = JSON.parse(get('chapters')); setChapters(c); setChapter(c[0]); } catch {} }
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { data: mem } = await supabase.from('members').select('id,full_name,chapter,status')
          .eq('email', user.email.toLowerCase()).eq('status','approved').maybeSingle();
        if (mem) {
          setMyMember(mem);
          setDonorName(mem.full_name);
          setDonorType('alumni');
          setChapter(mem.chapter);
        }
      }
      const { data } = await supabase.from('donations').select('*').order('created_at',{ascending:false}).limit(50);
      if (data) setDonations(data);
      setLoading(false);
    })();
  }, []);

  async function compressImage(file: File, maxPx = 1200): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b], file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'})) : reject(), 'image/jpeg', 0.88);
      }; img.onerror = reject; img.src = url;
    });
  }

  async function uploadFile(file: File, folder: string): Promise<string> {
    const compressed = await compressImage(file);
    const fn = `${folder}/${Date.now()}_${donorName.replace(/\s+/g,'_')}.jpg`;
    const { data, error } = await supabase.storage.from('payment-screenshots').upload(fn, compressed, { upsert: true });
    if (error) throw new Error(error.message);
    return supabase.storage.from('payment-screenshots').getPublicUrl(data.path).data.publicUrl;
  }

  async function submit() {
    if (!donorName.trim())              { setError('Donor name is required.'); return; }
    if (!purpose.trim())                { setError('Please describe the purpose of this donation.'); return; }
    if (donationType === 'money' && (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0))
                                        { setError('Please enter a valid amount for money donations.'); return; }
    if (donationType !== 'money' && !materialDesc.trim())
                                        { setError('Please describe the items being donated.'); return; }
    setSubmitting(true); setError('');
    try {
      let receipt_url: string|null = null;
      let photo_url: string|null   = null;
      if (receiptFile) receipt_url = await uploadFile(receiptFile, 'donations/receipts');
      if (photoFile)   photo_url   = await uploadFile(photoFile,   'donations/photos');

      const { data, error: ie } = await supabase.from('donations').insert([{
        donor_name:           donorName.trim(),
        donor_type:           donorType,
        donor_contact:        donorContact.trim() || null,
        donor_organization:   donorOrg.trim()     || null,
        donation_type:        donationType,
        amount:               donationType === 'money' ? parseFloat(amount) : null,
        currency:             donationType === 'money' ? currency : null,
        material_description: donationType !== 'money' ? materialDesc.trim() : null,
        estimated_value:      estValue ? parseFloat(estValue) : null,
        quantity:             quantity.trim() || null,
        purpose:              purpose.trim(),
        receipt_url,
        photo_url,
        member_id:            myMember?.id ?? null,
        chapter:              chapter || null,
        notes:                notes.trim() || null,
        status:               'pending',
      }]).select().single();
      if (ie) throw new Error(ie.message);
      setDonations(prev => [data, ...prev]);
      setSubmitted(true);
    } catch (e: any) { setError(e.message ?? 'Submission failed.'); }
    finally { setSubmitting(false); }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  const isMoney = donationType === 'money';

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Heart size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} — Donations</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Support the Association</p>
            </div>
          </div>
          <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Home</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-8 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
          {(['donate','history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t?'bg-white text-slate-900':'text-white/50 hover:text-white'}`}>
              {t==='donate' ? 'Make a Donation' : 'Donation Records'}
            </button>
          ))}
        </div>

        {tab === 'donate' && (submitted ? (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-2xl">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Heart size={32} className="text-green-600"/>
            </div>
            <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Thank You!</h2>
            <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
              Your donation has been recorded and is pending review by the administrator.
              The {orgName} community is grateful for your generosity.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setSubmitted(false); setAmount(''); setMaterialDesc(''); setEstValue(''); setQuantity(''); setPurpose(''); setNotes(''); setReceiptFile(null); setReceiptPreview(null); setPhotoFile(null); setPhotoPreview(null); if (!myMember) { setDonorName(''); setDonorContact(''); setDonorOrg(''); } }}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm hover:bg-red-700 transition-all">
                Record Another Donation
              </button>
              <button onClick={() => setTab('history')}
                className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase text-sm hover:bg-slate-200 transition-all">
                View Donation Records
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-xl space-y-6">
            <div>
              <h2 className="text-2xl font-black uppercase italic text-slate-900">Record a Donation</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                Open to members, politicians, businesses and all supporters
              </p>
            </div>

            {/* Donation type selector */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Donation Type *</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {DONATION_TYPES.map(dt => (
                  <button key={dt.key} onClick={() => setDonationType(dt.key)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${donationType===dt.key?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                    <span className={donationType===dt.key?'text-red-600':dt.color}>{dt.icon}</span>
                    <span className="font-black text-xs uppercase tracking-widest text-slate-700">{dt.label}</span>
                    <span className="text-[10px] text-slate-400 font-bold leading-tight">{dt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Donor info */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Donor Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Donor Name *</label>
                  <input value={donorName} onChange={e=>setDonorName(e.target.value)} readOnly={!!myMember}
                    placeholder="Full name of donor"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 ${myMember?'bg-slate-50 border-slate-100 text-slate-500':'border-slate-200 focus:border-red-600'}`}/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Donor Type *</label>
                  <select value={donorType} onChange={e=>setDonorType(e.target.value)}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 capitalize">
                    {DONOR_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Contact (Phone/Email)</label>
                  <input value={donorContact} onChange={e=>setDonorContact(e.target.value)}
                    placeholder="Optional contact details"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Organization / Party (if any)</label>
                  <input value={donorOrg} onChange={e=>setDonorOrg(e.target.value)}
                    placeholder="e.g. Unity Party, ABC Corp"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              </div>
            </div>

            {/* Donation details */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Donation Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isMoney ? (
                  <>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount *</label>
                      <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0"
                        placeholder="0.00"
                        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Currency</label>
                      <select value={currency} onChange={e=>setCurrency(e.target.value)}
                        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                        {['LRD','USD','EUR','GBP'].map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Item Description *</label>
                      <textarea value={materialDesc} onChange={e=>setMaterialDesc(e.target.value)} rows={2}
                        placeholder={`Describe the ${donationType} being donated (type, condition, brand etc.)`}
                        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 resize-none"/>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Quantity</label>
                      <input value={quantity} onChange={e=>setQuantity(e.target.value)}
                        placeholder="e.g. 50 boxes, 20 units"
                        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Value (LRD)</label>
                      <input value={estValue} onChange={e=>setEstValue(e.target.value)} type="number" min="0"
                        placeholder="Approximate value"
                        className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Purpose / Intended For *</label>
                  <input value={purpose} onChange={e=>setPurpose(e.target.value)}
                    placeholder="e.g. School supplies for BWI students, Support for annual convention, General fund"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Chapter (if specific)</label>
                  <select value={chapter} onChange={e=>setChapter(e.target.value)} disabled={!!myMember}
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 ${myMember?'bg-slate-50 border-slate-100 text-slate-500':'border-slate-200 focus:border-red-600'}`}>
                    <option value="">All Chapters / General</option>
                    {chapters.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Notes</label>
                  <input value={notes} onChange={e=>setNotes(e.target.value)}
                    placeholder="Any additional information"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
              </div>
            </div>

            {/* File uploads */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: isMoney ? 'Payment Receipt / Proof' : 'Delivery Receipt', preview: receiptPreview, setFile: setReceiptFile, setPreview: setReceiptPreview, key: 'receipt' },
                { label: 'Photo of Donation (optional)', preview: photoPreview,   setFile: setPhotoFile,   setPreview: setPhotoPreview,   key: 'photo'   },
              ].map(({ label, preview, setFile, setPreview, key }) => (
                <div key={key}>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{label}</label>
                  {preview ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-green-400">
                      <img src={preview} className="w-full max-h-36 object-cover" alt="Upload"/>
                      <button onClick={() => { setFile(null); setPreview(null); }}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14}/></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center h-28 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                      <Upload size={20} className="text-slate-400 mb-2"/>
                      <p className="text-xs font-bold text-slate-500">Click to upload</p>
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const compressed = await compressImage(file);
                        setFile(compressed); setPreview(URL.createObjectURL(compressed));
                      }}/>
                    </label>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/>
                <p className="text-red-700 text-sm font-bold">{error}</p>
              </div>
            )}

            <button onClick={submit} disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
              {submitting ? <><Loader2 size={16} className="animate-spin"/> Recording...</> : <><Heart size={16}/> Record Donation</>}
            </button>
          </div>
        ))}

        {tab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-2xl px-5 py-3 flex items-center gap-3">
              <Gift size={14} className="text-white/40"/>
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Public donation records — all approved donations visible to members</p>
            </div>
            {donations.filter(d => d.status === 'approved').length === 0 ? (
              <div className="bg-white/5 rounded-3xl p-16 text-center">
                <Gift size={48} className="mx-auto mb-4 text-white/20"/>
                <p className="text-white/40 font-black uppercase tracking-widest text-sm">No approved donations yet</p>
              </div>
            ) : donations.filter(d => d.status === 'approved').map(d => {
              const isOpen = expanded === d.id;
              const dtCfg  = DONATION_TYPES.find(t => t.key === d.donation_type);
              return (
                <div key={d.id} className="bg-white rounded-3xl overflow-hidden shadow-sm">
                  <button onClick={() => setExpanded(isOpen ? null : d.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-all">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-slate-100 ${dtCfg?.color}`}>
                      {dtCfg?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800">{d.donor_name}</p>
                      <p className="text-xs text-slate-400 font-bold uppercase">{d.donor_type} · {d.donation_type}</p>
                      {d.purpose && <p className="text-xs text-slate-500 font-bold truncate mt-0.5">{d.purpose}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {d.amount ? (
                        <p className="font-black text-xl text-green-700">{d.amount.toLocaleString()} <span className="text-sm font-bold">{d.currency}</span></p>
                      ) : (
                        <p className="font-black text-sm text-slate-700 capitalize">{d.donation_type}</p>
                      )}
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(d.created_at).toLocaleDateString()}</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400 shrink-0"/> : <ChevronDown size={16} className="text-slate-400 shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-5 bg-slate-50 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[
                          ['Donor', d.donor_name],
                          ['Type', d.donor_type],
                          d.donor_organization ? ['Organization', d.donor_organization] : null,
                          d.donor_contact ? ['Contact', d.donor_contact] : null,
                          d.material_description ? ['Items', d.material_description] : null,
                          d.quantity ? ['Quantity', d.quantity] : null,
                          d.estimated_value ? ['Est. Value', `${d.estimated_value.toLocaleString()} LRD`] : null,
                          d.chapter ? ['Chapter', d.chapter] : ['Chapter', 'All Chapters'],
                          ['Date', new Date(d.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})],
                        ].filter(Boolean).map(([l,v]) => (
                          <div key={l as string} className="bg-white rounded-xl p-3 border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{l}</p>
                            <p className="font-black text-slate-800 mt-0.5">{v}</p>
                          </div>
                        ))}
                      </div>
                      {d.photo_url && (
                        <img src={d.photo_url} className="rounded-2xl max-h-48 border border-slate-200 cursor-pointer w-full object-cover"
                          alt="Donation photo" onClick={() => window.open(d.photo_url!,'_blank')}/>
                      )}
                      {d.notes && <p className="text-sm text-slate-600 font-bold italic">"{d.notes}"</p>}
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

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200; let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b], file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'})) : reject(), 'image/jpeg', 0.88);
      }; img.onerror = reject; img.src = url;
    });
  }
}
