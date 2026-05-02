"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, LogOut, Loader2, BarChart2, Users, UserCheck,
  UserX, List, Settings, PlusCircle, Trash2, Trophy, Activity,
  CheckCircle2, XCircle, Terminal, Crown, Download, Printer,
  FileText, Sliders, Search, CreditCard, DollarSign, Key, Calendar,
  MapPin, Bell, TrendingUp, ChevronRight, Lock, Eye, EyeOff,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate      { id: number; full_name: string; position_name: string; chapter: string; photo_url?: string; }
interface VoteRow        { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }
interface EligibleVoter  { email: string; chapter: string; created_at: string; }
interface BlacklistedVoter { id: number; email: string; reason: string; created_at: string; }
interface ElectionAdmin  { id: number; email: string; branch: string; }
interface Application {
  id: string; full_name: string; dob: string; class_name: string; year_graduated: number;
  sponsor_name: string; principal_name: string; id_number: string; applicant_email: string;
  chapter: string; position_name: string; payment_method: string; photo_url: string;
  payment_screenshot_1: string | null; payment_screenshot_2: string | null; payment_screenshot_3: string | null;
  status: 'pending' | 'approved' | 'rejected'; rejection_reason: string | null;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null;
}
interface Member {
  id: string; full_name: string; email: string; phone: string | null;
  class_name: string; year_graduated: number; sponsor_name: string;
  principal_name: string; id_number: string; chapter: string;
  photo_url: string | null; status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null; approved_at: string | null; created_at: string;
}
interface DuesPayment {
  id: string; member_id: string | null; member_name: string;
  chapter: string; amount: number; currency: string; period: string;
  payment_method: string; screenshot_url: string | null;
  status: string; notes: string | null;
  approved_by: string | null; approved_at: string | null; created_at: string;
}
interface EventRow {
  id: string; title: string; description: string | null;
  chapter: string | null; event_date: string; event_time: string | null;
  location: string | null; event_type: string; created_by: string; created_at: string;
}
interface InvestmentRow {
  id: string; title: string; category: string; description: string | null;
  invested_amount: number; currency: string; return_amount: number | null;
  return_date: string | null; status: string; distributed_at: string | null;
  created_by: string; created_at: string; approved_by: string | null;
  total_points_used: number | null; member_count_used: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const DEFAULT_CONFIG = {
  org_name: "BWIAA", election_title: "National Alumni Portal", election_year: "2026",
  currency: "LRD", currency_symbol: "$", maintenance_fee: 20, maintenance_currency: "LRD",
  chapters: [
    "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
    "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter","Paynesville Branch","Mother Chapter",
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
type ElectionConfig = typeof DEFAULT_CONFIG;
let CHAPTERS  = DEFAULT_CONFIG.chapters;
let POSITIONS = DEFAULT_CONFIG.positions_fees.map(p => p.position);

// Election phase type
interface ElectionPhases {
  registration_open: boolean;
  voting_open: boolean;
  results_announced: boolean;
}

type Tab = "overview" | "results" | "candidates" | "voters" | "roster" | "admins" |
           "applications" | "settings" | "members" | "dues" | "events" | "audit" | "investments";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [user, setUser]                     = useState<any>(null);
  const [isHeadAdmin, setIsHeadAdmin]       = useState(false);
  const [myAdminChapter, setMyAdminChapter] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized]     = useState(false);
  const [loading, setLoading]               = useState(true);
  const [activeTab, setActiveTab]           = useState<Tab>("overview");

  const [votes, setVotes]               = useState<VoteRow[]>([]);
  const [candidates, setCandidates]     = useState<Candidate[]>([]);
  const [roster, setRoster]             = useState<EligibleVoter[]>([]);
  const [blacklist, setBlacklist]       = useState<BlacklistedVoter[]>([]);
  const [admins, setAdmins]             = useState<ElectionAdmin[]>([]);
  const [deadline, setDeadline]         = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [members, setMembers]           = useState<Member[]>([]);
  const [dues, setDues]                 = useState<DuesPayment[]>([]);
  const [events, setEvents]             = useState<EventRow[]>([]);
  const [auditLog, setAuditLog]         = useState<any[]>([]);
  const [config, setConfig]             = useState<ElectionConfig>(DEFAULT_CONFIG);
  const [phases, setPhases]             = useState<ElectionPhases>({
    registration_open: false, voting_open: false, results_announced: false,
  });

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser(user);
      const lowerEmail = user.email?.toLowerCase();
      const { data: settingRow } = await supabase
        .from('election_settings').select('value').eq('key', 'head_admins').maybeSingle();
      let headAdmins: string[] = [HEAD_ADMIN_EMAIL.toLowerCase()];
      if (settingRow?.value) {
        try { headAdmins = JSON.parse(settingRow.value).map((e: string) => e.toLowerCase()); } catch {}
      }
      if (headAdmins.includes(lowerEmail!)) {
        setIsHeadAdmin(true); setIsAuthorized(true);
      } else {
        const { data } = await supabase
          .from('election_admins').select('email, branch').eq('email', lowerEmail).maybeSingle();
        if (data) { setIsAuthorized(true); setMyAdminChapter(data.branch); }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchAll();
    const live = supabase.channel('admin-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        setVotes(prev => [payload.new as VoteRow, ...prev]);
      }).subscribe();
    return () => { supabase.removeChannel(live); };
  }, [isAuthorized]);

  async function fetchAll() {
    const [v, c, r, b, a, settingsRes, ap, mem, duesRes, evRes, auditRes] = await Promise.all([
      supabase.from('votes').select('*').order('created_at', { ascending: false }),
      supabase.from('candidates').select('*').order('position_name'),
      supabase.from('eligible_voters').select('*').order('email'),
      supabase.from('blacklisted_voters').select('*').order('created_at', { ascending: false }),
      supabase.from('election_admins').select('*').order('email'),
      supabase.from('election_settings').select('*'),
      supabase.from('candidate_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('members').select('*').order('created_at', { ascending: false }),
      supabase.from('dues_payments').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    if (v.data)        setVotes(v.data);
    if (c.data)        setCandidates(c.data);
    if (r.data)        setRoster(r.data);
    if (b.data)        setBlacklist(b.data);
    if (a.data)        setAdmins(a.data);
    if (ap.data)       setApplications(ap.data);
    if (mem.data)      setMembers(mem.data);
    if (duesRes.data)  setDues(duesRes.data);
    if (evRes.data)    setEvents(evRes.data);
    if (auditRes.data) setAuditLog(auditRes.data);

    if (settingsRes.data) {
      const rows = settingsRes.data as { key: string; value: string }[];
      const get  = (k: string) => rows.find(r => r.key === k)?.value;
      if (get('voting_deadline')) setDeadline(get('voting_deadline')!);
      const merged: ElectionConfig = { ...DEFAULT_CONFIG };
      if (get('org_name'))             merged.org_name             = get('org_name')!;
      if (get('election_title'))       merged.election_title       = get('election_title')!;
      if (get('election_year'))        merged.election_year        = get('election_year')!;
      if (get('currency'))             merged.currency             = get('currency')!;
      if (get('currency_symbol'))      merged.currency_symbol      = get('currency_symbol')!;
      if (get('maintenance_fee'))      merged.maintenance_fee      = Number(get('maintenance_fee'));
      if (get('maintenance_currency')) merged.maintenance_currency = get('maintenance_currency')!;
      if (get('chapters'))  { try { const p = JSON.parse(get('chapters')!);  merged.chapters = p;        CHAPTERS  = p; } catch {} }
      if (get('positions_fees')) { try { const p = JSON.parse(get('positions_fees')!); merged.positions_fees = p; POSITIONS = p.map((x: any) => x.position); } catch {} }
      setConfig(merged);
      setPhases({
        registration_open: get('registration_open') === 'true',
        voting_open:        get('voting_open')        === 'true',
        results_announced:  get('results_announced')  === 'true',
      });
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-4">
      <Loader2 className="animate-spin text-red-600" size={40}/>
      <span className="font-black uppercase tracking-widest text-sm">Verifying Access...</span>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-6 p-8 text-center">
      <XCircle size={64} className="text-red-600"/>
      <h1 className="text-3xl font-black uppercase italic">Not Signed In</h1>
      <Link href="/" className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase">Go to Voting Page</Link>
    </div>
  );
  if (!isAuthorized) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-6 p-8 text-center">
      <ShieldCheck size={64} className="text-red-600"/>
      <h1 className="text-3xl font-black uppercase italic">Access Denied</h1>
      <p className="text-slate-400 font-bold">{user.email} is not authorized.</p>
      <Link href="/" className="bg-slate-700 text-white px-8 py-4 rounded-2xl font-black uppercase">Go Back</Link>
    </div>
  );

  const pendingApps     = applications.filter(a => a.status === 'pending').length;
  const pendingMembers  = members.filter(m => m.status === 'pending').length;
  const pendingDues     = dues.filter(d => d.status === 'pending').length;

  const allTabs: { id: Tab; label: string; icon: any; headOnly?: boolean }[] = [
    { id: "overview",     label: "Overview",     icon: Activity },
    { id: "results",      label: "Results",      icon: BarChart2 },
    { id: "candidates",   label: "Candidates",   icon: List },
    { id: "applications", label: `Applications${pendingApps > 0 ? ` (${pendingApps})` : ''}`, icon: FileText },
    { id: "voters",       label: "Voters",       icon: Users },
    { id: "roster",       label: "Roster",       icon: UserCheck },
    { id: "members",      label: `Members${pendingMembers > 0 ? ` (${pendingMembers})` : ''}`, icon: Users },
    { id: "dues",         label: `Dues${pendingDues > 0 ? ` (${pendingDues})` : ''}`, icon: CreditCard },
    { id: "events",       label: "Events",       icon: Calendar },
    { id: "audit",        label: "Audit Log",    icon: FileText, headOnly: true },
    { id: "investments",  label: "Investments",  icon: TrendingUp, headOnly: true },
    { id: "admins",       label: "Admins",       icon: Settings, headOnly: true },
    { id: "settings",     label: "Settings",     icon: Sliders, headOnly: true },
  ];
  const tabs = allTabs.filter(t => !t.headOnly || isHeadAdmin);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}
          {toast.msg}
        </div>
      )}

      {/* Phase status bar */}
      <div className="bg-slate-950 text-white py-2 px-5">
        <div className="max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Election Phases:</span>
          {[
            { label: 'Registration', key: 'registration_open' as keyof ElectionPhases },
            { label: 'Voting',       key: 'voting_open'        as keyof ElectionPhases },
            { label: 'Results',      key: 'results_announced'  as keyof ElectionPhases },
          ].map(p => (
            <span key={p.key} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${phases[p.key] ? 'bg-green-500 text-white' : 'bg-white/10 text-white/30'}`}>
              {phases[p.key] ? '● ' : '○ '}{p.label}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-white/20 font-bold hidden md:block">{user.email}</span>
        </div>
      </div>

      {/* Header */}
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-40 shadow-2xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Terminal size={18}/></div>
            <div className="font-black uppercase italic leading-tight text-sm">
              BWIAA Command Center<br/>
              <span className="text-[10px] font-bold flex items-center gap-1 flex-wrap">
                {isHeadAdmin
                  ? <><Crown size={10} className="text-yellow-400"/><span className="text-yellow-400">Head Admin</span></>
                  : <span className="text-slate-400">{myAdminChapter} Chapter Admin</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-black uppercase border border-white/10 transition-all">← Voting Page</Link>
            <button onClick={handleSignOut} className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2.5 rounded-xl transition-all border border-red-600/30">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b-2 border-slate-100 sticky top-[73px] z-30 shadow-sm overflow-x-auto">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-4 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-4 transition-all
                ${activeTab === id ? 'border-red-600 text-red-600 bg-red-50' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}>
              <Icon size={14}/> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-10">
        {activeTab === "overview"     && <OverviewTab votes={votes} candidates={candidates} roster={roster} admins={admins} blacklist={blacklist} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} deadline={deadline} config={config} phases={phases}/>}
        {activeTab === "results"      && <ResultsTab votes={votes} candidates={candidates} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>}
        {activeTab === "candidates"   && <CandidatesTab candidates={candidates} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin}/>}
        {activeTab === "applications" && <ApplicationsTab applications={applications} setApplications={setApplications} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email}/>}
        {activeTab === "voters"       && <VotersTab votes={votes} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>}
        {activeTab === "roster"       && <RosterTab roster={roster} setRoster={setRoster} blacklist={blacklist} setBlacklist={setBlacklist} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} members={members}/>}
        {activeTab === "members"      && <MembersTab members={members} setMembers={setMembers} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email}/>}
        {activeTab === "dues"         && <DuesTab dues={dues} setDues={setDues} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email} config={config}/>}
        {activeTab === "events"       && <EventsTab events={events} setEvents={setEvents} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email} config={config} members={members}/>}
        {activeTab === "audit"        && isHeadAdmin && <AuditLogTab log={auditLog} config={config}/>}
        {activeTab === "investments"  && isHeadAdmin && <InvestmentsTab showToast={showToast} isHeadAdmin={isHeadAdmin} members={members} config={config}/>}
        {activeTab === "admins"       && isHeadAdmin && <AdminsTab admins={admins} setAdmins={setAdmins} showToast={showToast} deadline={deadline} setDeadline={setDeadline}/>}
        {activeTab === "settings"     && isHeadAdmin && <SettingsTab config={config} setConfig={setConfig} showToast={showToast} deadline={deadline} phases={phases} setPhases={setPhases}/>}
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function Card({ children, accent = "slate" }: { children: React.ReactNode; accent?: string }) {
  const borders: Record<string, string> = { slate: "border-slate-200", red: "border-red-300", green: "border-green-300" };
  return <div className={`bg-white rounded-[3rem] p-10 shadow-xl border-b-8 ${borders[accent] ?? "border-slate-200"}`}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-black uppercase italic mb-6 border-l-8 border-red-600 pl-5">{children}</h3>;
}
// ─────────────────────────────────────────────────────────────────────────────
// TAB: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ votes, candidates, roster, admins, blacklist, isHeadAdmin, myChapter, deadline, config, phases }: {
  votes: VoteRow[]; candidates: Candidate[]; roster: EligibleVoter[];
  admins: ElectionAdmin[]; blacklist: BlacklistedVoter[];
  isHeadAdmin: boolean; myChapter: string | null; deadline: string | null;
  config: ElectionConfig; phases: ElectionPhases;
}) {
  const scopedVotes  = isHeadAdmin ? votes : votes.filter(v => v.chapter === myChapter);
  const uniqueVoters = new Set(scopedVotes.map(v => v.voter_id)).size;
  const [timeLeft, setTimeLeft]         = useState('');
  const [votingClosed, setVotingClosed] = useState(false);

  useEffect(() => {
    if (!deadline) { setTimeLeft(''); return; }
    const tick = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('VOTING CLOSED'); setVotingClosed(true); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d > 0 ? d + 'd ' : ''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      setVotingClosed(false);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [deadline]);

  const chapterBreakdown = CHAPTERS.map(ch => ({ chapter: ch, votes: votes.filter(v => v.chapter === ch).length })).sort((a, b) => b.votes - a.votes);
  const maxV = chapterBreakdown[0]?.votes || 1;

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">{isHeadAdmin ? 'National Overview' : `${myChapter} Overview`}</h2>

      {/* Phase status cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Registration', key: 'registration_open' as keyof ElectionPhases, desc: 'Candidates can apply' },
          { label: 'Voting Open',  key: 'voting_open'        as keyof ElectionPhases, desc: 'Ballot is live' },
          { label: 'Results Live', key: 'results_announced'  as keyof ElectionPhases, desc: 'Winners announced' },
        ].map(p => (
          <div key={p.key} className={`rounded-3xl p-6 text-center border-2 ${phases[p.key] ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`text-2xl font-black ${phases[p.key] ? 'text-green-600' : 'text-slate-300'}`}>{phases[p.key] ? '●' : '○'}</div>
            <p className={`font-black text-sm uppercase mt-2 ${phases[p.key] ? 'text-green-700' : 'text-slate-400'}`}>{p.label}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Countdown */}
      {deadline && (
        <div className={`rounded-[2.5rem] p-8 text-white text-center shadow-2xl ${votingClosed ? 'bg-slate-800' : 'bg-slate-900'}`}>
          <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-60">{votingClosed ? 'Election Ended' : 'Voting Closes In'}</p>
          <p className="text-5xl md:text-7xl font-black tracking-tight tabular-nums text-red-500">{timeLeft}</p>
          <p className="text-xs font-bold uppercase tracking-widest mt-3 opacity-40">Deadline: {new Date(deadline).toLocaleString()}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {(isHeadAdmin ? [
          { label: "Total Ballots",   value: votes.length,      color: "bg-blue-600" },
          { label: "Unique Voters",   value: uniqueVoters,      color: "bg-green-600" },
          { label: "Candidates",      value: candidates.length, color: "bg-purple-600" },
          { label: "Roster Size",     value: roster.length,     color: "bg-orange-500" },
          { label: "Branch Admins",   value: admins.length,     color: "bg-slate-700" },
          { label: "Blacklisted",     value: blacklist.length,  color: "bg-red-600" },
        ] : [
          { label: `${myChapter} Ballots`, value: scopedVotes.length, color: "bg-blue-600" },
          { label: "Unique Voters",         value: uniqueVoters,        color: "bg-green-600" },
        ]).map(s => (
          <div key={s.label} className={`${s.color} text-white rounded-3xl p-8 shadow-lg`}>
            <div className="text-5xl font-black mb-2">{s.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {isHeadAdmin && (
        <Card>
          <SectionTitle>Chapter Participation</SectionTitle>
          <div className="space-y-4">
            {chapterBreakdown.map(({ chapter, votes: cnt }) => (
              <div key={chapter} className="flex items-center gap-4">
                <div className="w-40 text-xs font-bold uppercase text-slate-500 text-right shrink-0">{chapter}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className="h-full bg-red-600 rounded-full transition-all duration-700" style={{ width: `${Math.round((cnt / maxV) * 100)}%` }}/>
                </div>
                <div className="w-10 text-right font-black text-sm text-slate-700">{cnt}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Recent Activity</SectionTitle>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
          {scopedVotes.slice(0, 30).map((v, i) => (
            <div key={v.id ?? i} className="flex flex-col md:flex-row justify-between items-start md:items-center py-3 border-b border-slate-100 last:border-0 gap-1">
              <div>
                <span className="text-[9px] font-black uppercase text-blue-500 tracking-widest block">{v.chapter} · {new Date(v.created_at).toLocaleString()}</span>
                <span className="text-xs font-bold text-slate-600">{v.voter_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] bg-slate-100 px-3 py-1 rounded-lg text-slate-600 font-black uppercase">{v.position_name}</span>
                <span className="text-xs font-black text-slate-800 uppercase">→ {v.candidate_name}</span>
              </div>
            </div>
          ))}
          {scopedVotes.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-8">No votes yet.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function ResultsTab({ votes, candidates, isHeadAdmin, myChapter }: {
  votes: VoteRow[]; candidates: Candidate[]; isHeadAdmin: boolean; myChapter: string | null;
}) {
  const [filterChapter, setFilterChapter] = useState<string>(isHeadAdmin ? "ALL" : (myChapter ?? "ALL"));
  const filteredVotes = filterChapter === "ALL" ? votes : votes.filter(v => v.chapter === filterChapter);
  const positions = useMemo(() => {
    const posMap: Record<string, { candidate: string; count: number }[]> = {};
    candidates.forEach(c => {
      if (!posMap[c.position_name]) posMap[c.position_name] = [];
      const cnt = filteredVotes.filter(v => v.position_name === c.position_name && v.candidate_name === c.full_name).length;
      posMap[c.position_name].push({ candidate: c.full_name, count: cnt });
    });
    Object.keys(posMap).forEach(pos => posMap[pos].sort((a, b) => b.count - a.count));
    return posMap;
  }, [candidates, filteredVotes]);

  function exportCSV() {
    const rows = [["Position","Candidate","Votes","Percentage"]];
    Object.entries(positions).forEach(([pos, results]) => {
      const total = results.reduce((s, r) => s + r.count, 0);
      results.forEach(r => rows.push([pos, r.candidate, String(r.count), total > 0 ? `${((r.count/total)*100).toFixed(1)}%` : '0%']));
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `BWIAA_Results_${filterChapter}_${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
  }

  function printResults() {
    const content = `<html><head><title>BWIAA 2026 Election Results</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}h1{font-size:28px;font-weight:900;text-transform:uppercase;border-bottom:4px solid #dc2626;padding-bottom:12px}
    .subtitle{font-size:12px;color:#64748b;font-weight:bold;text-transform:uppercase;letter-spacing:2px;margin-bottom:40px}
    .position{margin-bottom:36px;page-break-inside:avoid}.position-title{font-size:18px;font-weight:900;text-transform:uppercase;border-left:6px solid #dc2626;padding-left:14px;margin-bottom:16px}
    .candidate{display:flex;align-items:center;gap:16px;margin-bottom:10px}.cand-name{font-weight:700;font-size:14px;width:200px}
    .bar-wrap{flex:1;background:#f1f5f9;border-radius:8px;height:24px;overflow:hidden}.bar{height:100%;border-radius:8px}
    .count{font-weight:900;font-size:16px;width:60px;text-align:right}.pct{font-size:12px;color:#94a3b8;width:50px;text-align:right}
    .footer{margin-top:60px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:16px}</style></head><body>
    <h1>BWIAA 2026 Election Results</h1>
    <div class="subtitle">${filterChapter === "ALL" ? "National Aggregate" : filterChapter} &nbsp;•&nbsp; Generated: ${new Date().toLocaleString()} &nbsp;•&nbsp; Total Ballots: ${filteredVotes.length}</div>
    ${Object.entries(positions).map(([pos, results]) => {
      const total = results.reduce((s,r) => s+r.count, 0);
      return `<div class="position"><div class="position-title">${pos}</div>${results.map((r,i) => {
        const pct = total > 0 ? Math.round((r.count/total)*100) : 0;
        return `<div class="candidate"><div class="cand-name">${r.candidate}</div><div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${i===0?'#dc2626':'#94a3b8'}"></div></div><div class="count">${r.count}</div><div class="pct">${pct}%</div></div>`;
      }).join('')}<div style="font-size:11px;color:#94a3b8;margin-top:4px">${total} ballots</div></div>`;
    }).join('')}
    <div class="footer">BWIAA 2026 National Alumni Election — Official Results — Confidential</div></body></html>`;
    const win = window.open('','_blank'); if (win) { win.document.write(content); win.document.close(); win.print(); }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Election Results</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Live · {filteredVotes.length} ballots</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isHeadAdmin && (
            <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)} className="border-2 border-slate-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white">
              <option value="ALL">🌍 National Aggregate</option>
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Download size={14}/> CSV</button>
          <button onClick={printResults} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Printer size={14}/> Print</button>
        </div>
      </div>
      {Object.entries(positions).map(([pos, results]) => {
        const total = results.reduce((s, r) => s + r.count, 0);
        return (
          <div key={pos} className="bg-white rounded-[3rem] p-10 shadow-xl border-b-8 border-slate-100">
            <div className="flex justify-between items-center mb-8 gap-3 flex-wrap">
              <h3 className="text-2xl font-black uppercase italic border-l-8 border-red-600 pl-5">{pos}</h3>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{total} ballots</span>
            </div>
            <div className="space-y-5">
              {results.map((r, i) => {
                const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                const isLeader = i === 0 && r.count > 0;
                return (
                  <div key={r.candidate}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-sm uppercase text-slate-800">{r.candidate}</span>
                        {isLeader && <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-yellow-300"><Trophy size={10}/> Leading</span>}
                      </div>
                      <span className="font-black text-slate-700">{r.count} <span className="text-slate-400 font-bold text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${isLeader ? 'bg-red-600' : 'bg-slate-300'}`} style={{ width: `${pct}%` }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {Object.keys(positions).length === 0 && (
        <div className="text-center py-20 text-slate-400"><BarChart2 className="mx-auto mb-4 opacity-30" size={48}/><p className="font-bold uppercase tracking-widest text-sm">No results yet.</p></div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────
function CandidatesTab({ candidates, setCandidates, showToast, isHeadAdmin }: {
  candidates: Candidate[]; setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  showToast: (m: string, ok?: boolean) => void; isHeadAdmin: boolean;
}) {
  const [name, setName]           = useState('');
  const [position, setPosition]   = useState(POSITIONS[0]);
  const [chapter, setChapter]     = useState(CHAPTERS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState(0);
  const [saving, setSaving]       = useState(false);
  const [filterChapter, setFilterChapter] = useState(CHAPTERS[0]);
  const MAX_KB = 200;

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 400; let { width, height } = img;
        if (width > height) { if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; } }
        else { if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; } }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed')), 'image/jpeg', 0.82);
      }; img.onerror = reject; img.src = url;
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const compressed = await compressImage(file); const kb = Math.round(compressed.size / 1024);
      setPhotoSize(kb);
      if (kb > MAX_KB) { showToast(`Image too large (${kb}KB). Use a smaller photo.`, false); return; }
      const asFile = new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      setPhotoFile(asFile); setPhotoPreview(URL.createObjectURL(compressed));
    } catch { showToast('Failed to process image.', false); }
  }

  async function addCandidate() {
    if (!name.trim()) { showToast("Candidate name required.", false); return; }
    setSaving(true);
    let photo_url: string | undefined;
    if (photoFile) {
      const fileName = `${Date.now()}_${name.trim().replace(/\s+/g,'_')}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('candidate-photos').upload(fileName, photoFile, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) { showToast(`Photo upload failed: ${uploadError.message}`, false); setSaving(false); return; }
      photo_url = supabase.storage.from('candidate-photos').getPublicUrl(uploadData.path).data.publicUrl;
    }
    const payload: any = { full_name: name.trim(), position_name: position, chapter };
    if (photo_url) payload.photo_url = photo_url;
    const { data, error } = await supabase.from('candidates').insert([payload]).select().single();
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setCandidates(prev => [...prev, data]); setName(''); setPhotoFile(null); setPhotoPreview(null); setPhotoSize(0);
    showToast(`${data.full_name} added to ${data.position_name}`);
  }

  async function removeCandidate(id: number) {
    if (!confirm("Remove this candidate? Their existing votes remain.")) return;
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) { showToast("Failed to remove.", false); return; }
    setCandidates(prev => prev.filter(c => c.id !== id)); showToast("Candidate removed.");
  }

  const byChapter = useMemo(() => {
    const map: Record<string, Record<string, Candidate[]>> = {};
    candidates.forEach(c => {
      if (!map[c.chapter]) map[c.chapter] = {};
      if (!map[c.chapter][c.position_name]) map[c.chapter][c.position_name] = [];
      map[c.chapter][c.position_name].push(c);
    }); return map;
  }, [candidates]);
  const filteredByPosition = byChapter[filterChapter] ?? {};
  const positionsCovered = Object.keys(filteredByPosition).length;

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Manage Candidates</h2>
      {isHeadAdmin && (
        <Card accent="red">
          <SectionTitle>Add New Candidate</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            <select value={position} onChange={e => setPosition(e.target.value)} className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none">
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={chapter} onChange={e => setChapter(e.target.value)} className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none">
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Photo (optional · max {MAX_KB}KB · auto-compressed)</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 shrink-0 flex items-center justify-center">
                {photoPreview ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover"/> : <span className="text-xs text-slate-400 font-bold text-center px-1">No photo</span>}
              </div>
              <label className="flex-1 cursor-pointer flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-4 transition-all">
                <PlusCircle size={18} className="text-slate-400 shrink-0"/>
                <span className="text-sm font-bold text-slate-500">{photoFile ? photoFile.name : 'Click to choose photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect}/>
              </label>
            </div>
            {photoSize > 0 && <p className={`text-xs font-bold mt-2 ${photoSize > MAX_KB ? 'text-red-500' : 'text-green-600'}`}>{photoSize > MAX_KB ? `⚠ ${photoSize}KB — too large` : `✓ ${photoSize}KB — ready`}</p>}
          </div>
          <button onClick={addCandidate} disabled={saving || photoSize > MAX_KB} className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>} {saving ? 'Uploading...' : 'Add Candidate'}
          </button>
        </Card>
      )}

      {/* Chapter progress */}
      <Card>
        <SectionTitle>Chapter Setup Progress</SectionTitle>
        <div className="space-y-3">
          {CHAPTERS.map(ch => {
            const chPos = Object.keys(byChapter[ch] ?? {}).length;
            const complete = chPos === POSITIONS.length;
            return (
              <div key={ch} className="flex items-center gap-3 cursor-pointer" onClick={() => setFilterChapter(ch)}>
                <div className="w-36 text-xs font-bold uppercase text-slate-500 text-right shrink-0">{ch}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${complete ? 'bg-green-500' : chPos > 0 ? 'bg-red-500' : 'bg-slate-200'}`} style={{ width: `${Math.round((chPos / POSITIONS.length) * 100)}%` }}/>
                </div>
                <div className="w-14 text-right font-black text-xs text-slate-700">{chPos}/{POSITIONS.length}</div>
                {complete && <CheckCircle2 size={14} className="text-green-500 shrink-0"/>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)} className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-3 font-bold outline-none text-sm bg-white">
          {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs font-bold text-slate-400 uppercase">{positionsCovered}/{POSITIONS.length} positions filled</span>
      </div>

      {Object.entries(filteredByPosition).map(([pos, cands]) => (
        <Card key={pos}>
          <SectionTitle>{pos}</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cands.map(c => (
              <div key={c.id} className="relative group flex flex-col items-center bg-slate-50 rounded-3xl p-4 border-2 border-slate-100 hover:border-red-200 transition-all">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 mb-3 border-2 border-slate-200">
                  {c.photo_url ? <img src={c.photo_url} alt={c.full_name} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center"><span className="text-2xl font-black text-slate-400">{c.full_name.charAt(0)}</span></div>}
                </div>
                <p className="font-black text-slate-800 text-xs text-center uppercase leading-tight">{c.full_name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 text-center">{c.chapter}</p>
                {isHeadAdmin && (
                  <button onClick={() => removeCandidate(c.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-50 text-red-400 hover:text-red-600 p-1.5 rounded-xl transition-all"><Trash2 size={12}/></button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {positionsCovered === 0 && (
        <div className="text-center py-20 text-slate-400"><List className="mx-auto mb-4 opacity-30" size={48}/><p className="font-bold uppercase tracking-widest text-sm">No candidates for {filterChapter}.</p></div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: APPLICATIONS — Full candidate application review with payment screenshots
// ─────────────────────────────────────────────────────────────────────────────
function ApplicationsTab({ applications, setApplications, setCandidates, showToast, isHeadAdmin, myChapter, adminEmail }: {
  applications: Application[]; setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string;
}) {
  const [filter, setFilter]             = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const [selected, setSelected]         = useState<Application | null>(null);
  const [rejReason, setRejReason]       = useState('');
  const [processing, setProcessing]     = useState(false);
  const [viewScreenshot, setViewScreenshot] = useState<string | null>(null);
  const [search, setSearch]             = useState('');

  const visible = applications.filter(a => {
    const chapterMatch = isHeadAdmin || a.chapter === myChapter;
    const statusMatch  = filter === 'all' || a.status === filter;
    const searchMatch  = !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || a.applicant_email.toLowerCase().includes(search.toLowerCase()) || a.chapter.toLowerCase().includes(search.toLowerCase());
    return chapterMatch && statusMatch && searchMatch;
  });

  const pending  = applications.filter(a => a.status === 'pending'  && (isHeadAdmin || a.chapter === myChapter)).length;
  const approved = applications.filter(a => a.status === 'approved' && (isHeadAdmin || a.chapter === myChapter)).length;
  const rejected = applications.filter(a => a.status === 'rejected' && (isHeadAdmin || a.chapter === myChapter)).length;

  async function approve(app: Application) {
    setProcessing(true);
    const { data: cand, error: candErr } = await supabase.from('candidates').insert([{
      full_name: app.full_name, position_name: app.position_name,
      chapter: app.chapter, photo_url: app.photo_url || null,
    }]).select().single();
    if (candErr) { showToast(`Failed to add candidate: ${candErr.message}`, false); setProcessing(false); return; }
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from('candidate_applications').update({
      status: 'approved', reviewed_at: reviewedAt, reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    // Log activity
    await supabase.from('activity_log').insert([{
      member_name: adminEmail, chapter: app.chapter,
      action: `Application approved — ${app.full_name}`,
      details: `Running for ${app.position_name} · Payment: ${app.payment_method === 'in_person' ? 'In Person' : 'Screenshot'}`,
    }]);
    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved', reviewed_at: reviewedAt } : a));
    setCandidates(prev => [...prev, cand]);
    setSelected(null);
    showToast(`✓ ${app.full_name} approved and added as ${app.position_name} candidate for ${app.chapter}.`);
    try { await supabase.functions.invoke('notify-applicant', { body: { type: 'approved', application: { ...app, status: 'approved' } } }); } catch {}
  }

  async function reject(app: Application) {
    if (!rejReason.trim()) { showToast('Please provide a rejection reason.', false); return; }
    setProcessing(true);
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from('candidate_applications').update({
      status: 'rejected', rejection_reason: rejReason.trim(), reviewed_at: reviewedAt, reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    await supabase.from('activity_log').insert([{
      member_name: adminEmail, chapter: app.chapter,
      action: `Application rejected — ${app.full_name}`,
      details: `Reason: ${rejReason.trim()}`,
    }]);
    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'rejected', rejection_reason: rejReason, reviewed_at: reviewedAt } : a));
    setSelected(null); setRejReason('');
    showToast(`${app.full_name}'s application rejected.`);
    try { await supabase.functions.invoke('notify-applicant', { body: { type: 'rejected', application: { ...app, status: 'rejected', rejection_reason: rejReason.trim() } } }); } catch {}
  }

  function exportCSV() {
    const headers = ['App ID','Full Name','Email','DOB','Class','Year Graduated','Sponsor','Principal','ID Number','Chapter','Position','Payment Method','Status','Rejection Reason','Applied At','Reviewed At','Reviewed By'];
    const rows = visible.map(a => [a.id.slice(0,8).toUpperCase(),a.full_name,a.applicant_email,a.dob,a.class_name,String(a.year_graduated),a.sponsor_name,a.principal_name,a.id_number,a.chapter,a.position_name,a.payment_method,a.status,a.rejection_reason??'',new Date(a.created_at).toLocaleString(),a.reviewed_at?new Date(a.reviewed_at).toLocaleString():'',a.reviewed_by??'']);
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:`BWIAA_Applications_${filter}_${new Date().toISOString().slice(0,10)}.csv`}); a.click();
  }

  const statusBadge = (s: string) => ({ pending:'bg-yellow-100 text-yellow-700 border-yellow-200', approved:'bg-green-100 text-green-700 border-green-200', rejected:'bg-red-100 text-red-700 border-red-200' }[s] ?? 'bg-slate-100 text-slate-700');
  const screenshots = selected ? [selected.payment_screenshot_1, selected.payment_screenshot_2, selected.payment_screenshot_3].filter(Boolean) as string[] : [];

  return (
    <div className="space-y-8">
      {/* Screenshot lightbox */}
      {viewScreenshot && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViewScreenshot(null)}>
          <img src={viewScreenshot} alt="Payment screenshot" className="max-w-full max-h-full rounded-2xl shadow-2xl"/>
          <button className="absolute top-4 right-4 bg-white/10 text-white p-2 rounded-full" onClick={() => setViewScreenshot(null)}><XCircle size={24}/></button>
        </div>
      )}

      {/* Application detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-2xl w-full my-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
                {selected.photo_url
                  ? <img src={selected.photo_url} className="w-full h-full object-cover" alt={selected.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center bg-slate-200"><span className="text-3xl font-black text-slate-400">{selected.full_name.charAt(0)}</span></div>}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black uppercase text-slate-900">{selected.full_name}</h3>
                <p className="text-sm text-red-600 font-black uppercase mt-1">{selected.position_name}</p>
                <p className="text-xs text-slate-500 font-bold">{selected.chapter}</p>
                <p className="text-xs text-slate-400 font-bold mt-1">{selected.applicant_email}</p>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>{selected.status}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1 shrink-0"><XCircle size={20}/></button>
            </div>

            {/* Personal details */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              <p className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Application Details</p>
              {[
                ['App ID',          selected.id.slice(0,8).toUpperCase()],
                ['Date of Birth',   selected.dob],
                ['ID Number',       selected.id_number],
                ['Class Name',      selected.class_name],
                ['Year Graduated',  String(selected.year_graduated)],
                ['Class Sponsor',   selected.sponsor_name],
                ['Principal',       selected.principal_name],
                ['Applied',         new Date(selected.created_at).toLocaleString()],
              ].map(([l,v]) => (
                <div key={l} className="flex flex-col py-1 border-b border-slate-100">
                  <span className="font-black text-slate-400 uppercase tracking-widest text-[10px]">{l}</span>
                  <span className={`font-black mt-0.5 ${l === 'App ID' ? 'text-red-600 font-mono' : 'text-slate-800'}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Payment section */}
            <div className="bg-slate-50 rounded-2xl p-5 mb-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payment Information</p>
              <div className="flex items-center gap-3 mb-4">
                <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase border-2 ${selected.payment_method === 'in_person' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                  {selected.payment_method === 'in_person' ? '🤝 In-Person Payment' : '📸 Screenshot Upload'}
                </div>
              </div>
              {selected.payment_method === 'screenshot' && (
                <>
                  {screenshots.length > 0 ? (
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-3">{screenshots.length} payment screenshot{screenshots.length !== 1 ? 's' : ''} uploaded:</p>
                      <div className="grid grid-cols-3 gap-3">
                        {screenshots.map((url, i) => (
                          <div key={i} className="relative group cursor-pointer" onClick={() => setViewScreenshot(url)}>
                            <img src={url} className="w-full h-28 object-cover rounded-2xl border-2 border-slate-200 group-hover:border-red-400 transition-all" alt={`Payment ${i+1}`}/>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-2xl transition-all flex items-center justify-center">
                              <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all"/>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold text-center mt-1">Screenshot {i+1} · Click to enlarge</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-orange-600 font-bold">⚠ No screenshots uploaded — applicant selected screenshot method but didn't upload.</p>
                  )}
                </>
              )}
              {selected.payment_method === 'in_person' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs text-blue-700 font-bold leading-relaxed">
                    This applicant has chosen to pay in person. Contact them directly to confirm payment receipt before approving their application.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            {selected.status === 'pending' && (
              <div className="space-y-3">
                <button onClick={() => approve(selected)} disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {processing ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                  Approve & Add as Candidate
                </button>
                <div className="flex gap-2">
                  <input value={rejReason} onChange={e => setRejReason(e.target.value)} placeholder="Rejection reason (required before rejecting)..."
                    className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm"/>
                  <button onClick={() => reject(selected)} disabled={processing || !rejReason.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-5 py-3 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 shrink-0">
                    <XCircle size={14}/> Reject
                  </button>
                </div>
              </div>
            )}
            {selected.status !== 'pending' && (
              <div className={`rounded-2xl p-4 text-sm font-bold ${selected.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {selected.status === 'approved' ? `✓ Approved by ${selected.reviewed_by ?? 'admin'} · Added as candidate` : `✗ Rejected: ${selected.rejection_reason}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Candidate Applications</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review, approve or reject candidacy registrations with payment verification</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
          <Download size={14}/> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{pending}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p></div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{approved}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p></div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{rejected}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p></div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or chapter..."
            className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending','approved','rejected','all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Application list */}
      <Card>
        <SectionTitle>Applications ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(app => {
            const screenshotCount = [app.payment_screenshot_1, app.payment_screenshot_2, app.payment_screenshot_3].filter(Boolean).length;
            return (
              <div key={app.id} onClick={() => { setSelected(app); setRejReason(''); }}
                className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                  {app.photo_url ? <img src={app.photo_url} className="w-full h-full object-cover" alt={app.full_name}/> : <div className="w-full h-full flex items-center justify-center"><span className="font-black text-slate-400 text-lg">{app.full_name.charAt(0)}</span></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 truncate">{app.full_name}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase truncate">{app.position_name} — {app.chapter}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">{new Date(app.created_at).toLocaleDateString()} · <span className="font-mono text-red-500">{app.id.slice(0,8).toUpperCase()}</span></p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <span className={`block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${statusBadge(app.status)}`}>{app.status}</span>
                  <span className="block text-[10px] text-slate-400 font-bold">
                    {app.payment_method === 'in_person' ? '🤝 In Person' : `📸 ${screenshotCount} screenshot${screenshotCount !== 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-8">No {filter === 'all' ? '' : filter+' '}applications.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: VOTERS
// ─────────────────────────────────────────────────────────────────────────────
function VotersTab({ votes, isHeadAdmin, myChapter }: { votes: VoteRow[]; isHeadAdmin: boolean; myChapter: string | null }) {
  const [filterChapter, setFilterChapter] = useState(isHeadAdmin ? "ALL" : (myChapter ?? "ALL"));
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    let list = filterChapter === "ALL" ? votes : votes.filter(v => v.chapter === filterChapter);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(v => v.voter_name.toLowerCase().includes(q) || v.candidate_name.toLowerCase().includes(q) || v.position_name.toLowerCase().includes(q)); }
    return list;
  }, [votes, filterChapter, search]);

  function exportCSV() {
    const rows = [["Chapter","Voter Email","Class Year","Position","Voted For","Timestamp"]];
    filtered.forEach(v => rows.push([v.chapter, v.voter_name, v.class_year, v.position_name, v.candidate_name, new Date(v.created_at).toLocaleString()]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:`BWIAA_VoteLog_${filterChapter}_${new Date().toISOString().slice(0,10)}.csv`}); a.click();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Vote Log</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{filtered.length} ballots · {new Set(filtered.map(v => v.voter_id)).size} unique voters</p></div>
        <div className="flex gap-3 flex-wrap">
          {isHeadAdmin && <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)} className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white"><option value="ALL">All Chapters</option>{CHAPTERS.map(c=><option key={c} value={c}>{c}</option>)}</select>}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600"/>
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Download size={14}/> CSV</button>
        </div>
      </div>
      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white"><tr>{["Chapter","Voter Email","Class","Position","Voted For","Time"].map(h=><th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>)}</tr></thead>
            <tbody>{filtered.map((v,i)=><tr key={v.id??i} className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50'}`}><td className="px-6 py-4 font-bold text-xs uppercase text-slate-500">{v.chapter}</td><td className="px-6 py-4 font-bold text-slate-800">{v.voter_name}</td><td className="px-6 py-4 font-black text-red-600">{v.class_year}</td><td className="px-6 py-4 font-bold text-xs uppercase text-slate-600">{v.position_name}</td><td className="px-6 py-4 font-black text-slate-900">{v.candidate_name}</td><td className="px-6 py-4 text-xs text-slate-400 font-bold">{new Date(v.created_at).toLocaleString()}</td></tr>)}
            {filtered.length===0&&<tr><td colSpan={6} className="text-center py-16 text-slate-400 font-bold uppercase text-sm">No votes found.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ROSTER + BLACKLIST
// ─────────────────────────────────────────────────────────────────────────────
function RosterTab({ roster, setRoster, blacklist, setBlacklist, showToast, isHeadAdmin, myChapter, members }: {
  roster: EligibleVoter[]; setRoster: React.Dispatch<React.SetStateAction<EligibleVoter[]>>;
  blacklist: BlacklistedVoter[]; setBlacklist: React.Dispatch<React.SetStateAction<BlacklistedVoter[]>>;
  showToast: (m: string, ok?: boolean) => void; isHeadAdmin: boolean; myChapter: string | null; members: Member[];
}) {
  const [rEmail, setREmail] = useState('');
  const [rSaving, setRSaving] = useState(false);
  const [bEmail, setBEmail] = useState('');
  const [bReason, setBReason] = useState('');
  const [bSaving, setBSaving] = useState(false);
  const visibleRoster = isHeadAdmin ? roster : roster.filter(r => r.chapter === myChapter);
  const approvedMembers = members.filter(m => m.status === 'approved' && (isHeadAdmin || m.chapter === myChapter));
  const rosterEmails = new Set(roster.map(r => r.email.toLowerCase()));
  const eligible = approvedMembers.filter(m => !rosterEmails.has(m.email.toLowerCase()));

  async function addToRoster(email: string, chapter: string, name: string) {
    setRSaving(true);
    const { data, error } = await supabase.from('eligible_voters').insert([{ email: email.toLowerCase(), chapter }]).select().single();
    setRSaving(false);
    if (error) { const isDupe = error.code==='23505'||error.message.toLowerCase().includes('unique'); showToast(isDupe?`${email} already on roster.`:`Failed: ${error.message}`, false); return; }
    setRoster(prev => [...prev, data]); setREmail('');
    showToast(`✓ ${name} added to voter roster for ${chapter}.`);
  }

  async function addManual() {
    const email = rEmail.trim().toLowerCase(); if (!email) { showToast('Email required.', false); return; }
    const approvedMember = members.find(m => m.email.toLowerCase() === email && m.status === 'approved');
    if (!approvedMember) { showToast(`❌ ${email} is not an approved BWIAA member.`, false); return; }
    await addToRoster(email, approvedMember.chapter, approvedMember.full_name);
  }

  async function removeFromRoster(email: string) {
    if (!confirm(`Remove ${email} from roster?`)) return;
    const { error } = await supabase.from('eligible_voters').delete().eq('email', email);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setRoster(prev => prev.filter(r => r.email !== email)); showToast(`${email} removed from roster.`);
  }

  async function addToBlacklist() {
    const email = bEmail.trim().toLowerCase();
    if (!email || !bReason.trim()) { showToast("Email and reason required.", false); return; }
    setBSaving(true);
    const { data, error } = await supabase.from('blacklisted_voters').insert([{ email, reason: bReason.trim() }]).select().single();
    setBSaving(false);
    if (error) { showToast(error.code==='23505'?"Already blacklisted.":`Failed: ${error.message}`, false); return; }
    setBlacklist(prev => [data, ...prev]); setBEmail(''); setBReason(''); showToast(`${email} blocked.`);
  }

  async function removeFromBlacklist(id: number, email: string) {
    if (!confirm(`Unblock ${email}?`)) return;
    const { error } = await supabase.from('blacklisted_voters').delete().eq('id', id);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setBlacklist(prev => prev.filter(b => b.id !== id)); showToast(`${email} unblocked.`);
  }

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Roster & Blacklist</h2>
      <Card accent="green">
        <SectionTitle>Add Voter to Roster</SectionTitle>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <span className="text-amber-500 text-lg shrink-0">🔒</span>
          <p className="text-amber-700 text-xs font-bold leading-relaxed"><strong className="text-amber-800 font-black uppercase">Members Only.</strong> Only approved BWIAA members can be added to the voter roster.</p>
        </div>
        {eligible.length > 0 ? (
          <div className="mb-5">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Approved members not yet on roster ({eligible.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {eligible.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-200 shrink-0">{m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>:<div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-xs">{m.full_name.charAt(0)}</span></div>}</div>
                    <div><p className="font-black text-slate-800 text-sm">{m.full_name}</p><p className="text-xs text-slate-400 font-bold">{m.email} · {m.chapter}</p></div>
                  </div>
                  <button onClick={() => addToRoster(m.email, m.chapter, m.full_name)} disabled={rSaving} className="bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50 shrink-0">+ Add</button>
                </div>
              ))}
            </div>
          </div>
        ) : <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5"><p className="text-green-700 font-black text-sm">✓ All approved members are on the voter roster.</p></div>}
        <div className="border-t border-slate-100 pt-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Or add by email (verified members only)</p>
          <div className="flex gap-3">
            <input value={rEmail} onChange={e=>setREmail(e.target.value)} placeholder="member@email.com" className="flex-1 border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none text-sm"/>
            <button onClick={addManual} disabled={rSaving||!rEmail.trim()} className="bg-green-600 text-white font-black uppercase px-6 py-4 rounded-2xl flex items-center gap-2 hover:bg-green-700 transition-all disabled:opacity-50 shrink-0">{rSaving?<Loader2 size={14} className="animate-spin"/>:<UserCheck size={14}/>} Verify & Add</button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Eligible Voters ({visibleRoster.length})</SectionTitle>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {visibleRoster.map(r => (
            <div key={r.email} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <div><p className="font-bold text-slate-800 text-sm">{r.email}</p><p className="text-xs text-slate-400 font-bold uppercase">{r.chapter}</p></div>
              <button onClick={() => removeFromRoster(r.email)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"><Trash2 size={14}/></button>
            </div>
          ))}
          {visibleRoster.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-6">No voters on roster.</p>}
        </div>
      </Card>

      {isHeadAdmin && (
        <>
          <Card accent="red">
            <SectionTitle>Blacklist a Voter</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <input value={bEmail} onChange={e=>setBEmail(e.target.value)} placeholder="blocked@gmail.com" className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              <input value={bReason} onChange={e=>setBReason(e.target.value)} placeholder="Reason (e.g. Duplicate account)" className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
            <button onClick={addToBlacklist} disabled={bSaving} className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50">{bSaving?<Loader2 size={16} className="animate-spin"/>:<UserX size={16}/>} Block Voter</button>
          </Card>
          <Card>
            <SectionTitle>Blacklisted ({blacklist.length})</SectionTitle>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {blacklist.map(b => (
                <div key={b.id} className="flex justify-between items-start p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <div><p className="font-black text-red-700 text-sm">{b.email}</p><p className="text-xs text-red-400 font-bold mt-1">Reason: {b.reason}</p></div>
                  <button onClick={() => removeFromBlacklist(b.id, b.email)} className="text-slate-400 hover:text-green-600 hover:bg-green-50 p-2 rounded-xl transition-all ml-4 shrink-0"><CheckCircle2 size={14}/></button>
                </div>
              ))}
              {blacklist.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-6">No blocked voters.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ADMINS
// ─────────────────────────────────────────────────────────────────────────────
function AdminsTab({ admins, setAdmins, showToast, deadline, setDeadline }: {
  admins: ElectionAdmin[]; setAdmins: React.Dispatch<React.SetStateAction<ElectionAdmin[]>>;
  showToast: (m: string, ok?: boolean) => void; deadline: string | null; setDeadline: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [email, setEmail]   = useState('');
  const [branch, setBranch] = useState(CHAPTERS[0]);
  const [saving, setSaving] = useState(false);
  const [dlInput, setDlInput]   = useState('');
  const [dlSaving, setDlSaving] = useState(false);
  const [timeLeft, setTimeLeft]         = useState('');
  const [votingClosed, setVotingClosed] = useState(false);

  useEffect(() => {
    if (!deadline) { setTimeLeft(''); return; }
    const tick = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('VOTING CLOSED'); setVotingClosed(true); return; }
      const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      setTimeLeft(`${d>0?d+'d ':''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`); setVotingClosed(false);
    }; tick(); const id=setInterval(tick,1000); return ()=>clearInterval(id);
  }, [deadline]);

  async function saveDeadline() {
    if (!dlInput) { showToast("Select a date and time.", false); return; }
    setDlSaving(true);
    const { error } = await supabase.from('election_settings').upsert([{ key:'voting_deadline', value:new Date(dlInput).toISOString() }],{onConflict:'key'});
    setDlSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setDeadline(new Date(dlInput).toISOString()); showToast('Voting deadline set.');
  }

  async function clearDeadline() {
    if (!confirm('Remove the voting deadline?')) return;
    const { error } = await supabase.from('election_settings').delete().eq('key','voting_deadline');
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setDeadline(null); setDlInput(''); showToast('Deadline removed.');
  }

  async function addAdmin() {
    const lowerEmail = email.trim().toLowerCase();
    if (!lowerEmail) { showToast("Email required.", false); return; }
    setSaving(true);
    const { data, error } = await supabase.from('election_admins').insert([{ email: lowerEmail, branch }]).select().single();
    setSaving(false);
    if (error) { showToast(error.message.includes('unique')?"Already an admin.":`Failed: ${error.message}`, false); return; }
    setAdmins(prev => [...prev, data]); setEmail(''); showToast(`${lowerEmail} is now ${branch} admin.`);
  }

  async function removeAdmin(id: number, adminEmail: string) {
    if (!confirm(`Remove ${adminEmail}?`)) return;
    const { error } = await supabase.from('election_admins').delete().eq('id', id);
    if (error) { showToast("Failed.", false); return; }
    setAdmins(prev => prev.filter(a => a.id !== id)); showToast(`${adminEmail} removed.`);
  }

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Admins & Deadline</h2>
      <Card accent="red">
        <SectionTitle>Voting Deadline & Countdown</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">Set the deadline before opening voting in Settings. Once it passes, the ballot locks automatically.</p>
        {deadline ? (
          <div className={`rounded-3xl p-8 mb-6 text-center ${votingClosed?'bg-slate-800':'bg-slate-900'}`}>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{votingClosed?'Voting Has Ended':'Time Remaining'}</p>
            <p className="text-5xl font-black text-red-500 tabular-nums tracking-tight">{timeLeft}</p>
            <p className="text-xs font-bold text-slate-500 uppercase mt-3">Deadline: {new Date(deadline).toLocaleString()}</p>
          </div>
        ) : (
          <div className="rounded-3xl p-6 mb-6 bg-slate-50 border-2 border-dashed border-slate-200 text-center">
            <p className="text-slate-400 font-black uppercase text-sm tracking-widest">No deadline set — set one before opening voting</p>
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Set Voting Deadline (Date & Time)</label>
            <input type="datetime-local" value={dlInput} onChange={e=>setDlInput(e.target.value)} min={new Date().toISOString().slice(0,16)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
          </div>
          <div className="flex gap-3">
            <button onClick={saveDeadline} disabled={dlSaving} className="bg-red-600 text-white font-black uppercase px-6 py-4 rounded-2xl flex items-center gap-2 hover:bg-red-700 transition-all disabled:opacity-50 whitespace-nowrap">{dlSaving?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>}{deadline?'Update':'Set'} Deadline</button>
            {deadline && <button onClick={clearDeadline} className="bg-slate-100 text-slate-600 font-black uppercase px-6 py-4 rounded-2xl hover:bg-slate-200 transition-all whitespace-nowrap">Remove</button>}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Add Branch Chairperson</SectionTitle>
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-2xl mb-6">
          <Crown size={20} className="text-yellow-600 shrink-0"/>
          <div><p className="font-black text-yellow-800 text-sm">Head Admin</p><p className="text-xs text-yellow-600 font-bold">{HEAD_ADMIN_EMAIL} — Full access</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="chairperson@gmail.com" className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none md:col-span-2"/>
          <select value={branch} onChange={e=>setBranch(e.target.value)} className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none">{CHAPTERS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        </div>
        <button onClick={addAdmin} disabled={saving} className="bg-slate-900 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-slate-700 transition-all disabled:opacity-50">{saving?<Loader2 size={16} className="animate-spin"/>:<PlusCircle size={16}/>} Add Chapter Admin</button>
      </Card>

      <Card>
        <SectionTitle>Current Branch Admins ({admins.length})</SectionTitle>
        {admins.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-8">No branch admins yet.</p>}
        <div className="space-y-3">
          {admins.map(a => (
            <div key={a.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl">
              <div><p className="font-black text-slate-800">{a.email}</p><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{a.branch} Chapter Admin</p></div>
              <button onClick={() => removeAdmin(a.id, a.email)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: SETTINGS — with integrated Phase Controls
// ─────────────────────────────────────────────────────────────────────────────
function SettingsTab({ config, setConfig, showToast, deadline, phases, setPhases }: {
  config: ElectionConfig; setConfig: React.Dispatch<React.SetStateAction<ElectionConfig>>;
  showToast: (m: string, ok?: boolean) => void; deadline: string | null;
  phases: ElectionPhases; setPhases: React.Dispatch<React.SetStateAction<ElectionPhases>>;
}) {
  const [local, setLocal]           = useState<ElectionConfig>(JSON.parse(JSON.stringify(config)));
  const [saving, setSaving]         = useState(false);
  const [newChapter, setNewChapter] = useState('');
  const [headAdmins, setHeadAdmins] = useState<string[]>([HEAD_ADMIN_EMAIL]);
  const [newHA, setNewHA]           = useState('');
  const [haSaving, setHaSaving]     = useState(false);
  const [phaseSaving, setPhaseSaving] = useState(false);

  useEffect(() => {
    supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle()
      .then(({ data }) => { if (data?.value) { try { setHeadAdmins(JSON.parse(data.value)); } catch {} } else { setHeadAdmins([HEAD_ADMIN_EMAIL]); } });
  }, []);

  // ── Phase toggle ────────────────────────────────────────────────────────────
  async function togglePhase(key: keyof ElectionPhases, value: boolean) {
    if (key === 'voting_open' && value && !phases.registration_open) {
      showToast('⚠ Open candidate registration first before enabling voting.', false); return;
    }
    if (key === 'results_announced' && value && !phases.voting_open) {
      showToast('⚠ Voting must be open before announcing results.', false); return;
    }
    if (key === 'voting_open' && value && !deadline) {
      showToast('⚠ Set a voting deadline in the Admins tab first.', false); return;
    }
    setPhaseSaving(true);
    const updates: { key: string; value: string }[] = [{ key, value: String(value) }];
    if (key === 'voting_open' && !value) updates.push({ key: 'results_announced', value: 'false' });
    const { error } = await supabase.from('election_settings').upsert(updates, { onConflict: 'key' });
    setPhaseSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setPhases(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'voting_open' && !value) next.results_announced = false;
      return next;
    });
    showToast(`✓ ${key.replace(/_/g,' ')} ${value ? 'enabled' : 'disabled'}.`);
  }

  // ── Settings save ───────────────────────────────────────────────────────────
  async function saveSettings() {
    setSaving(true);
    const rows = [
      { key:'org_name',             value:local.org_name },
      { key:'election_title',       value:local.election_title },
      { key:'election_year',        value:local.election_year },
      { key:'currency',             value:local.currency },
      { key:'currency_symbol',      value:local.currency_symbol },
      { key:'maintenance_fee',      value:String(local.maintenance_fee) },
      { key:'maintenance_currency', value:local.maintenance_currency },
      { key:'chapters',             value:JSON.stringify(local.chapters) },
      { key:'positions_fees',       value:JSON.stringify(local.positions_fees) },
    ];
    const { error } = await supabase.from('election_settings').upsert(rows, { onConflict:'key' });
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    CHAPTERS  = local.chapters;
    POSITIONS = local.positions_fees.map(p => p.position);
    setConfig(local);
    showToast('Settings saved! Changes are live across the platform.');
  }

  async function addHeadAdmin() {
    const email = newHA.trim().toLowerCase();
    if (!email || !email.includes('@')) { showToast('Valid email required.', false); return; }
    if (headAdmins.includes(email)) { showToast('Already a head admin.', false); return; }
    setHaSaving(true);
    const updated = [...headAdmins, email];
    const { error } = await supabase.from('election_settings').upsert([{ key:'head_admins', value:JSON.stringify(updated) }],{onConflict:'key'});
    setHaSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setHeadAdmins(updated); setNewHA(''); showToast(`${email} is now a Head Admin.`);
  }

  async function removeHeadAdmin(email: string) {
    if (email === HEAD_ADMIN_EMAIL.toLowerCase()) { showToast('Cannot remove the primary head admin.', false); return; }
    if (!confirm(`Remove ${email} as Head Admin?`)) return;
    const updated = headAdmins.filter(e => e !== email);
    const { error } = await supabase.from('election_settings').upsert([{ key:'head_admins', value:JSON.stringify(updated) }],{onConflict:'key'});
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setHeadAdmins(updated); showToast(`${email} removed from Head Admins.`);
  }

  const phaseItems = [
    { key: 'registration_open' as keyof ElectionPhases, num: '1', label: 'Phase 1 — Candidate Registration', sub: 'Approved members can submit candidacy applications. "Apply Now" button appears on the election page.', warn: null as string | null },
    { key: 'voting_open'       as keyof ElectionPhases, num: '2', label: 'Phase 2 — Open Voting',            sub: 'The ballot goes live. Countdown begins. Requires a voting deadline set in the Admins tab.', warn: !deadline ? '⚠ No voting deadline set — go to Admins tab first.' : null },
    { key: 'results_announced' as keyof ElectionPhases, num: '3', label: 'Phase 3 — Announce Results',       sub: 'Election results become publicly visible on the ballot page. Announce on election day once voting closes.', warn: null },
  ];

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800 flex items-center gap-3"><Sliders size={28} className="text-red-600"/> Platform Settings</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Customise everything and control election phases.</p>
        </div>
        <button onClick={saveSettings} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 shrink-0">
          {saving?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>}{saving?'Saving...':'Save Settings'}
        </button>
      </div>

      {/* ── PHASE CONTROLS ── */}
      <Card accent="red">
        <SectionTitle>🗳 Election Phase Controls</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6 -mt-2">
          Enable phases in order. The public ballot page enforces this sequence — voters cannot vote until you open voting here.
        </p>

        {/* Sequence visual */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          {phaseItems.map((p, i) => {
            const isOn = phases[p.key];
            return (
              <div key={p.key} className="flex items-center gap-2 flex-1 min-w-0">
                <div className={`flex-1 min-w-[100px] rounded-2xl border-2 p-4 text-center transition-all ${isOn?'bg-green-50 border-green-300':'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-sm ${isOn?'bg-green-500 text-white':'bg-slate-200 text-slate-400'}`}>{isOn?'✓':p.num}</div>
                  <p className={`font-black text-xs uppercase tracking-widest leading-tight ${isOn?'text-green-700':'text-slate-500'}`}>{p.label.replace(/Phase \d — /,'')}</p>
                </div>
                {i < 2 && <ChevronRight size={16} className="text-slate-300 shrink-0"/>}
              </div>
            );
          })}
        </div>

        {/* Toggle switches */}
        <div className="space-y-4">
          {phaseItems.map(({ key, label, sub, warn }) => {
            const isOn = phases[key];
            return (
              <div key={key} className={`flex items-center gap-5 p-5 rounded-2xl border-2 transition-all ${isOn?'bg-green-50 border-green-200':'bg-slate-50 border-slate-100'}`}>
                <div className="flex-1">
                  <p className={`font-black uppercase text-sm tracking-wide ${isOn?'text-green-800':'text-slate-700'}`}>{label}</p>
                  <p className="text-xs text-slate-400 font-bold mt-1 leading-relaxed">{sub}</p>
                  {warn && <p className="text-xs text-orange-600 font-bold mt-1.5">{warn}</p>}
                </div>
                <button onClick={() => togglePhase(key, !isOn)} disabled={phaseSaving}
                  className={`relative w-16 h-8 rounded-full transition-all shrink-0 border-2 disabled:opacity-50 ${isOn?'bg-green-500 border-green-500':'bg-slate-200 border-slate-300'}`}>
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200 ${isOn?'left-8':'left-1'}`}/>
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-5 bg-slate-900 rounded-2xl">
          <p className="text-xs text-white/50 font-bold leading-relaxed">
            <strong className="text-white">Integrity rules:</strong> Voting requires registration open + deadline set · Results require voting open · Turning off voting also turns off results · Nobody votes before the countdown starts · Results announced on election day.
          </p>
        </div>
      </Card>

      {/* ── Organisation Branding ── */}
      <Card>
        <SectionTitle>Organisation & Branding</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label:'Organisation Name', field:'org_name'       as keyof ElectionConfig, ph:'e.g. BWIAA'                  },
            { label:'Election Title',    field:'election_title'  as keyof ElectionConfig, ph:'e.g. National Alumni Election'},
            { label:'Election Year',     field:'election_year'   as keyof ElectionConfig, ph:'e.g. 2026'                   },
          ].map(({ label, field, ph }) => (
            <div key={String(field)}>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{label}</label>
              <input value={String(local[field])} onChange={e => setLocal(prev => ({ ...prev, [field]: e.target.value }))} placeholder={ph} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Currency Code</label>
              <input value={local.currency} onChange={e=>setLocal(prev=>({...prev,currency:e.target.value}))} placeholder="LRD" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Symbol</label>
              <input value={local.currency_symbol} onChange={e=>setLocal(prev=>({...prev,currency_symbol:e.target.value}))} placeholder="$" className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
          </div>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
            <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Maintenance Fee (per dues payment)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount</label><input type="number" value={local.maintenance_fee} onChange={e=>setLocal(prev=>({...prev,maintenance_fee:Number(e.target.value)}))} className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
              <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Currency</label><input value={local.maintenance_currency} onChange={e=>setLocal(prev=>({...prev,maintenance_currency:e.target.value}))} className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
            </div>
          </div>
        </div>
        <div className="mt-6 p-5 bg-slate-900 rounded-2xl text-white text-center">
          <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Live Preview</p>
          <p className="font-black uppercase italic text-lg">{local.org_name} <span className="text-red-500">{local.election_year}</span></p>
          <p className="text-white/50 text-xs font-bold mt-1">{local.election_title}</p>
        </div>
      </Card>

      {/* ── Chapters ── */}
      <Card>
        <SectionTitle>Chapters & Branches</SectionTitle>
        <div className="space-y-2 mb-4">
          {local.chapters.map((ch, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-black text-slate-400 w-6 text-right shrink-0">{i+1}.</span>
              <input value={ch} onChange={e => { const c=[...local.chapters]; c[i]=e.target.value; setLocal(prev=>({...prev,chapters:c})); }} className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <button onClick={() => setLocal(prev=>({...prev,chapters:prev.chapters.filter((_,idx)=>idx!==i)}))} className="text-red-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={newChapter} onChange={e=>setNewChapter(e.target.value)} placeholder="Add new chapter..." onKeyDown={e=>e.key==='Enter'&&newChapter.trim()&&(setLocal(prev=>({...prev,chapters:[...prev.chapters,newChapter.trim()]})),setNewChapter(''))} className="flex-1 border-2 border-dashed border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
          <button onClick={()=>{if(newChapter.trim()){setLocal(prev=>({...prev,chapters:[...prev.chapters,newChapter.trim()]}));setNewChapter('');}}} className="bg-slate-900 text-white font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-slate-700 transition-all flex items-center gap-2"><PlusCircle size={14}/> Add</button>
        </div>
      </Card>

      {/* ── Positions & Fees ── */}
      <Card>
        <SectionTitle>Positions & Registration Fees</SectionTitle>
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-12 gap-2 px-1">
            <span className="col-span-1 text-[10px] font-black text-slate-400 uppercase">#</span>
            <span className="col-span-7 text-[10px] font-black text-slate-400 uppercase">Position Title</span>
            <span className="col-span-3 text-[10px] font-black text-slate-400 uppercase">Fee ({local.currency_symbol})</span>
            <span className="col-span-1"/>
          </div>
          {local.positions_fees.map((pf, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-1 text-xs font-black text-slate-300 text-center">{i+1}</span>
              <input value={pf.position} onChange={e=>{const p=[...local.positions_fees];p[i]={...p[i],position:e.target.value};setLocal(prev=>({...prev,positions_fees:p}));}} className="col-span-7 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <input type="number" value={pf.fee} onChange={e=>{const p=[...local.positions_fees];p[i]={...p[i],fee:Number(e.target.value)};setLocal(prev=>({...prev,positions_fees:p}));}} className="col-span-3 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <button onClick={()=>setLocal(prev=>({...prev,positions_fees:prev.positions_fees.filter((_,idx)=>idx!==i)}))} className="col-span-1 text-red-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all flex justify-center"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
        <button onClick={()=>setLocal(prev=>({...prev,positions_fees:[...prev.positions_fees,{position:'New Position',fee:0}]}))} className="border-2 border-dashed border-slate-200 hover:border-red-400 text-slate-500 hover:text-red-600 font-black uppercase px-5 py-3 rounded-xl text-xs w-full transition-all flex items-center justify-center gap-2"><PlusCircle size={14}/> Add Position</button>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {local.positions_fees.map((pf,i)=>(
            <div key={i} className="bg-slate-900 rounded-2xl p-4 text-center">
              <p className="text-red-500 font-black text-lg">{local.currency_symbol}{pf.fee.toLocaleString()}</p>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest leading-tight mt-1">{pf.position}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Head Admins ── */}
      <Card>
        <SectionTitle>Head Administrators</SectionTitle>
        <div className="space-y-2 mb-4">
          {headAdmins.map((email,i)=>(
            <div key={email} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
              <Crown size={14} className={i===0?'text-yellow-500':'text-slate-400'}/>
              <span className="flex-1 font-bold text-slate-800 text-sm">{email}</span>
              {i===0&&<span className="text-[10px] font-black text-yellow-600 uppercase bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-200">Primary</span>}
              {i>0&&<button onClick={()=>removeHeadAdmin(email)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={14}/></button>}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={newHA} onChange={e=>setNewHA(e.target.value)} placeholder="Add head admin email..." onKeyDown={e=>e.key==='Enter'&&addHeadAdmin()} className="flex-1 border-2 border-dashed border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
          <button onClick={addHeadAdmin} disabled={haSaving} className="bg-slate-900 text-white font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50">{haSaving?<Loader2 size={14} className="animate-spin"/>:<PlusCircle size={14}/>} Add</button>
        </div>
      </Card>

      {/* ── Danger Zone ── */}
      {(() => {
        const countdownActive = deadline ? new Date(deadline).getTime() > Date.now() : false;
        const electionOver    = deadline ? new Date(deadline).getTime() <= Date.now() : false;
        const locked          = countdownActive || electionOver;

        async function resetTable(table: string) {
          const { error } = await supabase.from(table).delete().gte('created_at','1970-01-01');
          if (error) {
            const { error: e2 } = await supabase.from(table).delete().neq('email','NOEMAIL_PLACEHOLDER_XYZ');
            if (e2) { showToast(`Failed to reset ${table}: ${e2.message}`, false); return false; }
          }
          return true;
        }

        return (
          <Card accent="red">
            <SectionTitle>⚠ Danger Zone — Reset System</SectionTitle>
            {locked && (
              <div className={`flex items-start gap-3 p-5 rounded-2xl mb-6 border-2 ${countdownActive?'bg-yellow-50 border-yellow-300':'bg-red-50 border-red-300'}`}>
                <span className="text-2xl shrink-0">{countdownActive?'🔒':'🏁'}</span>
                <div>
                  <p className={`font-black text-sm uppercase ${countdownActive?'text-yellow-800':'text-red-800'}`}>{countdownActive?'Reset Locked — Countdown Active':'Reset Locked — Election Has Ended'}</p>
                  <p className={`text-xs font-bold mt-1 ${countdownActive?'text-yellow-700':'text-red-700'}`}>{countdownActive?'Remove the deadline first to unlock resets.':'Archive results before resetting.'}</p>
                </div>
              </div>
            )}
            <div className={`space-y-3 ${locked?'opacity-40 pointer-events-none select-none':''}`}>
              {[
                { label:'Reset All Votes',       sub:'Clears every ballot',                                         table:'votes',                color:'border-orange-200 bg-orange-50', btn:'bg-orange-500 hover:bg-orange-600' },
                { label:'Reset Voter Profiles',  sub:'Voters must re-register on next login',                       table:'voter_profiles',        color:'border-orange-200 bg-orange-50', btn:'bg-orange-500 hover:bg-orange-600' },
                { label:'Reset All Candidates',  sub:'Removes all candidates from the ballot',                      table:'candidates',            color:'border-red-200 bg-red-50',       btn:'bg-red-600 hover:bg-red-700' },
                { label:'Reset Applications',    sub:'Deletes all candidacy registration applications',             table:'candidate_applications',color:'border-red-200 bg-red-50',       btn:'bg-red-600 hover:bg-red-700' },
                { label:'Reset Voter Roster',    sub:'Clears the eligible voter whitelist',                         table:'eligible_voters',       color:'border-red-200 bg-red-50',       btn:'bg-red-600 hover:bg-red-700' },
              ].map(({ label, sub, table, color, btn }) => (
                <div key={table} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-2 rounded-2xl ${color}`}>
                  <div><p className="font-black text-slate-800 text-sm">{label}</p><p className="text-xs text-slate-500 font-bold mt-0.5">{sub}</p></div>
                  <button onClick={async()=>{ if(!confirm(`⚠ Are you sure you want to ${label}?\nThis CANNOT be undone.`))return; const ok=await resetTable(table); if(ok)showToast(`✓ ${label} complete. Refresh to confirm.`); }} className={`${btn} text-white font-black uppercase px-5 py-3 rounded-xl text-xs transition-all shrink-0`}>Reset</button>
                </div>
              ))}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-2 border-slate-800 bg-slate-900 rounded-2xl mt-2">
                <div><p className="font-black text-white text-sm">🔴 Full System Reset</p><p className="text-xs text-slate-400 font-bold mt-0.5">Clears votes, voter profiles, candidates, and applications. Settings, admins and roster preserved.</p></div>
                <button onClick={async()=>{ if(!confirm('⚠ FULL RESET\n\nClears: Votes, Voter Profiles, Candidates, Applications\n\nCannot be undone. Continue?'))return; if(!confirm('FINAL CONFIRMATION — Click OK to proceed.'))return; let allOk=true; for(const t of['votes','voter_profiles','candidates','candidate_applications']){const ok=await resetTable(t);if(!ok){allOk=false;break;}} if(allOk)showToast('✓ Full reset complete. Refresh now.'); }} className="bg-white text-slate-900 font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-red-600 hover:text-white transition-all shrink-0">Full Reset</button>
              </div>
            </div>
          </Card>
        );
      })()}

      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-10 py-5 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 text-sm">
          {saving?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>}{saving?'Saving...':'Save All Settings'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMAINING TABS — Members, Dues, Events, Audit, Investments
// (identical to original — preserved exactly)
// ─────────────────────────────────────────────────────────────────────────────
// These are large tabs that had no changes needed. Copy them verbatim from
// the original admin/page.tsx you shared:
//   - MembersTab
//   - DuesTab
//   - EventsTab (includes AttendanceModal)
//   - AuditLogTab
//   - InvestmentsTab
//
// They are unchanged and only need the same props they already receive.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TAB: MEMBERS
// ─────────────────────────────────────────────────────────────────────────────
function MembersTab({ members, setMembers, showToast, isHeadAdmin, myChapter, adminEmail }: {
  members: Member[]; setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string;
}) {
  const [filter, setFilter]       = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const [selected, setSelected]   = useState<Member | null>(null);
  const [rejReason, setRejReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]       = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [pwResult, setPwResult]   = useState('');
  const [pwResetting, setPwResetting] = useState(false);
  const [transferChapter, setTransferChapter] = useState('');
  const [transferring, setTransferring]       = useState(false);

  // ── Duplicate detection ───────────────────────────────────────────────────
  const [dupChecking, setDupChecking] = useState(false);
  const [dupResults, setDupResults]   = useState<{
    sameName: Member[];
    sameId: Member[];
    samePhone: Member[];
    hasDues: { member_name: string; amount: number; currency: string; period: string }[];
  } | null>(null);

  async function runDuplicateCheck(m: Member) {
    setDupChecking(true); setDupResults(null);
    const nameParts = m.full_name.toLowerCase().split(' ').filter(Boolean);

    const [{ data: allMembers }, { data: duesData }] = await Promise.all([
      supabase.from('members').select('id,full_name,email,phone,id_number,status,chapter').neq('id', m.id),
      supabase.from('dues_payments').select('member_name,amount,currency,period,status').eq('status','approved'),
    ]);

    const others = allMembers ?? [];

    // Same name — match if 2+ words overlap
    const sameName = others.filter(o => {
      const oParts = o.full_name.toLowerCase().split(' ').filter(Boolean);
      return nameParts.filter(p => oParts.includes(p)).length >= 2;
    });

    // Same ID number
    const sameId = m.id_number?.trim()
      ? others.filter(o => o.id_number?.trim().toLowerCase() === m.id_number.trim().toLowerCase())
      : [];

    // Same phone
    const samePhone = m.phone?.trim()
      ? others.filter(o => o.phone?.trim() === m.phone?.trim())
      : [];

    // Dues paid under similar name on ANY record
    const hasDues = (duesData ?? []).filter(d => {
      const dParts = d.member_name.toLowerCase().split(' ').filter(Boolean);
      return nameParts.filter(p => dParts.includes(p)).length >= 2;
    });

    setDupResults({ sameName, sameId, samePhone, hasDues });
    setDupChecking(false);
  }

  const visible = members.filter(m => {
    const chapterMatch = isHeadAdmin || m.chapter === myChapter;
    const statusMatch  = filter === 'all' || m.status === filter;
    const searchMatch  = !search || m.full_name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()) || m.chapter.toLowerCase().includes(search.toLowerCase());
    return chapterMatch && statusMatch && searchMatch;
  });

  const pending  = members.filter(m => m.status==='pending'  && (isHeadAdmin||m.chapter===myChapter)).length;
  const approved = members.filter(m => m.status==='approved' && (isHeadAdmin||m.chapter===myChapter)).length;
  const rejected = members.filter(m => m.status==='rejected' && (isHeadAdmin||m.chapter===myChapter)).length;

  async function approveMember(m: Member) {
    setProcessing(true);
    const approvedAt = new Date().toISOString();
    const { error } = await supabase.from('members').update({ status:'approved', approved_by:adminEmail, approved_at:approvedAt }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    await supabase.from('eligible_voters').upsert([{ email:m.email, chapter:m.chapter }], { onConflict:'email' });
    await supabase.from('activity_log').insert([{ member_id:m.id, member_name:m.full_name, chapter:m.chapter, action:'Membership approved — added to voter roster', details:`Approved by ${adminEmail}` }]);
    setMembers(prev => prev.map(x => x.id===m.id ? {...x, status:'approved', approved_by:adminEmail, approved_at:approvedAt} : x));
    setSelected(null); setProcessing(false);
    showToast(`✓ ${m.full_name} approved and added to voter roster.`);
  }

  async function rejectMember(m: Member) {
    if (!rejReason.trim()) { showToast('Rejection reason required.', false); return; }
    setProcessing(true);
    const { error } = await supabase.from('members').update({ status:'rejected', approved_by:adminEmail, approved_at:new Date().toISOString() }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    await supabase.from('activity_log').insert([{ member_id:m.id, member_name:m.full_name, chapter:m.chapter, action:'Membership rejected', details:`Reason: ${rejReason.trim()}` }]);
    setMembers(prev => prev.map(x => x.id===m.id ? {...x, status:'rejected'} : x));
    setSelected(null); setRejReason(''); setProcessing(false);
    showToast(`${m.full_name}'s membership rejected.`);
  }

  async function deactivateMember(m: Member) {
    if (!confirm(`Deactivate ${m.full_name}? They will lose voting access. Reversible.`)) return;
    setProcessing(true);
    await supabase.from('members').update({ status:'rejected' }).eq('id', m.id);
    await supabase.from('eligible_voters').delete().eq('email', m.email);
    await supabase.from('activity_log').insert([{ member_id:m.id, member_name:m.full_name, chapter:m.chapter, action:'Member deactivated', details:`By ${adminEmail}` }]);
    setMembers(prev => prev.map(x => x.id===m.id ? {...x, status:'rejected'} : x));
    setSelected(null); setProcessing(false);
    showToast(`${m.full_name} deactivated and removed from voter roster.`);
  }

  async function reactivateMember(m: Member) {
    if (!confirm(`Reactivate ${m.full_name}? They will regain member privileges.`)) return;
    setProcessing(true);
    const approvedAt = new Date().toISOString();
    await supabase.from('members').update({ status:'approved', approved_by:adminEmail, approved_at:approvedAt }).eq('id', m.id);
    await supabase.from('eligible_voters').upsert([{ email:m.email, chapter:m.chapter }], { onConflict:'email' });
    await supabase.from('activity_log').insert([{ member_id:m.id, member_name:m.full_name, chapter:m.chapter, action:'Member reactivated', details:`By ${adminEmail}` }]);
    setMembers(prev => prev.map(x => x.id===m.id ? {...x, status:'approved', approved_by:adminEmail, approved_at:approvedAt} : x));
    setSelected(null); setProcessing(false);
    showToast(`${m.full_name} reactivated and added back to voter roster.`);
  }

  async function adminResetPassword(m: Member) {
    if (!tempPassword.trim() || tempPassword.length < 8) { setPwResult('Password must be at least 8 characters.'); return; }
    setPwResetting(true); setPwResult('');
    await supabase.from('activity_log').insert([{ member_id:m.id, member_name:m.full_name, chapter:m.chapter, action:'Password reset by admin', details:`Reset by ${adminEmail} — temp password shared directly` }]);
    setPwResult(`✓ Logged. Share this password directly with ${m.full_name}: "${tempPassword}"`);
    setTempPassword(''); setPwResetting(false);
  }

  function exportCSV() {
    const headers = ['Member ID','Full Name','Email','Phone','Chapter','Class Name','Year Graduated','Sponsor','Principal','ID Number','Status','Applied','Approved By','Approved At'];
    const rows = visible.map(m => [m.id.slice(0,8).toUpperCase(),m.full_name,m.email,m.phone??'',m.chapter,m.class_name,String(m.year_graduated),m.sponsor_name,m.principal_name,m.id_number,m.status,new Date(m.created_at).toLocaleString(),m.approved_by??'',m.approved_at?new Date(m.approved_at).toLocaleString():'']);
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:`BWIAA_Members_${filter}_${new Date().toISOString().slice(0,10)}.csv`}); a.click();
  }

  const statusBadge = (s: string) => ({pending:'bg-yellow-100 text-yellow-700 border-yellow-200',approved:'bg-green-100 text-green-700 border-green-200',rejected:'bg-red-100 text-red-700 border-red-200'}[s]??'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-8">
      {selected && (
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-lg w-full my-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                {selected.photo_url ? <img src={selected.photo_url} className="w-full h-full object-cover" alt={selected.full_name}/> : <div className="w-full h-full flex items-center justify-center bg-slate-200"><span className="text-2xl font-black text-slate-400">{selected.full_name.charAt(0)}</span></div>}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase text-slate-900">{selected.full_name}</h3>
                <p className="text-xs text-red-600 font-bold uppercase mt-1">{selected.chapter}</p>
                <p className="text-xs text-slate-400 font-bold">{selected.email}</p>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>{selected.status}</span>
              </div>
              <button onClick={()=>setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1"><XCircle size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              {[['Member ID',selected.id.slice(0,8).toUpperCase()],['Email',selected.email],['Phone',selected.phone??'—'],['ID Number',selected.id_number],['Class Name',selected.class_name],['Year Graduated',String(selected.year_graduated)],['Class Sponsor',selected.sponsor_name],['Principal',selected.principal_name],['Applied',new Date(selected.created_at).toLocaleString()]].map(([l,v])=>(
                <div key={l} className="flex flex-col py-1 border-b border-slate-100">
                  <span className="font-black text-slate-400 uppercase tracking-widest text-[10px]">{l}</span>
                  <span className={`font-black mt-0.5 ${l==='Member ID'?'text-red-600 font-mono':'text-slate-800'}`}>{v}</span>
                </div>
              ))}
            </div>
            {selected.status==='pending' && (
              <div className="space-y-4">

                {/* ── Duplicate Check Panel ── */}
                <div className="border-2 border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Search size={14} className="text-slate-500"/>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Duplicate Check</p>
                      <p className="text-[10px] text-slate-400 font-bold">— run before approving</p>
                    </div>
                    <button
                      onClick={() => runDuplicateCheck(selected)}
                      disabled={dupChecking}
                      className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white font-black uppercase text-[10px] px-4 py-2 rounded-xl transition-all disabled:opacity-50">
                      {dupChecking ? <Loader2 size={11} className="animate-spin"/> : <Search size={11}/>}
                      {dupChecking ? 'Scanning...' : 'Scan Now'}
                    </button>
                  </div>

                  {dupResults && (
                    <div className="p-4 space-y-3">
                      {/* No issues */}
                      {dupResults.sameName.length === 0 && dupResults.sameId.length === 0 && dupResults.samePhone.length === 0 && dupResults.hasDues.length === 0 && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                          <CheckCircle2 size={16} className="text-green-600 shrink-0"/>
                          <p className="text-xs font-black text-green-700">No duplicates found. Safe to approve.</p>
                        </div>
                      )}

                      {/* Same name matches */}
                      {dupResults.sameName.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                          <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">⚠ Similar Name Found ({dupResults.sameName.length})</p>
                          {dupResults.sameName.map(o => (
                            <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0">
                              <div>
                                <p className="text-xs font-black text-slate-800">{o.full_name}</p>
                                <p className="text-[10px] text-slate-500 font-bold">{o.email} · {o.chapter}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${o.status==='approved'?'bg-green-100 text-green-700':o.status==='pending'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{o.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Same ID number */}
                      {dupResults.sameId.length > 0 && (
                        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3">
                          <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-2">🚨 Same ID Number ({dupResults.sameId.length}) — Strong Duplicate Signal</p>
                          {dupResults.sameId.map(o => (
                            <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-red-100 last:border-0">
                              <div>
                                <p className="text-xs font-black text-slate-800">{o.full_name}</p>
                                <p className="text-[10px] text-slate-500 font-bold">{o.email} · {o.chapter}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${o.status==='approved'?'bg-green-100 text-green-700':o.status==='pending'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{o.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Same phone */}
                      {dupResults.samePhone.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                          <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2">⚠ Same Phone Number ({dupResults.samePhone.length})</p>
                          {dupResults.samePhone.map(o => (
                            <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0">
                              <div>
                                <p className="text-xs font-black text-slate-800">{o.full_name}</p>
                                <p className="text-[10px] text-slate-500 font-bold">{o.email} · {o.chapter}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${o.status==='approved'?'bg-green-100 text-green-700':o.status==='pending'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{o.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Dues under same name on other records */}
                      {dupResults.hasDues.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-2">💰 Dues Paid Under This Name ({dupResults.hasDues.length} records)</p>
                          <p className="text-[10px] text-blue-600 font-bold mb-2">Payment history exists — may need to transfer to this record after approval.</p>
                          {dupResults.hasDues.slice(0,5).map((d,i) => (
                            <div key={i} className="flex items-center justify-between py-1 border-b border-blue-100 last:border-0">
                              <p className="text-[10px] font-black text-slate-700">{d.member_name} · {d.period}</p>
                              <p className="text-[10px] font-black text-green-700">{d.currency}{d.amount.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!dupResults && !dupChecking && (
                    <div className="px-4 pb-3 pt-1">
                      <p className="text-[10px] text-slate-400 font-bold">Click Scan Now to check for duplicate names, ID numbers, phone numbers and existing dues payments before approving.</p>
                    </div>
                  )}
                </div>

                <button onClick={()=>approveMember(selected)} disabled={processing} className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">{processing?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>} Approve Membership</button>
                <div className="flex gap-2">
                  <input value={rejReason} onChange={e=>setRejReason(e.target.value)} placeholder="Rejection reason (required)..." className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm"/>
                  <button onClick={()=>rejectMember(selected)} disabled={processing||!rejReason.trim()} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-5 py-3 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"><XCircle size={14}/> Reject</button>
                </div>
              </div>
            )}
            {selected.status!=='pending' && (
              <div className={`rounded-2xl p-4 text-sm font-bold ${selected.status==='approved'?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>
                {selected.status==='approved'?`✓ Approved by ${selected.approved_by??'admin'} on ${selected.approved_at?new Date(selected.approved_at).toLocaleDateString():'—'}`:'✗ This membership is inactive/rejected.'}
              </div>
            )}
            {selected.status==='approved' && (
              <div className="border-t border-slate-100 pt-4 mt-3">
                <button onClick={()=>deactivateMember(selected)} disabled={processing} className="w-full bg-orange-50 hover:bg-orange-100 text-orange-700 border-2 border-orange-200 font-black uppercase py-3 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">⛔ Deactivate Member</button>
                <p className="text-xs text-slate-400 font-bold text-center mt-2">Removes voting access · Reversible</p>
              </div>
            )}
            {selected.status==='rejected' && (
              <div className="border-t border-slate-100 pt-4 mt-3">
                <button onClick={()=>reactivateMember(selected)} disabled={processing} className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-3 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm"><CheckCircle2 size={14}/> Reactivate Member</button>
                <p className="text-xs text-slate-400 font-bold text-center mt-2">Restores access and re-adds to voter roster</p>
              </div>
            )}
            {selected.status==='approved' && (
              <div className="border-t border-slate-100 pt-5 mt-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Key size={12}/> Admin Password Reset</p>
                <div className="flex gap-2">
                  <input value={tempPassword} onChange={e=>{setTempPassword(e.target.value);setPwResult('');}} placeholder="Temporary password (min 8 chars)" className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm" type="text"/>
                  <button onClick={()=>adminResetPassword(selected)} disabled={pwResetting||tempPassword.length<8} className="bg-slate-900 hover:bg-slate-700 text-white font-black uppercase px-4 py-3 rounded-2xl text-xs transition-all disabled:opacity-50 shrink-0">{pwResetting?<Loader2 size={14} className="animate-spin"/>:'Set'}</button>
                </div>
                {pwResult && <div className={`mt-3 p-3 rounded-xl text-xs font-bold leading-relaxed ${pwResult.startsWith('✓')?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200'}`}>{pwResult}</div>}
              </div>
            )}
            {selected.status==='approved' && isHeadAdmin && (
              <div className="border-t border-slate-100 pt-5 mt-3">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">🔁 Transfer to Another Chapter</p>
                <div className="flex gap-2">
                  <select value={transferChapter} onChange={e=>setTransferChapter(e.target.value)} className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm">
                    <option value="">Select new chapter...</option>
                    {CHAPTERS.filter(c=>c!==selected.chapter).map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <button disabled={!transferChapter||transferring} onClick={async()=>{
                    if(!transferChapter||!confirm(`Transfer ${selected.full_name} to ${transferChapter}?`))return;
                    setTransferring(true);
                    await supabase.from('members').update({chapter:transferChapter}).eq('id',selected.id);
                    await supabase.from('eligible_voters').update({chapter:transferChapter}).eq('email',selected.email);
                    await supabase.from('activity_log').insert([{member_id:selected.id,member_name:selected.full_name,chapter:transferChapter,action:'Chapter transfer',details:`From ${selected.chapter} to ${transferChapter} by ${adminEmail}`}]);
                    setMembers(prev=>prev.map(m=>m.id===selected.id?{...m,chapter:transferChapter}:m));
                    setSelected(prev=>prev?{...prev,chapter:transferChapter}:null);
                    setTransferChapter(''); setTransferring(false);
                    showToast(`✓ ${selected.full_name} transferred to ${transferChapter}.`);
                  }} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-4 py-3 rounded-2xl text-xs transition-all disabled:opacity-50 shrink-0 flex items-center gap-1">
                    {transferring?<Loader2 size={14} className="animate-spin"/>:'→'} Transfer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Member Applications</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review and approve member registrations</p></div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Download size={14}/> CSV ({filter})</button>
          <Link href="/members" className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Users size={14}/> View Portal</Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{pending}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p></div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{approved}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p></div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{rejected}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email or chapter..." className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/></div>
        <div className="flex gap-2 flex-wrap">{(['pending','approved','rejected','all'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter===f?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{f}</button>)}</div>
      </div>

      <Card>
        <SectionTitle>Members ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(m=>(
            <div key={m.id} onClick={()=>{setSelected(m);setRejReason('');setDupResults(null);}} className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0">{m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>:<div className="w-full h-full flex items-center justify-center"><span className="font-black text-slate-400">{m.full_name.charAt(0)}</span></div>}</div>
              <div className="flex-1 min-w-0"><p className="font-black text-slate-800 truncate">{m.full_name}</p><p className="text-xs text-slate-400 font-bold uppercase truncate">{m.chapter} · Class of {m.year_graduated}</p><p className="text-[10px] text-slate-400 font-bold">{new Date(m.created_at).toLocaleDateString()} · <span className="font-mono text-red-500">{m.id.slice(0,8).toUpperCase()}</span></p></div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border shrink-0 ${statusBadge(m.status)}`}>{m.status}</span>
            </div>
          ))}
          {visible.length===0&&<p className="text-slate-400 font-bold text-sm text-center py-8">No {filter==='all'?'':filter+' '}member applications.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: DUES
// ─────────────────────────────────────────────────────────────────────────────
function DuesTab({ dues, setDues, showToast, isHeadAdmin, myChapter, adminEmail, config }: {
  dues: DuesPayment[]; setDues: React.Dispatch<React.SetStateAction<DuesPayment[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string; config: ElectionConfig;
}) {
  const [filter, setFilter]     = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const [selected, setSelected] = useState<DuesPayment|null>(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]     = useState('');
  const [viewImg, setViewImg]   = useState<string|null>(null);
  const symbol = config.currency_symbol;

  const visible = dues.filter(d => {
    const chMatch = isHeadAdmin||d.chapter===myChapter;
    const stMatch = filter==='all'||d.status===filter;
    const srMatch = !search||d.member_name.toLowerCase().includes(search.toLowerCase())||d.chapter.toLowerCase().includes(search.toLowerCase())||d.period.toLowerCase().includes(search.toLowerCase());
    return chMatch&&stMatch&&srMatch;
  });

  const pending  = dues.filter(d=>d.status==='pending' &&(isHeadAdmin||d.chapter===myChapter)).length;
  const approved = dues.filter(d=>d.status==='approved'&&(isHeadAdmin||d.chapter===myChapter)).length;
  const rejected = dues.filter(d=>d.status==='rejected'&&(isHeadAdmin||d.chapter===myChapter)).length;
  const totalApproved = dues.filter(d=>d.status==='approved'&&(isHeadAdmin||d.chapter===myChapter)).reduce((s,d)=>s+d.amount,0);

  async function approve(d: DuesPayment) {
    setProcessing(true);
    const approvedAt = new Date().toISOString();
    const { error } = await supabase.from('dues_payments').update({ status:'approved', approved_by:adminEmail, approved_at:approvedAt }).eq('id',d.id);
    if (error) { showToast(`Failed: ${error.message}`,false); setProcessing(false); return; }
    await supabase.from('activity_log').insert([{ member_name:d.member_name, chapter:d.chapter, action:'Dues payment approved', details:`${symbol}${d.amount} for ${d.period} approved by ${adminEmail}` }]);
    setDues(prev=>prev.map(x=>x.id===d.id?{...x,status:'approved',approved_by:adminEmail,approved_at:approvedAt}:x));
    setSelected(null); setProcessing(false);
    showToast(`✓ ${symbol}${d.amount} payment from ${d.member_name} approved.`);
  }

  async function reject(d: DuesPayment) {
    if (!confirm(`Reject payment from ${d.member_name}?`)) return;
    setProcessing(true);
    await supabase.from('dues_payments').update({ status:'rejected', approved_by:adminEmail, approved_at:new Date().toISOString() }).eq('id',d.id);
    setDues(prev=>prev.map(x=>x.id===d.id?{...x,status:'rejected'}:x));
    setSelected(null); setProcessing(false);
    showToast(`${d.member_name}'s payment rejected.`);
  }

  function exportCSV() {
    const headers=['Member','Chapter','Period','Amount','Currency','Method','Status','Notes','Submitted','Approved By','Approved At'];
    const rows=visible.map(d=>[d.member_name,d.chapter,d.period,String(d.amount),d.currency,d.payment_method,d.status,d.notes??'',new Date(d.created_at).toLocaleString(),d.approved_by??'',d.approved_at?new Date(d.approved_at).toLocaleString():'']);
    const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:`Dues_${filter}_${new Date().toISOString().slice(0,10)}.csv`}); a.click();
  }

  const statusBadge=(s:string)=>({pending:'bg-yellow-100 text-yellow-700 border-yellow-200',approved:'bg-green-100 text-green-700 border-green-200',rejected:'bg-red-100 text-red-700 border-red-200'}[s]??'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-8">
      {viewImg&&<div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={()=>setViewImg(null)}><img src={viewImg} className="max-w-full max-h-full rounded-2xl shadow-2xl" alt="Payment proof"/><button className="absolute top-4 right-4 bg-white/10 text-white p-2 rounded-full" onClick={()=>setViewImg(null)}><XCircle size={24}/></button></div>}

      {selected&&(
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-lg w-full my-4 shadow-2xl">
            <div className="flex items-start justify-between mb-6">
              <div><h3 className="text-xl font-black uppercase text-slate-900">{selected.member_name}</h3><p className="text-xs text-red-600 font-bold uppercase mt-1">{selected.chapter}</p><span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>{selected.status}</span></div>
              <div className="text-right"><p className="text-3xl font-black text-slate-900">{symbol}{selected.amount.toLocaleString()}</p><p className="text-xs text-slate-400 font-bold">{selected.currency}</p></div>
              <button onClick={()=>setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1 ml-2"><XCircle size={20}/></button>
            </div>
            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              {[['Period',selected.period],['Method',selected.payment_method==='in_person'?'In Person':'Screenshot/Transfer'],['Notes',selected.notes??'—'],['Submitted',new Date(selected.created_at).toLocaleString()]].map(([l,v])=>(
                <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0"><span className="font-black text-slate-400 uppercase tracking-widest">{l}</span><span className="font-black text-slate-800 text-right max-w-[60%]">{v}</span></div>
              ))}
            </div>
            {selected.screenshot_url&&(
              <div className="mb-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Screenshot</p>
                <img src={selected.screenshot_url} className="rounded-2xl max-h-48 w-full object-cover border border-slate-200 cursor-pointer" alt="Payment proof" onClick={()=>setViewImg(selected.screenshot_url!)}/>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Click to enlarge</p>
              </div>
            )}
            {selected.status==='pending'&&(
              <div className="space-y-3">
                <button onClick={()=>approve(selected)} disabled={processing} className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">{processing?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>} Approve Payment</button>
                <button onClick={()=>reject(selected)} disabled={processing} className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 border-2 border-red-200"><XCircle size={16}/> Reject Payment</button>
              </div>
            )}
            {selected.status!=='pending'&&<div className={`rounded-2xl p-4 text-sm font-bold ${selected.status==='approved'?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{selected.status==='approved'?`✓ Approved by ${selected.approved_by??'admin'} on ${selected.approved_at?new Date(selected.approved_at).toLocaleDateString():'—'}`:'✗ This payment was rejected.'}</div>}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Dues Payments</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review and approve member dues submissions</p></div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Download size={14}/> CSV</button>
          <Link href="/finances" className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><DollarSign size={14}/> Public View</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{pending}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p></div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{approved}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p></div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-4xl font-black">{rejected}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p></div>
        <div className="bg-slate-900 text-white rounded-3xl p-6 text-center shadow-lg"><p className="text-2xl font-black">{symbol}{totalApproved.toLocaleString()}</p><p className="text-xs font-bold uppercase tracking-widest opacity-60 mt-1">Total Collected</p></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, chapter or period..." className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/></div>
        <div className="flex gap-2 flex-wrap">{(['pending','approved','rejected','all'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter===f?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{f}</button>)}</div>
      </div>

      <Card>
        <SectionTitle>Payments ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(d=>(
            <div key={d.id} onClick={()=>setSelected(d)} className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
              <div className="flex-1 min-w-0"><p className="font-black text-slate-800 truncate">{d.member_name}</p><p className="text-xs text-slate-400 font-bold uppercase truncate">{d.chapter} · {d.period}</p><p className="text-[10px] text-slate-400 font-bold">{new Date(d.created_at).toLocaleDateString()} · {d.payment_method==='in_person'?'In Person':'Screenshot'}</p></div>
              <div className="text-right shrink-0"><p className="font-black text-xl text-slate-900">{symbol}{d.amount.toLocaleString()}</p><span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${statusBadge(d.status)}`}>{d.status}</span></div>
            </div>
          ))}
          {visible.length===0&&<p className="text-slate-400 font-bold text-sm text-center py-8">No {filter==='all'?'':filter+' '}dues payments.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: EVENTS
// ─────────────────────────────────────────────────────────────────────────────
function EventsTab({ events, setEvents, showToast, isHeadAdmin, myChapter, adminEmail, config, members }: {
  events: EventRow[]; setEvents: React.Dispatch<React.SetStateAction<EventRow[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string;
  config: ElectionConfig; members: Member[];
}) {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [chapter, setChapter]   = useState(myChapter ?? config.chapters[0] ?? 'All');
  const [eventDate, setDate]    = useState('');
  const [eventTime, setTime]    = useState('');
  const [location, setLocation] = useState('');
  const [eventType, setType]    = useState<'meeting'|'event'|'announcement'|'other'>('meeting');
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState<'all'|'upcoming'|'past'>('all');
  const [attendanceEvent, setAttendanceEvent] = useState<EventRow|null>(null);

  const visible = events.filter(e => {
    const chMatch = isHeadAdmin||!e.chapter||e.chapter===myChapter||e.chapter==='All';
    const now=new Date(), evDate=new Date(e.event_date);
    if(filter==='upcoming')return chMatch&&evDate>=now;
    if(filter==='past')return chMatch&&evDate<now;
    return chMatch;
  });

  async function createEvent() {
    if (!title.trim()) { showToast('Title required.', false); return; }
    if (!eventDate) { showToast('Date required.', false); return; }
    setSaving(true);
    const { data, error } = await supabase.from('events').insert([{ title:title.trim(), description:description.trim()||null, chapter:chapter==='All'?null:chapter, event_date:eventDate, event_time:eventTime||null, location:location.trim()||null, event_type:eventType, created_by:adminEmail }]).select().single();
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`,false); return; }
    setEvents(prev=>[data,...prev]); setTitle(''); setDesc(''); setDate(''); setTime(''); setLocation('');
    showToast(`✓ ${eventType==='announcement'?'Announcement':'Event'} posted to ${chapter==='All'?'all chapters':chapter}.`);
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    const { error } = await supabase.from('events').delete().eq('id',id);
    if (error) { showToast(`Failed: ${error.message}`,false); return; }
    setEvents(prev=>prev.filter(e=>e.id!==id)); showToast('Event deleted.');
  }

  const typeConfig: Record<string,{label:string;color:string;bg:string}> = {
    meeting:{label:'Meeting',color:'text-blue-700',bg:'bg-blue-100 border-blue-200'},
    event:{label:'Event',color:'text-green-700',bg:'bg-green-100 border-green-200'},
    announcement:{label:'Announcement',color:'text-red-700',bg:'bg-red-100 border-red-200'},
    other:{label:'Other',color:'text-slate-700',bg:'bg-slate-100 border-slate-200'},
  };

  return (
    <div className="space-y-8">
      {attendanceEvent&&<AttendanceModal event={attendanceEvent} members={members.filter(m=>m.status==='approved'&&(isHeadAdmin||!attendanceEvent.chapter||m.chapter===attendanceEvent.chapter))} adminEmail={adminEmail} onClose={()=>setAttendanceEvent(null)} showToast={showToast}/>}

      <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Events & Announcements</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Post events, meetings and announcements</p></div>

      <Card accent="red">
        <SectionTitle>Post New Event / Announcement</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="md:col-span-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Title *</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Chapter General Meeting..." className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Type</label><div className="grid grid-cols-2 gap-2">{(['meeting','event','announcement','other'] as const).map(t=><button key={t} onClick={()=>setType(t)} className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${eventType===t?'bg-red-600 text-white border-red-600':'border-slate-200 text-slate-500 hover:border-red-400'}`}>{t}</button>)}</div></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Chapter</label><select value={chapter} onChange={e=>setChapter(e.target.value)} disabled={!isHeadAdmin} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none disabled:bg-slate-50">{isHeadAdmin&&<option value="All">All Chapters</option>}{config.chapters.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Date *</label><input type="date" value={eventDate} onChange={e=>setDate(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Time (optional)</label><input type="time" value={eventTime} onChange={e=>setTime(e.target.value)} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div className="md:col-span-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Location (optional)</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Chapter Hall, Zoom..." className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div className="md:col-span-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description (optional)</label><textarea value={description} onChange={e=>setDesc(e.target.value)} placeholder="Details..." rows={3} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none resize-none"/></div>
        </div>
        <button onClick={createEvent} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50">{saving?<Loader2 size={16} className="animate-spin"/>:eventType==='announcement'?<Bell size={16}/>:<Calendar size={16}/>}{saving?'Posting...':eventType==='announcement'?'Post Announcement':'Create Event'}</button>
      </Card>

      <div className="flex gap-2">{(['upcoming','past','all'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${filter===f?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{f}</button>)}</div>

      <div className="space-y-4">
        {visible.length===0?<div className="text-center py-16 text-slate-400"><Calendar size={48} className="mx-auto mb-4 opacity-20"/><p className="font-black uppercase tracking-widest text-sm">No {filter} events</p></div>:visible.map(ev=>{
          const cfg=typeConfig[ev.event_type]??typeConfig['other'];
          const isPast=new Date(ev.event_date)<new Date();
          return (
            <Card key={ev.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    {ev.chapter?<span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{ev.chapter}</span>:<span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-800 text-white border border-slate-700">All Chapters</span>}
                    {isPast&&<span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-100 text-slate-400 border border-slate-200">Past</span>}
                  </div>
                  <h3 className="font-black text-slate-800 text-lg uppercase">{ev.title}</h3>
                  {ev.description&&<p className="text-slate-500 text-sm font-bold mt-1 leading-relaxed">{ev.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400 font-bold">
                    <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(ev.event_date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
                    {ev.event_time&&<span>🕐 {ev.event_time}</span>}
                    {ev.location&&<span className="flex items-center gap-1"><MapPin size={12}/> {ev.location}</span>}
                  </div>
                </div>
                <button onClick={()=>deleteEvent(ev.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all shrink-0"><Trash2 size={16}/></button>
              </div>
              {ev.event_type!=='announcement'&&(
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button onClick={()=>setAttendanceEvent(ev)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black uppercase text-xs px-5 py-3 rounded-2xl transition-all"><CheckCircle2 size={14}/> Take Attendance</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceModal({ event, members, adminEmail, onClose, showToast }: {
  event: EventRow; members: Member[]; adminEmail: string;
  onClose: () => void; showToast: (m: string, ok?: boolean) => void;
}) {
  const [attendance, setAttendance] = useState<Record<string,'present'|'absent'|'excused'>>({});
  const [notes, setNotes]           = useState<Record<string,string>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');

  useEffect(() => {
    supabase.from('attendance').select('*').eq('event_id',event.id).then(({data})=>{
      if(data){const map:Record<string,'present'|'absent'|'excused'>={};const noteMap:Record<string,string>={};data.forEach((a:any)=>{map[a.member_id]=a.status;noteMap[a.member_id]=a.note??'';});setAttendance(map);setNotes(noteMap);}
      setLoading(false);
    });
  },[event.id]);

  function setStatus(memberId:string,status:'present'|'absent'|'excused'){setAttendance(prev=>({...prev,[memberId]:status}));}
  function markAll(status:'present'|'absent'|'excused'){const map:Record<string,'present'|'absent'|'excused'>={};members.forEach(m=>{map[m.id]=status;});setAttendance(map);}

  async function saveAttendance() {
    setSaving(true);
    const rows=Object.entries(attendance).map(([member_id,status])=>({event_id:event.id,member_id,status,note:notes[member_id]||null}));
    if(rows.length===0){showToast('No attendance marked yet.',false);setSaving(false);return;}
    const {error}=await supabase.from('attendance').upsert(rows,{onConflict:'event_id,member_id'});
    if(error){showToast(`Failed: ${error.message}`,false);setSaving(false);return;}
    const present=rows.filter(r=>r.status==='present').length;const absent=rows.filter(r=>r.status==='absent').length;const excused=rows.filter(r=>r.status==='excused').length;
    await supabase.from('activity_log').insert([{member_name:adminEmail,chapter:event.chapter??'All',action:`Attendance taken — ${event.title}`,details:`Present:${present}, Absent:${absent}, Excused:${excused}`}]);
    showToast(`✓ Attendance saved — ${present} present, ${absent} absent, ${excused} excused.`);
    setSaving(false); onClose();
  }

  const filtered=members.filter(m=>!search||m.full_name.toLowerCase().includes(search.toLowerCase()));
  const totalMarked=Object.keys(attendance).length;
  const totalPresent=Object.values(attendance).filter(s=>s==='present').length;
  const BTNS=[{status:'present' as const,label:'P',color:'bg-green-600 text-white'},{status:'absent' as const,label:'A',color:'bg-red-600 text-white'},{status:'excused' as const,label:'E',color:'bg-yellow-500 text-white'}];

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col backdrop-blur-sm">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex-1 min-w-0"><h3 className="font-black text-slate-900 uppercase text-sm truncate">{event.title}</h3><p className="text-xs text-slate-400 font-bold">{new Date(event.event_date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}{event.chapter&&` · ${event.chapter}`}</p></div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right"><p className="text-xs font-black text-slate-800">{totalMarked}/{members.length} marked</p><p className="text-[10px] text-green-600 font-bold">{totalPresent} present</p></div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all"><XCircle size={20}/></button>
        </div>
      </div>
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mark All:</p>
        {BTNS.map(b=><button key={b.status} onClick={()=>markAll(b.status)} className={`${b.color} font-black text-xs uppercase px-4 py-2 rounded-xl`}>All {b.status}</button>)}
        <div className="flex-1"/>
        <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-red-600 w-36"/></div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading?<div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32}/></div>:(
          <div className="p-6">
            <div className="grid grid-cols-[2fr,auto,auto,auto,2fr] gap-3 px-4 py-3 bg-slate-100 rounded-2xl mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Member</span><span className="text-green-700 text-center px-4">Present</span><span className="text-red-600 text-center px-4">Absent</span><span className="text-yellow-600 text-center px-4">Excused</span><span>Note</span>
            </div>
            <div className="space-y-1">
              {filtered.map(m=>{
                const cur=attendance[m.id];
                return (
                  <div key={m.id} className={`grid grid-cols-[2fr,auto,auto,auto,2fr] gap-3 px-4 py-3 rounded-2xl items-center border transition-all ${cur==='present'?'bg-green-50 border-green-100':cur==='absent'?'bg-red-50 border-red-100':cur==='excused'?'bg-yellow-50 border-yellow-100':'bg-white hover:bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-200 shrink-0">{m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>:<div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-xs">{m.full_name.charAt(0)}</span></div>}</div>
                      <div className="min-w-0"><p className="font-black text-slate-800 text-sm truncate">{m.full_name}</p><p className="text-[10px] text-slate-400 font-bold">{m.class_name} · {m.year_graduated}</p></div>
                    </div>
                    {BTNS.map(b=><div key={b.status} className="flex justify-center px-3"><button onClick={()=>setStatus(m.id,b.status)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all border-2 ${cur===b.status?b.color+' border-transparent scale-110 shadow-md':'bg-white border-slate-200 text-slate-300 hover:border-slate-400'}`}>{b.label}</button></div>)}
                    <input value={notes[m.id]??''} onChange={e=>setNotes(prev=>({...prev,[m.id]:e.target.value}))} placeholder="Optional note..." className="border border-slate-200 focus:border-red-600 rounded-xl px-3 py-2 text-xs font-bold outline-none w-full"/>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex gap-4 text-xs font-bold flex-wrap">
          <span className="text-green-600 font-black">{Object.values(attendance).filter(s=>s==='present').length} Present</span>
          <span className="text-red-500 font-black">{Object.values(attendance).filter(s=>s==='absent').length} Absent</span>
          <span className="text-yellow-600 font-black">{Object.values(attendance).filter(s=>s==='excused').length} Excused</span>
          <span className="text-slate-400">{members.length-totalMarked} Unmarked</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-5 py-2.5 rounded-xl text-xs transition-all">Cancel</button>
          <button onClick={saveAttendance} disabled={saving||totalMarked===0} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-6 py-2.5 rounded-xl text-xs transition-all disabled:opacity-50">{saving?<Loader2 size={13} className="animate-spin"/>:<CheckCircle2 size={13}/>} Save Attendance</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
function AuditLogTab({ log, config }: { log: any[]; config: ElectionConfig }) {
  const [search, setSearch]         = useState('');
  const [chapterFilter, setChapter] = useState('All');
  const [actionFilter, setAction]   = useState('All');

  const filtered = log.filter(l => {
    const s=search.toLowerCase();
    const matchSearch=!s||(l.member_name??'').toLowerCase().includes(s)||(l.action??'').toLowerCase().includes(s)||(l.details??'').toLowerCase().includes(s);
    const matchChapter=chapterFilter==='All'||l.chapter===chapterFilter;
    const matchAction=actionFilter==='All'||(l.action??'').includes(actionFilter);
    return matchSearch&&matchChapter&&matchAction;
  });

  const actionTypes=['All',...Array.from(new Set(log.map(l=>l.action).filter(Boolean))).sort() as string[]];

  function exportCSV(){
    const headers=['Timestamp','Member','Chapter','Action','Details'];
    const rows=filtered.map(l=>[new Date(l.created_at).toLocaleString(),l.member_name??'—',l.chapter??'—',l.action??'—',l.details??'—']);
    const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:`BWIAA_Audit_Log_${new Date().toISOString().slice(0,10)}.csv`}); a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Audit Log</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Full record of all actions</p></div>
        <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><Download size={14}/> CSV</button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white rounded-3xl p-5 text-center"><p className="text-3xl font-black">{log.length}</p><p className="text-xs font-bold uppercase tracking-widest opacity-50 mt-1">Total Entries</p></div>
        <div className="bg-blue-600 text-white rounded-3xl p-5 text-center"><p className="text-3xl font-black">{[...new Set(log.map(l=>l.member_name).filter(Boolean))].length}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Unique Members</p></div>
        <div className="bg-red-600 text-white rounded-3xl p-5 text-center"><p className="text-3xl font-black">{filtered.length}</p><p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Showing</p></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search member, action, details..." className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/></div>
        <select value={chapterFilter} onChange={e=>setChapter(e.target.value)} className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-sm bg-white">{['All',...config.chapters].map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select value={actionFilter} onChange={e=>setAction(e.target.value)} className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-sm bg-white max-w-[200px]">{actionTypes.slice(0,20).map(a=><option key={a} value={a}>{a.length>30?a.slice(0,30)+'…':a}</option>)}</select>
      </div>
      <Card>
        <div className="overflow-x-auto -mx-2">
          <div className="grid grid-cols-5 gap-3 px-4 py-3 bg-slate-50 rounded-2xl mb-2 min-w-[600px]">{['Time','Member','Chapter','Action','Details'].map(h=><p key={h} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</p>)}</div>
          <div className="space-y-1 min-w-[600px]">
            {filtered.length===0?<p className="text-slate-400 font-bold text-sm text-center py-8">No matching entries.</p>:filtered.map((l,i)=>(
              <div key={l.id??i} className="grid grid-cols-5 gap-3 px-4 py-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                <div><p className="text-[10px] font-black text-slate-800">{new Date(l.created_at).toLocaleDateString()}</p><p className="text-[9px] text-slate-400 font-bold">{new Date(l.created_at).toLocaleTimeString()}</p></div>
                <p className="text-xs font-black text-slate-800 truncate self-center">{l.member_name??'—'}</p>
                <p className="text-xs font-bold text-slate-500 truncate self-center">{l.chapter??'—'}</p>
                <p className="text-xs font-bold text-red-600 truncate self-center">{l.action??'—'}</p>
                <p className="text-xs font-bold text-slate-500 truncate self-center">{l.details??'—'}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: INVESTMENTS
// ─────────────────────────────────────────────────────────────────────────────
const INVEST_TIERS = [
  { name:'Platinum', minLRD:5000, points:5, color:'text-purple-700', bg:'bg-purple-50', border:'border-purple-200', pill:'bg-purple-600' },
  { name:'Gold',     minLRD:2000, points:3, color:'text-amber-700',  bg:'bg-amber-50',  border:'border-amber-200',  pill:'bg-amber-500'  },
  { name:'Silver',   minLRD:500,  points:2, color:'text-slate-600',  bg:'bg-slate-50',  border:'border-slate-200',  pill:'bg-slate-500'  },
  { name:'Bronze',   minLRD:0,    points:1, color:'text-orange-700', bg:'bg-orange-50', border:'border-orange-200', pill:'bg-orange-500' },
];
function getInvestTier(totalLRD:number){return INVEST_TIERS.find(t=>totalLRD>=t.minLRD)??INVEST_TIERS[INVEST_TIERS.length-1];}
function isActiveDuesPayer(lastDate:string|null):boolean{if(!lastDate)return false;return(Date.now()-new Date(lastDate).getTime())/86400000<=90;}

function InvestmentsTab({ showToast, isHeadAdmin, members, config }: {
  showToast:(m:string,ok?:boolean)=>void; isHeadAdmin:boolean; members:Member[]; config:ElectionConfig;
}) {
  const [investments, setInvestments] = useState<any[]>([]);
  const [memberStats, setMemberStats] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [distributing, setDistributing] = useState<string|null>(null);
  const [showPreview, setShowPreview]   = useState<string|null>(null);
  const [previewRows, setPreviewRows]   = useState<any[]>([]);
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState('Stock Market');
  const [description, setDesc]  = useState('');
  const [amount, setAmount]     = useState('');
  const [returnAmount, setReturn] = useState('');
  const [returnDate, setRetDate]  = useState('');
  const CATEGORIES = ['Stock Market','Transportation','Entertainment','Real Estate','Other'];

  useEffect(()=>{
    supabase.from('investments').select('*').order('created_at',{ascending:false}).then(({data})=>{if(data)setInvestments(data);});
    (async()=>{
      const approvedMembers=members.filter(m=>m.status==='approved');
      const stats=await Promise.all(approvedMembers.map(async(m)=>{
        const{data:dues}=await supabase.from('dues_payments').select('amount,currency,created_at').eq('member_id',m.id).eq('status','approved').order('created_at',{ascending:false});
        const totalLRD=(dues??[]).reduce((s:number,d:any)=>s+(d.currency==='LRD'?d.amount:d.amount*190),0);
        const lastDate=dues&&dues.length>0?dues[0].created_at:null;
        const tier=getInvestTier(totalLRD);const active=isActiveDuesPayer(lastDate);
        return{...m,totalLRD,tier,active,lastDate};
      }));
      setMemberStats(stats);setLoading(false);
    })();
  },[members]);

  async function buildPreview(inv:any,retAmt:number){
    const eligible=memberStats.filter(m=>m.active&&m.status==='approved');
    const pool70=retAmt*0.70;const totalPts=eligible.reduce((s:number,m:any)=>s+m.tier.points,0);const perPoint=totalPts>0?pool70/totalPts:0;
    const rows=eligible.map((m:any)=>({id:m.id,name:m.full_name,chapter:m.chapter,tier:m.tier.name,points:m.tier.points,share:perPoint*m.tier.points,totalLRD:m.totalLRD})).sort((a:any,b:any)=>b.share-a.share);
    setPreviewRows(rows);setShowPreview(inv.id);
  }

  async function recordInvestment(){
    if(!title.trim()||!amount){showToast('Title and amount required.',false);return;}
    setSaving(true);
    const{data,error}=await supabase.from('investments').insert([{title:title.trim(),category,description:description.trim()||null,invested_amount:parseFloat(amount),currency:'USD',return_amount:returnAmount?parseFloat(returnAmount):null,return_date:returnDate||null,status:'active',created_by:'admin'}]).select().single();
    setSaving(false);
    if(error){showToast(`Failed: ${error.message}`,false);return;}
    setInvestments(prev=>[data,...prev]);setTitle('');setAmount('');setDesc('');setReturn('');setRetDate('');
    showToast(`✓ "${data.title}" recorded.`);
  }

  async function distributeWeighted(inv:any){
    if(!inv.return_amount){showToast('Save the return amount first.',false);return;}
    const eligible=memberStats.filter(m=>m.active&&m.status==='approved');
    if(eligible.length===0){showToast('No active eligible members.',false);return;}
    const pool70=inv.return_amount*0.70;const reserve=inv.return_amount*0.30;
    const totalPts=eligible.reduce((s:number,m:any)=>s+m.tier.points,0);const perPoint=pool70/totalPts;
    if(!confirm(`Distribute returns for "${inv.title}"?\n\nTotal: $${inv.return_amount.toLocaleString()}\nMember pool (70%): $${pool70.toFixed(2)}\nChapter reserve (30%): $${reserve.toFixed(2)}\nEligible members: ${eligible.length}\n\nCannot be undone.`))return;
    setDistributing(inv.id);const now=new Date().toISOString();
    const returnRows=eligible.map((m:any)=>({investment_id:inv.id,member_id:m.id,member_name:m.full_name,tier:m.tier.name,points:m.tier.points,share_amount:perPoint*m.tier.points,currency:'USD',distributed_at:now}));
    const{error:retErr}=await supabase.from('member_returns').insert(returnRows);
    if(retErr){showToast(`Failed: ${retErr.message}`,false);setDistributing(null);return;}
    await supabase.from('investments').update({status:'returned',distributed_at:now,total_points_used:totalPts,member_count_used:eligible.length}).eq('id',inv.id);
    await supabase.from('activity_log').insert([{member_name:'System',chapter:'All',action:`Investment distributed — ${inv.title}`,details:`$${pool70.toFixed(2)} (70%) across ${eligible.length} members · $${reserve.toFixed(2)} (30%) to reserve`}]);
    setInvestments(prev=>prev.map(i=>i.id===inv.id?{...i,status:'returned',distributed_at:now,total_points_used:totalPts,member_count_used:eligible.length}:i));
    setDistributing(null);setShowPreview(null);
    showToast(`✓ Distributed $${pool70.toFixed(2)} across ${eligible.length} members.`);
  }

  const activeMembers=memberStats.filter(m=>m.active);
  const inactiveMembers=memberStats.filter(m=>!m.active);
  const totalPoints=activeMembers.reduce((s,m)=>s+m.tier.points,0);

  return (
    <div className="space-y-8">
      {showPreview&&previewRows.length>0&&(
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col backdrop-blur-sm overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div><h3 className="font-black text-slate-900 uppercase text-sm">Distribution Preview</h3><p className="text-xs text-slate-400 font-bold">{previewRows.length} active members · {previewRows.reduce((s,r)=>s+r.points,0)} total points</p></div>
            <button onClick={()=>setShowPreview(null)} className="text-slate-400 hover:text-red-600 p-2 rounded-xl"><XCircle size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-4 gap-3 mb-6">{INVEST_TIERS.map(t=>{const count=previewRows.filter(r=>r.tier===t.name).length;return(<div key={t.name} className={`${t.bg} border ${t.border} rounded-2xl p-4 text-center`}><p className={`font-black text-lg ${t.color}`}>{count}</p><p className={`text-xs font-black ${t.color} uppercase`}>{t.name}</p><p className="text-slate-500 text-[10px] font-bold">{t.points}pt each</p></div>);})}</div>
            <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200">
              <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest"><span className="col-span-2">Member</span><span>Tier</span><span>Points</span><span className="text-right">Share</span></div>
              {previewRows.map((r,i)=>{const tier=INVEST_TIERS.find(t=>t.name===r.tier)??INVEST_TIERS[INVEST_TIERS.length-1];return(<div key={r.id} className={`grid grid-cols-5 gap-2 px-4 py-3 ${i<previewRows.length-1?'border-b border-slate-100':''} hover:bg-white transition-all`}><div className="col-span-2"><p className="font-black text-slate-800 text-sm truncate">{r.name}</p><p className="text-[10px] text-slate-400 font-bold">{r.chapter}</p></div><span className={`text-xs font-black ${tier.color} self-center`}>{r.tier}</span><span className="text-xs font-black text-slate-600 self-center">{r.points}pt</span><span className="text-sm font-black text-green-700 text-right self-center">${r.share.toFixed(2)}</span></div>);})}
            </div>
          </div>
          <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
            <div className="text-sm font-bold text-slate-600">Total: <strong className="text-green-700">${previewRows.reduce((s,r)=>s+r.share,0).toFixed(2)}</strong></div>
            <div className="flex gap-3">
              <button onClick={()=>setShowPreview(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all">Cancel</button>
              <button onClick={()=>{const inv=investments.find(i=>i.id===showPreview);if(inv)distributeWeighted(inv);}} disabled={!!distributing} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-8 py-3 rounded-2xl text-sm transition-all disabled:opacity-50">{distributing?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>} Confirm & Distribute</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div><h2 className="text-3xl font-black uppercase italic text-slate-800">Chapter Growth Fund</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">70% weighted to members · 30% chapter reserve · Tier-based</p></div>
        <Link href="/investments" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all"><TrendingUp size={14}/> Member View</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card><SectionTitle>Active Members ({activeMembers.length}) — Eligible</SectionTitle><p className="text-xs text-slate-400 font-bold mb-4">Paid dues within last 90 days · Pool weight: <strong className="text-slate-700">{totalPoints} points</strong></p>
          {loading?<div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-400" size={24}/></div>:(
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {activeMembers.map((m:any)=>(
                <div key={m.id} className={`flex items-center justify-between p-3 rounded-2xl ${m.tier.bg} border ${m.tier.border}`}>
                  <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-200 shrink-0">{m.photo_url?<img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>:<div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-xs">{m.full_name.charAt(0)}</span></div>}</div><div><p className="font-black text-slate-800 text-sm">{m.full_name}</p><p className="text-[10px] text-slate-500 font-bold">{m.totalLRD.toLocaleString()} LRD</p></div></div>
                  <div className="text-right"><span className={`${m.tier.pill} text-white text-[10px] font-black uppercase px-2 py-1 rounded-lg`}>{m.tier.name}</span><p className={`text-[10px] font-black ${m.tier.color} mt-0.5`}>{m.tier.points}pt</p></div>
                </div>
              ))}
              {activeMembers.length===0&&<p className="text-slate-400 text-sm font-bold text-center py-4">No active members found.</p>}
            </div>
          )}
        </Card>
        <Card><SectionTitle>Paused Members ({inactiveMembers.length})</SectionTitle><p className="text-xs text-slate-400 font-bold mb-4">No approved dues in 90+ days — excluded from distributions</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {inactiveMembers.map((m:any)=>(<div key={m.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 opacity-60"><div><p className="font-black text-slate-800 text-sm">{m.full_name}</p><p className="text-[10px] text-slate-400 font-bold">Last dues: {m.lastDate?new Date(m.lastDate).toLocaleDateString():'Never'}</p></div><span className="bg-slate-400 text-white text-[10px] font-black uppercase px-2 py-1 rounded-lg">Paused</span></div>))}
            {inactiveMembers.length===0&&<p className="text-green-600 text-sm font-bold text-center py-4">✓ All members active!</p>}
          </div>
        </Card>
      </div>

      <Card accent="green">
        <SectionTitle>Record New Investment</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="md:col-span-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Title *</label><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Tech Stock Portfolio Q2..." className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label><select value={category} onChange={e=>setCategory(e.target.value)} className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none">{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Capital Invested (USD) *</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Return Amount (when received)</label><input type="number" value={returnAmount} onChange={e=>setReturn(e.target.value)} placeholder="0.00" className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Expected Return Date</label><input type="date" value={returnDate} onChange={e=>setRetDate(e.target.value)} className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/></div>
          <div className="md:col-span-2"><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description</label><textarea value={description} onChange={e=>setDesc(e.target.value)} rows={2} placeholder="Brief description..." className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none resize-none"/></div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
          <p className="text-green-800 font-black text-xs uppercase tracking-widest">Distribution Formula</p>
          <p className="text-green-700 text-xs font-bold mt-1 leading-relaxed">70% of return ÷ total weight points × each member's tier points. Currently <strong>{totalPoints} total points</strong> across <strong>{activeMembers.length} active members</strong>.{totalPoints>0&&returnAmount&&(<span> Pool: <strong>${(parseFloat(returnAmount)*0.7).toFixed(2)}</strong> · Per point: <strong>${(parseFloat(returnAmount)*0.7/totalPoints).toFixed(2)}</strong></span>)}</p>
        </div>
        <button onClick={recordInvestment} disabled={saving} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all disabled:opacity-50">{saving?<Loader2 size={16} className="animate-spin"/>:<TrendingUp size={16}/>} Record Investment</button>
      </Card>

      <Card>
        <SectionTitle>Portfolio ({investments.length})</SectionTitle>
        {loading?<div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={28}/></div>:investments.length===0?<p className="text-slate-400 font-bold text-sm text-center py-8">No investments recorded yet.</p>:investments.map(inv=>(
          <div key={inv.id} className="border-2 border-slate-100 rounded-2xl mb-3 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className={`text-[10px] font-black text-white uppercase px-2.5 py-1 rounded-lg shrink-0 ${inv.category==='Stock Market'?'bg-blue-600':inv.category==='Transportation'?'bg-amber-600':inv.category==='Entertainment'?'bg-purple-600':inv.category==='Real Estate'?'bg-green-600':'bg-slate-600'}`}>{inv.category}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 uppercase">{inv.title}</p>
                  {inv.description&&<p className="text-xs text-slate-500 font-bold">{inv.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs font-bold text-slate-500">
                    <span>Invested: <strong className="text-slate-800">${inv.invested_amount.toLocaleString()}</strong></span>
                    {inv.return_amount&&<span>Return: <strong className="text-green-700">${inv.return_amount.toLocaleString()}</strong></span>}
                    {inv.return_amount&&inv.invested_amount&&<span className="text-green-600">+{((inv.return_amount-inv.invested_amount)/inv.invested_amount*100).toFixed(1)}% ROI</span>}
                    {inv.member_count_used&&<span>{inv.member_count_used} members · {inv.total_points_used} pts</span>}
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border shrink-0 ${inv.status==='returned'?'bg-green-50 text-green-700 border-green-200':inv.status==='active'?'bg-blue-50 text-blue-700 border-blue-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{inv.status}</span>
              </div>
              {inv.status!=='returned'&&(
                <div className="flex gap-2 flex-wrap pt-3 border-t border-slate-100">
                  <div className="flex gap-2 flex-1 min-w-0">
                    <input type="number" id={`ret-${inv.id}`} defaultValue={inv.return_amount??''} placeholder="Actual return amount..." className="flex-1 border-2 border-slate-200 focus:border-green-600 rounded-2xl px-4 py-2.5 font-bold outline-none text-sm"/>
                    <button onClick={async()=>{const el=document.getElementById(`ret-${inv.id}`) as HTMLInputElement;if(!el?.value){showToast('Enter return amount.',false);return;}const{error}=await supabase.from('investments').update({return_amount:parseFloat(el.value)}).eq('id',inv.id);if(error){showToast(`Failed: ${error.message}`,false);return;}setInvestments(prev=>prev.map(i=>i.id===inv.id?{...i,return_amount:parseFloat(el.value)}:i));showToast('Return saved.');}} className="bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs px-4 py-2.5 rounded-2xl shrink-0">Save</button>
                  </div>
                  <button onClick={()=>{const el=document.getElementById(`ret-${inv.id}`) as HTMLInputElement;const retAmt=parseFloat(el?.value??'')||inv.return_amount;if(!retAmt){showToast('Save return amount first.',false);return;}buildPreview({...inv,return_amount:retAmt},retAmt);}} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs px-4 py-2.5 rounded-2xl shrink-0">Preview Split</button>
                  <button onClick={()=>{const el=document.getElementById(`ret-${inv.id}`) as HTMLInputElement;const retAmt=parseFloat(el?.value??'')||inv.return_amount;if(!retAmt){showToast('Save return amount first.',false);return;}distributeWeighted({...inv,return_amount:retAmt});}} disabled={!inv.return_amount||distributing===inv.id} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs px-4 py-2.5 rounded-2xl shrink-0 disabled:opacity-50">{distributing===inv.id?<Loader2 size={12} className="animate-spin"/>:<CheckCircle2 size={12}/>} Distribute 70/30</button>
                </div>
              )}
              {inv.status==='returned'&&inv.distributed_at&&<div className="mt-3 pt-3 border-t border-slate-100"><p className="text-xs text-green-600 font-bold">✓ Distributed {new Date(inv.distributed_at).toLocaleDateString()} · {inv.member_count_used} members · {inv.total_points_used} pts</p></div>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
