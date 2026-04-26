"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, Search, Loader2, ChevronDown, ChevronUp,
  LogIn, UserPlus, LayoutDashboard, Globe, CreditCard,
  DollarSign, Trophy, Vote, Sun, Moon, Monitor, TrendingUp
} from 'lucide-react';
import Link from 'next/link';

interface Member { id: string; full_name: string; class_name: string; year_graduated: number; sponsor_name: string; principal_name: string; chapter: string; photo_url: string | null; created_at: string; }
interface ActivityEntry { id: string; member_name: string; chapter: string; action: string; details: string | null; created_at: string; }
interface MemberProfile { id: string; full_name: string; theme: string | null; }

export default function MembersPage() {
  const [members, setMembers]       = useState<Member[]>([]);
  const [activity, setActivity]     = useState<ActivityEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [chapterFilter, setFilter]  = useState('All');
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [orgName, setOrgName]       = useState('BWIAA');
  const [chapters, setChapters]     = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [myProfile, setMyProfile]   = useState<MemberProfile | null>(null);
  const [theme, setTheme]           = useState('system');
  const [isDark, setIsDark]         = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(theme === 'dark' || (theme === 'system' && prefersDark));
  }, [theme]);

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
      const { data: acts } = await supabase.from('activity_log').select('*')
        .order('created_at', { ascending: false }).limit(20);
      if (acts) setActivity(acts);

      // Check auth — look up by BOTH auth_user_id AND email to handle legacy accounts
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        let mem: any = null;
        // First try auth_user_id
        const { data: m1 } = await supabase.from('members').select('id,full_name,theme,auth_user_id')
          .eq('auth_user_id', user.id).maybeSingle();
        if (m1) {
          mem = m1;
        } else {
          // Fallback: find by email and link auth_user_id
          const { data: m2 } = await supabase.from('members').select('id,full_name,theme,auth_user_id')
            .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
          if (m2) {
            mem = m2;
            // Link the auth_user_id if not set
            if (!m2.auth_user_id) {
              await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
            }
          }
        }
        if (mem) {
          setMyProfile({ id: mem.id, full_name: mem.full_name, theme: mem.theme });
          setTheme(mem.theme ?? 'system');
        }
      }
      setLoading(false);
    })();
  }, []);

  async function saveTheme(t: string) {
    setTheme(t);
    if (myProfile) {
      await supabase.from('members').update({ theme: t }).eq('id', myProfile.id);
      setMyProfile(prev => prev ? {...prev, theme: t} : prev);
    }
  }

  const bg      = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const card    = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const text    = isDark ? 'text-white' : 'text-slate-900';
  const subtext = isDark ? 'text-white/40' : 'text-slate-500';
  const inputBg = isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400';
  const hdr     = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';

  const filtered = members.filter(m => {
    const s = search.toLowerCase();
    return (!s || m.full_name.toLowerCase().includes(s) || m.class_name.toLowerCase().includes(s) || m.chapter.toLowerCase().includes(s))
      && (chapterFilter === 'All' || m.chapter === chapterFilter);
  });

  if (loading) return (
    <div className={`min-h-screen ${isDark?'bg-slate-950':'bg-slate-100'} flex items-center justify-center`}>
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className={`min-h-screen ${bg} pb-20 transition-colors duration-200`}>

      {/* ── Header ── */}
      <div className={`${hdr} border-b sticky top-0 z-30 transition-colors`}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl shrink-0"><Users size={18} className="text-white"/></div>
            <div>
              <p className={`font-black uppercase italic text-sm ${text}`}>{orgName}</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${subtext}`}>Alumni Member Community</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <div className={`flex gap-1 p-1 rounded-xl ${isDark?'bg-white/10':'bg-slate-100'}`}>
              {[{k:'light',i:<Sun size={12}/>},{k:'system',i:<Monitor size={12}/>},{k:'dark',i:<Moon size={12}/>}].map(t=>(
                <button key={t.k} onClick={()=>saveTheme(t.k)}
                  className={`p-1.5 rounded-lg transition-all ${theme===t.k?'bg-red-600 text-white':`${subtext} hover:text-red-600`}`}>
                  {t.i}
                </button>
              ))}
            </div>
            <Link href="/" className={`text-xs font-black uppercase tracking-widest ${subtext} hover:text-red-600 transition-all`}>← Home</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">

        {/* ── Account section — shows member name or login prompt ── */}
        <div className={`${card} border rounded-3xl p-6 transition-colors`}>
          {myProfile ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${subtext} mb-1`}>Your Account</p>
                <p className={`text-xl font-black uppercase italic ${text}`}>{myProfile.full_name}</p>
                <p className={`text-xs font-bold ${subtext} mt-0.5`}>Active Member</p>
              </div>
              <Link href="/members/dashboard"
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all shrink-0">
                <LayoutDashboard size={16}/> My Dashboard
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/members/login"
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl text-sm transition-all">
                <LogIn size={16}/> Sign In to Member Account
              </Link>
              <Link href="/members/register"
                className={`flex-1 flex items-center justify-center gap-2 ${isDark?'bg-white/10 hover:bg-white/20 border border-white/10':'bg-slate-100 hover:bg-slate-200 border border-slate-200'} ${text} font-black uppercase py-4 rounded-2xl text-sm transition-all`}>
                <UserPlus size={16}/> Create Account
              </Link>
            </div>
          )}
        </div>

        {/* ── Quick links — colorful, at the top ── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { href:'/dues',        label:'Pay Dues',        icon:<CreditCard size={20}/>, color:'bg-green-600',  hover:'hover:bg-green-700'  },
            { href:'/finances',    label:'Finances',         icon:<DollarSign size={20}/>, color:'bg-blue-600',   hover:'hover:bg-blue-700'   },
            { href:'/investments', label:'Investments',      icon:<TrendingUp size={20}/>, color:'bg-emerald-700',hover:'hover:bg-emerald-800' },
            { href:'/history',     label:'Election History', icon:<Trophy size={20}/>,     color:'bg-amber-500',  hover:'hover:bg-amber-600'  },
            { href:'/',            label:'Voting Portal',    icon:<Vote size={20}/>,       color:'bg-red-600',    hover:'hover:bg-red-700'    },
          ].map(({ href, label, icon, color, hover }) => (
            <Link key={href} href={href}
              className={`${color} ${hover} text-white rounded-3xl p-5 flex flex-col items-center gap-3 text-center transition-all shadow-lg`}>
              {icon}
              <span className="font-black text-xs uppercase tracking-widest leading-tight">{label}</span>
            </Link>
          ))}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          {[{label:'Active Members',value:members.length},{label:'Chapters',value:chapters.length},{label:'Class Years',value:[...new Set(members.map(m=>m.year_graduated))].length}].map(s=>(
            <div key={s.label} className={`${card} border rounded-3xl p-5 text-center transition-colors`}>
              <p className={`text-3xl font-black ${text}`}>{s.value}</p>
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${subtext}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Directory ── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Globe size={14} className="text-red-500 shrink-0"/>
            <h2 className={`font-black uppercase italic text-lg ${text}`}>Member Directory</h2>
            <div className={`flex-1 h-px ${isDark?'bg-white/10':'bg-slate-200'}`}/>
            <span className={`text-[10px] font-bold uppercase ${subtext}`}>Public</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={13} className={`absolute left-4 top-1/2 -translate-y-1/2 ${subtext}`}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, class, chapter..."
                className={`w-full pl-10 pr-4 py-3.5 border rounded-2xl font-bold outline-none text-sm focus:border-red-600 ${inputBg}`}/>
            </div>
            <select value={chapterFilter} onChange={e=>setFilter(e.target.value)}
              className={`border rounded-2xl px-4 py-3.5 font-bold outline-none text-sm focus:border-red-600 ${inputBg}`}>
              {['All',...chapters].map(c=><option key={c} value={c} className={isDark?'bg-slate-900':'bg-white'}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map(m=>(
              <button key={m.id} onClick={()=>setExpanded(expanded===m.id?null:m.id)}
                className={`${card} border hover:border-red-400 rounded-2xl p-4 text-left transition-all`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                    {m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                      :<div className={`w-full h-full flex items-center justify-center ${isDark?'bg-slate-700':'bg-slate-200'}`}>
                        <span className={`text-lg font-black ${subtext}`}>{m.full_name.charAt(0)}</span>
                      </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-sm truncate ${text}`}>{m.full_name}</p>
                    <p className="text-xs text-red-500 font-bold truncate">{m.chapter}</p>
                    <p className={`text-[10px] font-bold ${subtext}`}>Class of {m.year_graduated}</p>
                  </div>
                  {expanded===m.id?<ChevronUp size={13} className={subtext}/>:<ChevronDown size={13} className={subtext}/>}
                </div>
                {expanded===m.id&&(
                  <div className={`border-t ${isDark?'border-white/10':'border-slate-100'} pt-2 space-y-1`}>
                    {[['Class',m.class_name],['Sponsor',m.sponsor_name],['Principal',m.principal_name],['Since',new Date(m.created_at).toLocaleDateString()]].map(([l,v])=>(
                      <div key={l} className="flex justify-between">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${subtext}`}>{l}</span>
                        <span className={`text-[10px] font-black ${text} text-right max-w-[60%]`}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
            {filtered.length===0&&(
              <div className="col-span-3 text-center py-12">
                <Users size={40} className={`mx-auto mb-3 ${subtext} opacity-30`}/>
                <p className={`font-black uppercase tracking-widest text-sm ${subtext}`}>No members found</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Activity ── */}
        {activity.length>0&&(
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
              <h2 className={`font-black uppercase italic text-lg ${text}`}>Recent Activity</h2>
              <div className={`flex-1 h-px ${isDark?'bg-white/10':'bg-slate-200'}`}/>
            </div>
            <div className={`${card} border rounded-3xl overflow-hidden transition-colors`}>
              {activity.slice(0,8).map((a,i)=>(
                <div key={a.id} className={`flex items-start gap-3 p-4 ${i<7?`border-b ${isDark?'border-white/5':'border-slate-100'}`:''}`}>
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-sm ${text}`}>{a.member_name}</p>
                    <p className={`text-xs font-bold ${subtext}`}>{a.action}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[10px] font-bold ${subtext}`}>{a.chapter}</p>
                    <p className={`text-[10px] ${subtext}`}>{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
