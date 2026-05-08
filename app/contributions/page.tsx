"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, Heart, CheckCircle2, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Lock, Upload, X
} from 'lucide-react';
import Link from 'next/link';

interface Member { id: string; full_name: string; chapter: string; email: string; photo_url: string | null; }
interface Contribution {
  id: string; from_member_id: string; from_member_name: string; from_chapter: string;
  to_member_id: string; to_member_name: string; to_chapter: string;
  amount: number; currency: string; reason: string; reason_type: string;
  status: string; receipt_url: string | null;
  approved_by: string | null; approved_at: string | null; created_at: string;
}

const REASON_TYPES = [
  { key: 'hardship',    label: 'Financial Hardship',  emoji: '🤝', desc: 'Member facing financial difficulty' },
  { key: 'illness',     label: 'Illness / Medical',   emoji: '🏥', desc: 'Medical bills or health support' },
  { key: 'bereavement', label: 'Bereavement',          emoji: '🕊️', desc: 'Loss of a family member' },
  { key: 'education',   label: 'Education Support',   emoji: '📚', desc: 'School fees or educational needs' },
  { key: 'disaster',    label: 'Disaster Relief',     emoji: '🆘', desc: 'Fire, flood or other disaster' },
  { key: 'other',       label: 'Other',               emoji: '💛', desc: 'Any other solidarity reason' },
];

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  pending:  {label:'Pending',  color:'text-yellow-700', bg:'bg-yellow-50 border-yellow-200'},
  approved: {label:'Approved', color:'text-green-700',  bg:'bg-green-50 border-green-200'},
  rejected: {label:'Rejected', color:'text-red-700',    bg:'bg-red-50 border-red-200'},
};

