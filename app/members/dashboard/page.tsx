"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User, CreditCard, Activity, LogOut, CheckCircle2, Clock,
  XCircle, Sun, Moon, Monitor, ChevronDown, ChevronUp,
  Settings, Loader2, AlertCircle, Receipt
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Member {
  id: string; auth_user_id: string; full_name: string; email: string;
  phone: string|null; class_name: string; year_graduated: number;
  sponsor_name: string; principal_name: string; id_number: string;
  chapter: string; chapter_locked: boolean; photo_url: string|null;
  status: string; theme: string; approved_by: string|null;
  approved_at: string|null; created_at: string;
}
interface DuesPayment {
  id: string; amount: number; currency: string; period: string;
  payment_method: string; status: string; created_at: string;
  screenshot_url: string|null; notes: string|null;
}
interface ActivityEntry {
  id: string; action: string; details: string|null; chapter: string; created_at: string;
}

const THEMES = [
  { key: 'light',  label: 'Light',  icon: <Sun size={16}/> },
  { key: 'dark',   label: 'Dark',   icon: <Moon size={16}/> },
  { key: 'system', label: 'System', icon: <Monitor size={16}/> },
];

const STATUS_CFG: Record<string, {label:string;color:string;bg:string;border:string}> = {
  pending:  {label:'Pending Approval', color:'text-yellow-700', bg:'bg-yellow-50', border:'border-yellow-200'},
  approved: {label:'Active Member',    color:'text-green-700',  bg:'bg-green-50',  border:'border-green-200'},
  rejected: {label:'Not Approved',     color:'text-red-700',    bg:'bg-red-50',    border:'border-red-200'},
};

const DUES_STATUS: Record<string, {label:string;color:string}> = {
  pending:  {label:'Pending',  color:'text-yellow-600'},
  approved: {label:'Approved', color:'text-green-600'},
  rejected: {label:'Rejected', color:'text-red-600'},
};

