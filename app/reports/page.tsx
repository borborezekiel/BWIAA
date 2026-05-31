"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Loader2, ChevronDown, ChevronUp, PlusCircle, X, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import Link from 'next/link';

interface Report {
  id: string; title: string; meeting_date: string; chapter: string;
  content: string; published_by: string; created_at: string;
}

async function sendPushToMembers(memberIds: string[], title: string, message: string, url = '/reports') {
  if (memberIds.length === 0) return;
  try {
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_ids: memberIds, title, message, url, tag: 'meeting-report' }),
    });
  } catch (err) {
    console.warn('Push notification failed (non-critical):', err);
  }
}

export default function MeetingReportsPage() {
  const [reports, setReports]   = useState<Report[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [canPost, setCanPost]   = useState(false);
  const [orgName, setOrgName]   = useState('BWIAA');
  const [member, setMember]     = useState<any>(null);

  // Form
  const [tab, setTab]           = useState<'view'|'post'>('view');
  const [title, setTitle]       = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0,10));
  const [chapter, setChapter]   = useState('Harbel Chapter');
  const [content, setContent]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]       = useState('');
  const [chapters, setChapters] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('chapters')) { try { const c=JSON.parse(get('chapters')); setChapters(c); setChapter(c[0]); } catch {} }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        let mem: any = null;
        const { data: m1 } = await supabase.from('members').select('*').eq('auth_user_id', user.id).maybeSingle();
        if (m1) mem = m1;
        else {
          const { data: m2 } = await supabase.from('members').select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
          if (m2) mem = m2;
        }
        if (mem) setMember(mem);

        const { data: adminRec } = await supabase.from('election_admins').select('role').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        const { data: ha } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
        let heads = ['ezekielborbor17@gmail.com'];
        if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
        const postRoles = ['president','secretary_general','vp_admin','admin'];
        setCanPost(heads.includes(user.email?.toLowerCase() ?? '') || Boolean(adminRec && postRoles.includes(adminRec.role ?? '')));
      }

      const { data } = await supabase.from('meeting_reports').select('*').order('meeting_date', { ascending: false });
      if (data) setReports(data);
      setLoading(false);
    })();
  }, []);

  async function submit() {
    if (!title.trim())   { setError('Title required.'); return; }
    if (!content.trim()) { setError('Report content required.'); return; }
    setSubmitting(true); setError('');
    try {
      const { data, error: ie } = await supabase.from('meeting_reports').insert([{
        title: title.trim(), meeting_date: meetingDate, chapter,
        content: content.trim(), published_by: member?.full_name ?? 'Admin',
      }]).select().single();
      if (ie) throw new Error(ie.message);

      // Notify all members
      const { data: allMembers } = await supabase.from('members').select('id').eq('status','approved');
      if (allMembers && allMembers.length > 0) {
        const pushTitle = `New Meeting Report: ${title.trim()}`;
        const pushMessage = `A report from the ${chapter} meeting on ${new Date(meetingDate).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} has been published.`;
        await supabase.from('notifications').insert(
          allMembers.map((m: any) => ({
            member_id: m.id,
            type: 'meeting_report',
            title: `📋 New Meeting Report: ${title.trim()}`,
            message: `A report from the ${chapter} meeting on ${new Date(meetingDate).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} has been published.`,
            link: '/reports',
          }))
        );
        await sendPushToMembers(allMembers.map((m: any) => m.id), pushTitle, pushMessage, '/reports');
      }
      setReports(prev => [data, ...prev]);
      setSubmitted(true);
    } catch(e:any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-xl"><FileText size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Meeting Reports</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Official Minutes & Records</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        {canPost && (
          <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm">
            {(['view','post'] as const).map(t => (
              <button key={t} onClick={()=>setTab(t)}
                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${tab===t?'bg-slate-900 text-white':'text-slate-500 hover:text-slate-900'}`}>
                {t==='view'?'📋 All Reports':'✍️ Post Report'}
              </button>
            ))}
          </div>
        )}

        {/* ── POST REPORT ── */}
        {tab === 'post' && canPost && (
          submitted ? (
            <div className="bg-white rounded-[2rem] p-10 text-center shadow-sm">
              <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4"/>
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Report Published!</h2>
              <p className="text-slate-500 font-bold text-sm mb-6">All members have been notified.</p>
              <div className="flex gap-3">
                <button onClick={()=>{setSubmitted(false);setTitle('');setContent('');}}
                  className="flex-1 bg-red-600 text-white font-black uppercase py-4 rounded-2xl text-sm">Post Another</button>
                <button onClick={()=>setTab('view')} className="flex-1 bg-slate-100 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm">View All</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] p-8 shadow-sm space-y-5">
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900">Post Meeting Report</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">All members will be notified immediately</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Report Title *</label>
                  <input value={title} onChange={e=>setTitle(e.target.value)}
                    placeholder="e.g. Minutes of General Meeting — May 2026"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Meeting Date *</label>
                  <input value={meetingDate} onChange={e=>setMeetingDate(e.target.value)} type="date"
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Chapter</label>
                  <select value={chapter} onChange={e=>setChapter(e.target.value)}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800">
                    {chapters.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Report Content / Minutes *</label>
                  <textarea value={content} onChange={e=>setContent(e.target.value)} rows={12}
                    placeholder={`MINUTES OF MEETING\n\nDate: \nVenue: \nPresiding: \nIn Attendance: \n\nAGENDA:\n1. Call to Order\n2. Opening Prayer\n3. Approval of Previous Minutes\n4. Matters Arising\n5. New Business\n6. Financial Report\n7. Any Other Business\n8. Closing Prayer\n\nMINUTES:\n\n...`}
                    className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800 resize-none font-mono text-sm"/>
                </div>
              </div>
              {error && <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4"><AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5"/><p className="text-red-700 text-sm font-bold">{error}</p></div>}
              <button onClick={submit} disabled={submitting}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black uppercase py-5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                {submitting?<><Loader2 size={16} className="animate-spin"/>Publishing...</>:<><FileText size={16}/>Publish Report & Notify Members</>}
              </button>
            </div>
          )
        )}

        {/* ── VIEW REPORTS ── */}
        {tab === 'view' && (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <div className="bg-white rounded-[2rem] p-16 text-center shadow-sm">
                <FileText size={48} className="mx-auto mb-4 text-slate-200"/>
                <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No reports published yet</p>
                {canPost && <p className="text-slate-300 text-xs font-bold mt-2">Post the first meeting report using the tab above</p>}
              </div>
            ) : reports.map(r => {
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="bg-white rounded-[2rem] overflow-hidden shadow-sm">
                  <button onClick={()=>setExpanded(isOpen?null:r.id)}
                    className="w-full flex items-center gap-4 p-6 text-left hover:bg-slate-50 transition-all">
                    <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center shrink-0">
                      <FileText size={20} className="text-purple-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800">{r.title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10px] bg-purple-100 text-purple-700 font-black uppercase px-2 py-0.5 rounded-full">{r.chapter}</span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {new Date(r.meeting_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
                        </span>
                        <span className="text-[10px] text-slate-300 font-bold">Published by {r.published_by}</span>
                      </div>
                    </div>
                    {isOpen?<ChevronUp size={16} className="text-slate-400 shrink-0"/>:<ChevronDown size={16} className="text-slate-400 shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-6 bg-slate-50">
                      <pre className="text-slate-700 font-sans text-sm leading-relaxed whitespace-pre-wrap">{r.content}</pre>
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
