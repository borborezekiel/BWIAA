"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Search, Loader2, ChevronDown, ChevronUp, LogIn, UserPlus, LayoutDashboard, Globe } from 'lucide-react';
import Link from 'next/link';

interface Member { id: string; full_name: string; class_name: string; year_graduated: number; sponsor_name: string; principal_name: string; chapter: string; photo_url: string | null; created_at: string; }
interface ActivityEntry { id: string; member_name: string; chapter: string; action: string; details: string | null; created_at: string; }

export default function MembersPage() {
  const [members, setMembers]         = useState<Member[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [chapterFilter, setFilter]    = useState('All');
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [orgName, setOrgName]         = useState('BWIAA');
  const [chapters, setChapters]       = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [hasMembership, setHasMember] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
        if (get('chapters')) { try { setChapters(JSON.parse(get('chapters'))); } catch {} }
      }
      const { data: mems } = await supabase.from('members')
        .select('id,full_name,class_name,year_graduated,sponsor_name,principal_name,chapter,photo_url,created_at')
        .eq('status', 'approved').order('full_name');
      if (mems) setMembers(mems);
      const { data: acts } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20);
      if (acts) setActivity(acts);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        const { data: mem } = await supabase.from('members').select('id').eq('auth_user_id', user.id).maybeSingle();
        if (mem) setHasMember(true);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = members.filter(m => {
    const s = search.toLowerCase();
    return (!s || m.full_name.toLowerCase().includes(s) || m.class_name.toLowerCase().includes(s) || m.chapter.toLowerCase().includes(s))
      && (chapterFilter === 'All' || m.chapter === chapterFilter);
  });

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-red-600" size={48}/></div>;

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-red-600 p-2 rounded-xl"><Users size={20} className="text-white"/></div>
              <div>
                <h1 className="text-white font-black uppercase italic">{orgName}</h1>
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Alumni Member Community</p>
              </div>
            </div>
            <Link href="/" className="text-white/30 hover:text-white text-xs font-black uppercase tracking-widest transition-all">← Home</Link>
          </div>

          {/* TWO CLEAR PATHS */}
          <div className={`grid ${isLoggedIn && hasMembership ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-4">
                {isLoggedIn && hasMembership ? 'Your Account' : 'Already a Member?'}
              </p>
              {isLoggedIn && hasMembership ? (
                <Link href="/members/dashboard" className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl text-sm transition-all">
                  <LayoutDashboard size={16}/> Go to My Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/members/login" className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl text-sm transition-all">
                    <LogIn size={16}/> Sign In to Member Account
                  </Link>
                  <p className="text-white/30 text-[10px] font-bold text-center mt-2">Email & password</p>
                </>
              )}
            </div>
            {/* Only show Join card when NOT logged in */}
            {!isLoggedIn && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-4">Want to Join?</p>
                <Link href="/members/register" className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-black uppercase py-4 rounded-2xl text-sm transition-all border border-white/10">
                  <UserPlus size={16}/> Create Member Account
                </Link>
                <p className="text-white/30 text-[10px] font-bold text-center mt-2">100 LRD fee · Pending approval</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-10 space-y-10">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[{label:'Active Members',value:members.length},{label:'Chapters',value:chapters.length},{label:'Class Years',value:[...new Set(members.map(m=>m.year_graduated))].length}].map(s=>(
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
              <p className="text-3xl font-black text-white">{s.value}</p>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Directory */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Globe size={16} className="text-red-500 shrink-0"/>
            <h2 className="text-white font-black uppercase italic text-xl">Member Directory</h2>
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/30 text-[10px] font-bold uppercase">Public</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, class, chapter..."
                className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 focus:border-red-600 rounded-2xl font-bold outline-none text-sm text-white placeholder-white/30"/>
            </div>
            <select value={chapterFilter} onChange={e=>setFilter(e.target.value)}
              className="bg-white/5 border border-white/10 text-white rounded-2xl px-5 py-4 font-bold outline-none text-sm">
              {['All',...chapters].map(c=><option key={c} value={c} className="bg-slate-900">{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map(m=>(
              <button key={m.id} onClick={()=>setExpanded(expanded===m.id?null:m.id)}
                className="bg-white/5 border border-white/10 hover:border-red-500/40 rounded-3xl p-5 text-left transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-700 shrink-0 border border-white/10">
                    {m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                      :<div className="w-full h-full flex items-center justify-center"><span className="text-xl font-black text-white/40">{m.full_name.charAt(0)}</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-sm truncate">{m.full_name}</p>
                    <p className="text-xs text-red-400 font-bold truncate">{m.chapter}</p>
                    <p className="text-[10px] text-white/30 font-bold">Class of {m.year_graduated}</p>
                  </div>
                  {expanded===m.id?<ChevronUp size={14} className="text-white/30 shrink-0"/>:<ChevronDown size={14} className="text-white/30 shrink-0"/>}
                </div>
                {expanded===m.id&&(
                  <div className="border-t border-white/10 pt-3 space-y-2">
                    {[['Class',m.class_name],['Sponsor',m.sponsor_name],['Principal',m.principal_name],['Since',new Date(m.created_at).toLocaleDateString()]].map(([l,v])=>(
                      <div key={l} className="flex justify-between">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{l}</span>
                        <span className="text-[10px] font-black text-white/60 text-right max-w-[60%]">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
            {filtered.length===0&&<div className="col-span-3 text-center py-16 text-white/20"><Users size={48} className="mx-auto mb-4 opacity-30"/><p className="font-black uppercase tracking-widest text-sm">No members found</p></div>}
          </div>
        </div>

        {/* Activity */}
        {activity.length>0&&(
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
              <h2 className="text-white font-black uppercase italic text-xl">Recent Activity</h2>
              <div className="flex-1 h-px bg-white/10"/>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
              {activity.slice(0,8).map((a,i)=>(
                <div key={a.id} className={`flex items-start gap-4 p-4 ${i<7?'border-b border-white/5':''}`}>
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm">{a.member_name}</p>
                    <p className="text-white/40 text-xs font-bold">{a.action}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white/30 text-[10px] font-bold">{a.chapter}</p>
                    <p className="text-white/20 text-[10px]">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{href:'/dues',label:'Pay Dues'},{href:'/finances',label:'Finances'},{href:'/history',label:'Election History'},{href:'/',label:'Voting Portal'}].map(({href,label})=>(
            <Link key={href} href={href} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white font-black uppercase px-4 py-4 rounded-2xl text-[10px] text-center transition-all tracking-widest">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