export default function MemberDashboard() {
  const router = useRouter();
  const [member, setMember]           = useState<Member|null>(null);
  const [dues, setDues]               = useState<DuesPayment[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<'overview'|'dues'|'activity'|'settings'>('overview');
  const [theme, setTheme]             = useState('system');
  const [savingTheme, setSavingTheme] = useState(false);
  const [orgName, setOrgName]         = useState('BWIAA');
  const [expandedDues, setExpandedDues] = useState<string|null>(null);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'light') root.classList.remove('dark');
    else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/members/login'); return; }

      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }

      const { data: mem } = await supabase.from('members')
        .select('*').eq('auth_user_id', user.id).maybeSingle();

      if (!mem) {
        // Auth account exists but no member profile — redirect to register
        router.push('/members/register');
        return;
      }

      setMember(mem);
      setTheme(mem.theme ?? 'system');

      // Load personal dues
      const { data: duesData } = await supabase.from('dues_payments')
        .select('*').eq('member_id', mem.id)
        .order('created_at', { ascending: false });
      if (duesData) setDues(duesData);

      // Load personal activity
      const { data: actData } = await supabase.from('activity_log')
        .select('*').eq('member_id', mem.id)
        .order('created_at', { ascending: false }).limit(30);
      if (actData) setActivity(actData);

      setLoading(false);
    })();
  }, []);

  async function saveTheme(newTheme: string) {
    setTheme(newTheme);
    if (!member) return;
    setSavingTheme(true);
    await supabase.from('members').update({ theme: newTheme }).eq('id', member.id);
    setMember(prev => prev ? {...prev, theme: newTheme} : prev);
    setSavingTheme(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/members');
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  if (!member) return null;

  const statusCfg = STATUS_CFG[member.status] ?? STATUS_CFG['pending'];
  const totalDues = dues.filter(d => d.status === 'approved').reduce((s,d) => s + d.amount, 0);
  const pendingDues = dues.filter(d => d.status === 'pending').length;

  const tabs = [
    {id:'overview', label:'Overview', icon:<User size={14}/>},
    {id:'dues',     label:'My Dues',  icon:<CreditCard size={14}/>},
    {id:'activity', label:'Activity', icon:<Activity size={14}/>},
    {id:'settings', label:'Settings', icon:<Settings size={14}/>},
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 transition-colors duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/5 p-5 sticky top-0 z-30 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
              {member.photo_url
                ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                : <div className="w-full h-full flex items-center justify-center bg-red-600">
                    <span className="text-white font-black text-sm">{member.full_name.charAt(0)}</span>
                  </div>
              }
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-sm uppercase leading-tight">{member.full_name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{member.chapter}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden md:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
              {member.status === 'approved' ? <CheckCircle2 size={10}/> : member.status === 'pending' ? <Clock size={10}/> : <XCircle size={10}/>}
              {statusCfg.label}
            </span>
            <Link href="/members" className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-black uppercase tracking-widest hidden md:block">Directory</Link>
            <button onClick={signOut} className="bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/60 hover:text-red-600 p-2.5 rounded-xl transition-all">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </div>

      {/* Pending banner */}
      {member.status === 'pending' && (
        <div className="bg-yellow-500 text-yellow-950 text-center py-3 px-6 text-xs font-black uppercase tracking-widest">
          ⏳ Your membership application is pending approval by your chapter administrator
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-1 rounded-2xl mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all whitespace-nowrap flex-1 justify-center
                ${activeTab===t.id ? 'bg-red-600 text-white' : 'text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab==='overview' && (
          <div className="space-y-6">
            {/* Profile card */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/10 shadow-sm">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200 dark:border-white/10">
                  {member.photo_url
                    ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                    : <div className="w-full h-full flex items-center justify-center bg-red-600">
                        <span className="text-4xl font-black text-white">{member.full_name.charAt(0)}</span>
                      </div>
                  }
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-black uppercase italic text-slate-900 dark:text-white">{member.full_name}</h2>
                  <p className="text-red-600 font-black text-sm uppercase mt-1">{member.chapter}</p>
                  <p className="text-slate-400 font-bold text-xs mt-1">{member.class_name} · Class of {member.year_graduated}</p>
                  <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full border text-xs font-black uppercase ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
                    {member.status==='approved'?<CheckCircle2 size={12}/>:member.status==='pending'?<Clock size={12}/>:<XCircle size={12}/>}
                    {statusCfg.label}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {label:'Total Paid', value:`$${totalDues.toLocaleString()}`, color:'bg-green-600'},
                {label:'Pending Dues', value:String(pendingDues), color:'bg-yellow-500'},
                {label:'Activities', value:String(activity.length), color:'bg-blue-600'},
                {label:'Member Since', value:new Date(member.created_at).getFullYear().toString(), color:'bg-slate-700'},
              ].map(s => (
                <div key={s.label} className={`${s.color} text-white rounded-3xl p-5 text-center shadow`}>
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Details grid */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/10 shadow-sm">
              <h3 className="font-black text-slate-800 dark:text-white uppercase italic text-lg mb-6">Member Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ['Member ID', member.id.slice(0,8).toUpperCase()],
                  ['Email', member.email],
                  ['Phone', member.phone ?? '—'],
                  ['ID Number', member.id_number],
                  ['Class Sponsor', member.sponsor_name],
                  ['Principal', member.principal_name],
                  ['Chapter', `${member.chapter} ${member.chapter_locked ? '🔒' : ''}`],
                  ['Approved By', member.approved_by ?? 'Pending'],
                ].map(([l,v]) => (
                  <div key={l} className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                    <p className="font-black text-slate-800 dark:text-white text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            {member.status === 'approved' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/dues" className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 hover:border-red-400 transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center shrink-0">
                    <CreditCard size={20} className="text-white"/>
                  </div>
                  <div>
                    <p className="font-black text-slate-800 dark:text-white uppercase">Pay Dues</p>
                    <p className="text-xs text-slate-400 font-bold mt-0.5">Submit your chapter dues payment</p>
                  </div>
                </Link>
                <Link href="/finances" className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 hover:border-red-400 transition-all shadow-sm">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Receipt size={20} className="text-white"/>
                  </div>
                  <div>
                    <p className="font-black text-slate-800 dark:text-white uppercase">Chapter Finances</p>
                    <p className="text-xs text-slate-400 font-bold mt-0.5">View public financial records</p>
                  </div>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Dues ── */}
        {activeTab==='dues' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 dark:text-white uppercase italic text-xl">My Dues History</h3>
              <Link href="/dues" className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-3 rounded-2xl transition-all">
                + Submit Payment
              </Link>
            </div>
            {dues.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-16 text-center border border-slate-200 dark:border-white/10">
                <CreditCard size={48} className="mx-auto mb-4 text-slate-200 dark:text-white/10"/>
                <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No dues payments yet</p>
              </div>
            ) : dues.map(d => {
              const cfg = DUES_STATUS[d.status] ?? DUES_STATUS['pending'];
              const isOpen = expandedDues === d.id;
              return (
                <div key={d.id} className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm">
                  <button onClick={() => setExpandedDues(isOpen ? null : d.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 dark:text-white">{d.period}</p>
                      <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(d.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <p className="font-black text-xl text-slate-900 dark:text-white shrink-0">${d.amount.toLocaleString()}</p>
                    {isOpen?<ChevronUp size={14} className="text-slate-400 shrink-0"/>:<ChevronDown size={14} className="text-slate-400 shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-white/5 p-5 bg-slate-50 dark:bg-white/5 space-y-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-white/40">{d.payment_method==='in_person'?'In Person Payment':'Screenshot/Transfer'}</p>
                      {d.notes && <p className="text-sm font-bold text-slate-700 dark:text-white/70 italic">"{d.notes}"</p>}
                      {d.screenshot_url && (
                        <img src={d.screenshot_url} className="rounded-2xl max-h-40 cursor-pointer"
                          alt="Proof" onClick={() => window.open(d.screenshot_url!,'_blank')}/>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Activity ── */}
        {activeTab==='activity' && (
          <div className="space-y-4">
            <h3 className="font-black text-slate-800 dark:text-white uppercase italic text-xl">My Activity History</h3>
            {activity.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-16 text-center border border-slate-200 dark:border-white/10">
                <Activity size={48} className="mx-auto mb-4 text-slate-200 dark:text-white/10"/>
                <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                {activity.map((a, i) => (
                  <div key={a.id} className={`flex items-start gap-4 p-5 ${i < activity.length-1 ? 'border-b border-slate-100 dark:border-white/5' : ''}`}>
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0"/>
                    <div className="flex-1">
                      <p className="font-black text-slate-800 dark:text-white text-sm">{a.action}</p>
                      {a.details && <p className="text-xs text-slate-500 dark:text-white/40 font-bold mt-0.5">{a.details}</p>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold shrink-0">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {activeTab==='settings' && (
          <div className="space-y-6">
            <h3 className="font-black text-slate-800 dark:text-white uppercase italic text-xl">Account Settings</h3>

            {/* Theme */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/10 shadow-sm">
              <h4 className="font-black text-slate-700 dark:text-white uppercase tracking-widest text-sm mb-2">Display Theme</h4>
              <p className="text-xs text-slate-400 font-bold mb-5">Choose how the member portal looks for you</p>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map(t => (
                  <button key={t.key} onClick={() => saveTheme(t.key)}
                    className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all ${theme===t.key?'border-red-600 bg-red-50 dark:bg-red-950':'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}>
                    <span className={theme===t.key?'text-red-600':'text-slate-400 dark:text-white/40'}>{t.icon}</span>
                    <span className={`font-black text-xs uppercase tracking-widest ${theme===t.key?'text-red-700 dark:text-red-400':'text-slate-500 dark:text-white/40'}`}>{t.label}</span>
                    {theme===t.key && <span className="text-[10px] text-red-500 font-black">✓ Active</span>}
                  </button>
                ))}
              </div>
              {savingTheme && <p className="text-xs text-slate-400 font-bold mt-3 text-center">Saving...</p>}
            </div>

            {/* Chapter info */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/10 shadow-sm">
              <h4 className="font-black text-slate-700 dark:text-white uppercase tracking-widest text-sm mb-2">Chapter</h4>
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                <div>
                  <p className="font-black text-slate-800 dark:text-white">{member.chapter}</p>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">Your permanent chapter</p>
                </div>
                <div className="bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40 text-[10px] font-black uppercase px-3 py-1.5 rounded-xl tracking-widest">
                  🔒 Locked
                </div>
              </div>
              <p className="text-xs text-slate-400 font-bold mt-3">
                Your chapter is permanently assigned. Contact your chapter administrator to request a transfer.
              </p>
            </div>

            {/* Danger zone */}
            <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900 rounded-[2.5rem] p-8">
              <h4 className="font-black text-red-700 dark:text-red-400 uppercase tracking-widest text-sm mb-2">Account</h4>
              <button onClick={signOut}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all">
                <LogOut size={14}/> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