export default function ContributionsPage() {
  const [myMember, setMyMember]     = useState<Member|null>(null);
  const [authOk, setAuthOk]         = useState<boolean|null>(null);
  const [members, setMembers]       = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [tab, setTab]               = useState<'contribute'|'history'>('contribute');
  const [orgName, setOrgName]       = useState('BWIAA');

  // Form
  const [toMemberId, setToMemberId]   = useState('');
  const [amount, setAmount]           = useState('');
  const [currency, setCurrency]       = useState('LRD');
  const [reasonType, setReasonType]   = useState('hardship');
  const [reason, setReason]           = useState('');
  const [receiptFile, setReceiptFile] = useState<File|null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string|null>(null);

  // Member search
  const [search, setSearch]         = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredMembers = members.filter(m =>
    m.id !== myMember?.id &&
    (m.full_name.toLowerCase().includes(search.toLowerCase()) ||
     m.chapter.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 8);

  const selectedMember = members.find(m => m.id === toMemberId);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name'))        setOrgName(get('org_name'));
        if (get('currency'))        setCurrency(get('currency') ?? 'LRD');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthOk(false); setLoading(false); return; }

      // Load my member record
      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('id,full_name,chapter,email,photo_url,status,auth_user_id')
        .eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; }
      else {
        const { data: m2 } = await supabase.from('members').select('id,full_name,chapter,email,photo_url,status,auth_user_id')
          .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) {
          mem = m2;
          if (!m2.auth_user_id) await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
        }
      }

      if (!mem || mem.status !== 'approved') { setAuthOk(false); setLoading(false); return; }
      setMyMember(mem); setAuthOk(true);

      // Load all approved members (to contribute to)
      const { data: allMems } = await supabase.from('members')
        .select('id,full_name,chapter,email,photo_url').eq('status','approved').order('full_name');
      if (allMems) setMembers(allMems);

      // Load contributions — member sees their own + ones directed to them + approved ones
      const { data: contribs } = await supabase.from('contributions')
        .select('*').order('created_at',{ascending:false});
      if (contribs) setContributions(contribs);

      setLoading(false);
    })();
  }, []);

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve,reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200; let {width,height} = img;
        if (width>MAX||height>MAX) { if(width>height){height=Math.round(height*MAX/width);width=MAX;}else{width=Math.round(width*MAX/height);height=MAX;} }
        const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
        canvas.getContext('2d')!.drawImage(img,0,0,width,height); URL.revokeObjectURL(url);
        canvas.toBlob(b=>b?resolve(new File([b],'receipt.jpg',{type:'image/jpeg'})):reject(),'image/jpeg',0.88);
      }; img.onerror=reject; img.src=url;
    });
  }

  async function submit() {
    if (!toMemberId)                                          { setError('Please select the member you are contributing to.'); return; }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { setError('Please enter a valid amount.'); return; }
    if (!reason.trim())                                       { setError('Please describe the reason for this contribution.'); return; }
    setSubmitting(true); setError('');
    try {
      let receipt_url: string|null = null;
      if (receiptFile) {
        const fn = `contributions/${Date.now()}_${myMember!.full_name.replace(/\s+/g,'_')}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('payment-screenshots').upload(fn, receiptFile, {upsert:true});
        if (ue) throw new Error(ue.message);
        receipt_url = supabase.storage.from('payment-screenshots').getPublicUrl(ud.path).data.publicUrl;
      }

      const toMem = members.find(m => m.id === toMemberId)!;
      const { data, error: ie } = await supabase.from('contributions').insert([{
        from_member_id:   myMember!.id,
        from_member_name: myMember!.full_name,
        from_chapter:     myMember!.chapter,
        to_member_id:     toMemberId,
        to_member_name:   toMem.full_name,
        to_chapter:       toMem.chapter,
        amount:           parseFloat(amount),
        currency,
        reason:           reason.trim(),
        reason_type:      reasonType,
        receipt_url,
        status:           'pending',
      }]).select().single();
      if (ie) throw new Error(ie.message);

      // Log activity
      await supabase.from('activity_log').insert([{
        member_id: myMember!.id, member_name: myMember!.full_name, chapter: myMember!.chapter,
        action: 'Solidarity contribution submitted',
        details: `${parseFloat(amount).toLocaleString()} ${currency} to ${toMem.full_name} — ${reasonType}`,
      }]);

      setContributions(prev => [data, ...prev]);
      setSubmitted(true);
    } catch(e:any) { setError(e.message ?? 'Submission failed.'); }
    finally { setSubmitting(false); }
  }

  if (loading || authOk === null) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  if (!authOk) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-red-600"/>
        </div>
        <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Members Only</h2>
        <p className="text-slate-500 font-bold text-sm mb-8 leading-relaxed">
          Solidarity contributions are only available to approved BWIAA members.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/members/login" className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm hover:bg-red-700 transition-all">Sign In</Link>
          <Link href="/members" className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase text-sm">Back to Members</Link>
        </div>
      </div>
    </div>
  );

  // Stats for this member
  const myGiven    = contributions.filter(c => c.from_member_id === myMember?.id && c.status === 'approved');
  const myReceived = contributions.filter(c => c.to_member_id   === myMember?.id && c.status === 'approved');
  const totalGiven    = myGiven.reduce((s,c)=>s+c.amount,0);
  const totalReceived = myReceived.reduce((s,c)=>s+c.amount,0);

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Users size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} — Solidarity Fund</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Member-to-Member Contributions</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-8 space-y-6">
        {/* My stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-900/30 border border-green-500/30 rounded-2xl p-5 text-center">
            <p className="text-green-400 font-black text-2xl">{totalGiven.toLocaleString()}</p>
            <p className="text-green-300/60 text-[10px] font-bold uppercase tracking-widest mt-1">You've Given (LRD)</p>
          </div>
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-5 text-center">
            <p className="text-blue-400 font-black text-2xl">{totalReceived.toLocaleString()}</p>
            <p className="text-blue-300/60 text-[10px] font-bold uppercase tracking-widest mt-1">You've Received (LRD)</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
          {(['contribute','history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t?'bg-white text-slate-900':'text-white/50 hover:text-white'}`}>
              {t === 'contribute' ? 'Contribute' : 'All Records'}
            </button>
          ))}
        </div>

        {tab === 'contribute' && (submitted ? (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-2xl">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Heart size={32} className="text-green-600"/>
            </div>
            <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Contribution Recorded!</h2>
            <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
              Your solidarity contribution to <strong>{selectedMember?.full_name}</strong> has been submitted for admin review.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setSubmitted(false); setToMemberId(''); setAmount(''); setReason(''); setSearch(''); setReceiptFile(null); setReceiptPreview(null); }}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm hover:bg-red-700 transition-all">
                Make Another Contribution
              </button>
              <button onClick={() => setTab('history')}
                className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase text-sm">
                View All Records
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl space-y-6">
            <div>
              <h2 className="text-2xl font-black uppercase italic text-slate-900">New Solidarity Contribution</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Support a fellow member in need</p>
            </div>

            {/* Reason type */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Reason for Contribution *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {REASON_TYPES.map(rt => (
                  <button key={rt.key} onClick={() => setReasonType(rt.key)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${reasonType===rt.key?'border-red-600 bg-red-50':'border-slate-200 hover:border-slate-300'}`}>
                    <p className="text-2xl mb-1">{rt.emoji}</p>
                    <p className="font-black text-slate-800 text-xs uppercase tracking-widest">{rt.label}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{rt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Member search */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Contributing To *</label>
              {selectedMember ? (
                <div className="flex items-center gap-4 bg-slate-50 border-2 border-green-400 rounded-2xl p-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                    {selectedMember.photo_url
                      ? <img src={selectedMember.photo_url} className="w-full h-full object-cover" alt={selectedMember.full_name}/>
                      : <div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500">{selectedMember.full_name.charAt(0)}</span></div>}
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-800">{selectedMember.full_name}</p>
                    <p className="text-xs text-slate-400 font-bold">{selectedMember.chapter}</p>
                  </div>
                  <button onClick={() => { setToMemberId(''); setSearch(''); }}
                    className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all">
                    <X size={16}/>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search member by name or chapter..."
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                  {showDropdown && filteredMembers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden">
                      {filteredMembers.map(m => (
                        <button key={m.id} onClick={() => { setToMemberId(m.id); setSearch(''); setShowDropdown(false); }}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-all text-left border-b border-slate-50 last:border-0">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                            {m.photo_url
                              ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                              : <div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-sm">{m.full_name.charAt(0)}</span></div>}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-sm">{m.full_name}</p>
                            <p className="text-xs text-slate-400 font-bold">{m.chapter}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount *</label>
                <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0"
                  placeholder="0.00"
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Currency</label>
                <select value={currency} onChange={e=>setCurrency(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                  {['LRD','USD'].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Reason text */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Details / Message *</label>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
                placeholder={`Describe the situation and why you are contributing to ${selectedMember?.full_name ?? 'this member'}...`}
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 resize-none"/>
            </div>

            {/* Receipt */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Payment Receipt (optional)</label>
              {receiptPreview ? (
                <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 max-w-xs">
                  <img src={receiptPreview} className="w-full max-h-36 object-cover" alt="Receipt"/>
                  <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"><X size={14}/></button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center h-28 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl transition-all">
                  <Upload size={20} className="text-slate-400 mb-2"/>
                  <p className="text-xs font-bold text-slate-500">Upload payment proof</p>
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const c = await compressImage(file); setReceiptFile(c); setReceiptPreview(URL.createObjectURL(c));
                  }}/>
                </label>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/>
                <p className="text-red-700 text-sm font-bold">{error}</p>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-amber-500 shrink-0 text-lg">ℹ️</span>
              <p className="text-amber-700 text-xs font-bold leading-relaxed">
                Contributions are recorded for transparency. The recipient and administrator will be able to see this record.
                Submitted contributions are reviewed before appearing publicly.
              </p>
            </div>

            <button onClick={submit} disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
              {submitting ? <><Loader2 size={16} className="animate-spin"/> Submitting...</> : <><Heart size={16}/> Submit Contribution</>}
            </button>
          </div>
        ))}

        {tab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-2xl px-5 py-3">
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
                Showing approved contributions · Your giving and receiving history highlighted
              </p>
            </div>
            {contributions.filter(c => c.status === 'approved').length === 0 ? (
              <div className="bg-white/5 rounded-3xl p-16 text-center">
                <Users size={48} className="mx-auto mb-4 text-white/20"/>
                <p className="text-white/40 font-black uppercase tracking-widest text-sm">No contributions yet</p>
                <p className="text-white/20 text-xs font-bold mt-2">Be the first to show solidarity</p>
              </div>
            ) : contributions.filter(c => c.status === 'approved').map(c => {
              const isOpen    = expanded === c.id;
              const isMyGive  = c.from_member_id === myMember?.id;
              const isMyRecv  = c.to_member_id   === myMember?.id;
              const rtCfg     = REASON_TYPES.find(r => r.key === c.reason_type);
              return (
                <div key={c.id} className={`rounded-3xl overflow-hidden shadow-sm border-2 ${isMyGive?'border-green-200 bg-green-50':isMyRecv?'border-blue-200 bg-blue-50':'bg-white border-transparent'}`}>
                  <button onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:opacity-90 transition-all">
                    <div className="text-2xl shrink-0">{rtCfg?.emoji ?? '💛'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-800 text-sm">{c.from_member_name}</p>
                        <span className="text-slate-400 text-xs">→</span>
                        <p className="font-black text-slate-800 text-sm">{c.to_member_name}</p>
                        {isMyGive && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-200 text-green-800">You Gave</span>}
                        {isMyRecv && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">You Received</span>}
                      </div>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">{rtCfg?.label} · {c.from_chapter}</p>
                      <p className="text-xs text-slate-400 font-bold">{new Date(c.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-xl text-slate-800">{c.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{c.currency}</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400 shrink-0"/> : <ChevronDown size={16} className="text-slate-400 shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-5 bg-white/60 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[['From', `${c.from_member_name} (${c.from_chapter})`],
                          ['To', `${c.to_member_name} (${c.to_chapter})`],
                          ['Reason Type', rtCfg?.label ?? c.reason_type],
                          ['Amount', `${c.amount.toLocaleString()} ${c.currency}`],
                        ].map(([l,v]) => (
                          <div key={l} className="bg-white rounded-xl p-3 border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{l}</p>
                            <p className="font-black text-slate-800 mt-0.5 text-xs">{v}</p>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Message / Reason</p>
                        <p className="text-sm text-slate-700 font-bold leading-relaxed">{c.reason}</p>
                      </div>
                      {c.receipt_url && (
                        <img src={c.receipt_url} className="rounded-2xl max-h-40 border border-slate-200 cursor-pointer"
                          alt="Receipt" onClick={() => window.open(c.receipt_url!,'_blank')}/>
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
