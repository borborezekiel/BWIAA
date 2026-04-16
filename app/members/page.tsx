"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User, CheckCircle2, Clock, XCircle, Search, Loader2,
  LogOut, ShieldCheck, Calendar, Activity, Users, ChevronDown, ChevronUp
} from 'lucide-react';
import Link from 'next/link';

interface Member {
  id: string; full_name: string; email: string; phone: string | null;
  class_name: string; year_graduated: number; sponsor_name: string;
  principal_name: string; id_number: string; chapter: string;
  photo_url: string | null; status: string;
  approved_by: string | null; approved_at: string | null; created_at: string;
}

interface ActivityEntry {
  id: string; member_name: string; chapter: string;
  action: string; details: string | null; created_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  pending:  { icon: <Clock size={16}/>,        label: 'Pending Approval', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  approved: { icon: <CheckCircle2 size={16}/>, label: 'Active Member',    color: 'text-green-700',  bg: 'bg-green-50 border-green-200'   },
  rejected: { icon: <XCircle size={16}/>,      label: 'Not Approved',     color: 'text-red-700',    bg: 'bg-red-50 border-red-200'       },
};

export default function MembersPage() {
  const [view, setView]           = useState<'directory' | 'my-profile'>('directory');
  const [members, setMembers]     = useState<Member[]>([]);
  const [activity, setActivity]   = useState<ActivityEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [chapterFilter, setChapterFilter] = useState('All');
  const [myEmail, setMyEmail]     = useState('');
  const [myProfile, setMyProfile] = useState<Member | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [orgName, setOrgName]     = useState('BWIAA');
  const [chapters, setChapters]   = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      // Load config
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('chapters')) { try { setChapters(JSON.parse(get('chapters'))); } catch {} }
      }

      // Load all approved members (public directory)
      const { data: mems } = await supabase.from('members').select('*')
        .eq('status', 'approved').order('full_name');
      if (mems) setMembers(mems);

      // Load recent activity
      const { data: acts } = await supabase.from('activity_log').select('*')
        .order('created_at', { ascending: false }).limit(50);
      if (acts) setActivity(acts);

      // Check if current user has a profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setMyEmail(user.email);
        const { data: profile } = await supabase.from('members')
          .select('*').eq('email', user.email.toLowerCase()).maybeSingle();
        if (profile) setMyProfile(profile);
      }

      setLoading(false);
    };
    init();
  }, []);

  const filtered = members.filter(m => {
    const matchSearch = !search ||
      m.full_name.toLowerCase().includes(search.toLowerCase()) ||
      m.class_name.toLowerCase().includes(search.toLowerCase()) ||
      m.chapter.toLowerCase().includes(search.toLowerCase());
    const matchChapter = chapterFilter === 'All' || m.chapter === chapterFilter;
    return matchSearch && matchChapter;
  });

  const allChapters = ['All', ...chapters];

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Users size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Member Portal</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Alumni Directory &amp; Community</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {myProfile ? (
              <button onClick={() => setView(view === 'my-profile' ? 'directory' : 'my-profile')}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase px-4 py-2 rounded-xl transition-all">
                <User size={14}/> My Profile
              </button>
            ) : (
              <Link href="/members/register"
                className="bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase px-4 py-2 rounded-xl transition-all">
                Join Now
              </Link>
            )}
            <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all">← Home</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-8 space-y-8">

        {/* My Profile View */}
        {view === 'my-profile' && myProfile && (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100">
            <div className="flex flex-col md:flex-row gap-6 items-start mb-8">
              <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
                {myProfile.photo_url
                  ? <img src={myProfile.photo_url} className="w-full h-full object-cover" alt={myProfile.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl font-black text-slate-300">{myProfile.full_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1">
                <h2 className="text-3xl font-black uppercase italic text-slate-900">{myProfile.full_name}</h2>
                <p className="text-red-600 font-black text-sm uppercase mt-1">{myProfile.chapter}</p>
                <p className="text-slate-400 font-bold text-xs mt-1">{myProfile.class_name} · Class of {myProfile.year_graduated}</p>
                <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full border text-xs font-black uppercase ${STATUS_CONFIG[myProfile.status]?.bg} ${STATUS_CONFIG[myProfile.status]?.color}`}>
                  {STATUS_CONFIG[myProfile.status]?.icon}
                  {STATUS_CONFIG[myProfile.status]?.label}
                </div>
              </div>
            </div>

            {myProfile.status === 'pending' && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-5 mb-6">
                <p className="font-black text-yellow-800 text-sm">⏳ Application Under Review</p>
                <p className="text-yellow-700 text-xs font-bold mt-2 leading-relaxed">
                  Your membership application is being reviewed by your chapter administrator.
                  You will be notified once a decision is made. This usually takes 1–3 business days.
                </p>
              </div>
            )}

            {myProfile.status === 'approved' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {[
                  ['Email', myProfile.email],
                  ['Phone', myProfile.phone ?? '—'],
                  ['ID Number', myProfile.id_number],
                  ['Class Sponsor', myProfile.sponsor_name],
                  ['Principal', myProfile.principal_name],
                  ['Member Since', new Date(myProfile.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })],
                  ['Approved By', myProfile.approved_by ?? '—'],
                  ['Member ID', myProfile.id.slice(0,8).toUpperCase()],
                ].map(([l, v]) => (
                  <div key={l} className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className="font-black text-slate-800 text-sm">{v}</p>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setView('directory')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-6 py-3 rounded-2xl text-xs transition-all">
              Back to Directory
            </button>
          </div>
        )}

        {/* Directory View */}
        {view === 'directory' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-slate-100">
                <p className="text-4xl font-black text-slate-900">{members.length}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Active Members</p>
              </div>
              <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-slate-100">
                <p className="text-4xl font-black text-slate-900">{chapters.length}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Chapters</p>
              </div>
              <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-slate-100">
                <p className="text-4xl font-black text-slate-900">
                  {[...new Set(members.map(m => m.year_graduated))].length}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Class Years</p>
              </div>
            </div>

            {!myProfile && (
              <div className="bg-slate-900 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-white font-black uppercase italic text-lg">Not a member yet?</p>
                  <p className="text-white/50 text-xs font-bold mt-1">Join the {orgName} alumni community today</p>
                </div>
                <Link href="/members/register"
                  className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl text-sm transition-all shrink-0">
                  Register Now →
                </Link>
              </div>
            )}

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, class or chapter..."
                  className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/>
              </div>
              <select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)}
                className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-sm bg-white">
                {allChapters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Member cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filtered.map(m => (
                <button key={m.id} onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  className="bg-white rounded-3xl p-5 text-left border border-slate-100 hover:border-red-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      {m.photo_url
                        ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                        : <div className="w-full h-full flex items-center justify-center bg-slate-100">
                            <span className="text-xl font-black text-slate-400">{m.full_name.charAt(0)}</span>
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">{m.full_name}</p>
                      <p className="text-xs text-red-600 font-bold truncate">{m.chapter}</p>
                      <p className="text-[10px] text-slate-400 font-bold">Class of {m.year_graduated}</p>
                    </div>
                    {expanded === m.id ? <ChevronUp size={14} className="text-slate-400 shrink-0"/> : <ChevronDown size={14} className="text-slate-400 shrink-0"/>}
                  </div>

                  {expanded === m.id && (
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      {[
                        ['Class', m.class_name],
                        ['Sponsor', m.sponsor_name],
                        ['Principal', m.principal_name],
                        ['Member Since', new Date(m.created_at).toLocaleDateString()],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{l}</span>
                          <span className="text-[10px] font-black text-slate-700 text-right max-w-[55%]">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-3 text-center py-16 text-slate-400">
                  <Users size={48} className="mx-auto mb-4 opacity-20"/>
                  <p className="font-black uppercase tracking-widest text-sm">No members found</p>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            {activity.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                <h3 className="text-lg font-black uppercase italic text-slate-800 mb-6 flex items-center gap-2">
                  <Activity size={18} className="text-red-600"/> Recent Activity
                </h3>
                <div className="space-y-3">
                  {activity.slice(0, 10).map(a => (
                    <div key={a.id} className="flex items-start gap-4 p-3 bg-slate-50 rounded-2xl">
                      <div className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 text-sm">{a.member_name}</p>
                        <p className="text-xs text-slate-500 font-bold">{a.action}</p>
                        {a.details && <p className="text-xs text-slate-400">{a.details}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 font-bold">{a.chapter}</p>
                        <p className="text-[10px] text-slate-300 font-bold">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
