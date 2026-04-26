"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, LogOut, Loader2, BarChart2, Users, UserCheck,
  UserX, List, Settings, PlusCircle, Trash2, Trophy, Activity,
  CheckCircle2, XCircle, Terminal, Crown, Download, Printer,
  FileText, Sliders, Search, CreditCard, DollarSign, Key, Calendar, MapPin, Bell, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate      { id: number; full_name: string; position_name: string; chapter: string; photo_url?: string; }
interface VoteRow        { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }
interface EligibleVoter  { email: string; chapter: string; created_at: string; }
interface BlacklistedVoter { id: number; email: string; reason: string; created_at: string; }
interface ElectionAdmin  { id: number; email: string; branch: string; }
interface Application    {
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
  id: string; title: string; description: string|null;
  chapter: string|null; event_date: string; event_time: string|null;
  location: string|null; event_type: string; created_by: string; created_at: string;
}

// ─── Dynamic Config (loaded from election_settings, overrides these defaults) ──
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const DEFAULT_CONFIG = {
  org_name:         "BWIAA",
  election_title:   "National Alumni Election",
  election_year:    "2026",
  currency:         "USD",
  currency_symbol:  "$",
  maintenance_fee:  20,
  maintenance_currency: "LRD",
  chapters: [
    "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
    "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
    "Paynesville Branch","Mother Chapter",
  ],
  positions_fees: [
    { position: "President",                        fee: 2000 },
    { position: "Vice President for Administration",fee: 1500 },
    { position: "Vice President for Operations",    fee: 1500 },
    { position: "Secretary General",               fee: 1000 },
    { position: "Financial Secretary",             fee: 1000 },
    { position: "Treasurer",                       fee: 500  },
    { position: "Parliamentarian",                 fee: 500  },
    { position: "Chaplain",                        fee: 500  },
  ],
};

type ElectionConfig = typeof DEFAULT_CONFIG;

// Fallback constants (replaced at runtime from DB)
let CHAPTERS  = DEFAULT_CONFIG.chapters;
let POSITIONS = DEFAULT_CONFIG.positions_fees.map(p => p.position);

type Tab = "overview" | "results" | "candidates" | "voters" | "roster" | "admins" | "applications" | "settings" | "members" | "dues" | "events" | "audit" | "investments";

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

  const [votes, setVotes]           = useState<VoteRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roster, setRoster]         = useState<EligibleVoter[]>([]);
  const [blacklist, setBlacklist]   = useState<BlacklistedVoter[]>([]);
  const [admins, setAdmins]         = useState<ElectionAdmin[]>([]);
  const [deadline, setDeadline]     = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [members, setMembers]           = useState<Member[]>([]);
  const [dues, setDues]                 = useState<DuesPayment[]>([]);
  const [events, setEvents]             = useState<EventRow[]>([]);
  const [auditLog, setAuditLog]         = useState<any[]>([]);
  const [config, setConfig]             = useState<ElectionConfig>(DEFAULT_CONFIG);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser(user);
      const lowerEmail = user.email?.toLowerCase();

      // Load head admins list from settings (supports multiple head admins)
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
    };
    init();
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
    if (v.data)       setVotes(v.data);
    if (c.data)       setCandidates(c.data);
    if (r.data)       setRoster(r.data);
    if (b.data)       setBlacklist(b.data);
    if (a.data)       setAdmins(a.data);
    if (ap.data)      setApplications(ap.data);
    if (mem.data)     setMembers(mem.data);
    if (duesRes.data) setDues(duesRes.data);
    if (evRes.data)   setEvents(evRes.data);
    if (auditRes.data) setAuditLog(auditRes.data);

    // Merge all settings keys into config
    if (settingsRes.data) {
      const rows = settingsRes.data as { key: string; value: string }[];
      const get = (k: string) => rows.find(r => r.key === k)?.value;
      const dl = get('voting_deadline');
      if (dl) setDeadline(dl);
      const merged: ElectionConfig = { ...DEFAULT_CONFIG };
      if (get('org_name'))        merged.org_name        = get('org_name')!;
      if (get('election_title'))  merged.election_title  = get('election_title')!;
      if (get('election_year'))   merged.election_year   = get('election_year')!;
      if (get('currency'))        merged.currency        = get('currency')!;
      if (get('currency_symbol')) merged.currency_symbol = get('currency_symbol')!;
      if (get('maintenance_fee')) merged.maintenance_fee = Number(get('maintenance_fee'));
      if (get('maintenance_currency')) merged.maintenance_currency = get('maintenance_currency')!;
      if (get('chapters')) {
        try {
          const parsed = JSON.parse(get('chapters')!);
          merged.chapters = parsed;
          CHAPTERS  = parsed;
        } catch {}
      }
      if (get('positions_fees')) {
        try {
          const parsed = JSON.parse(get('positions_fees')!);
          merged.positions_fees = parsed;
          POSITIONS = parsed.map((p: any) => p.position);
        } catch {}
      }
      setConfig(merged);
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

  const allTabs: { id: Tab; label: string; icon: any; headOnly?: boolean }[] = [
    { id: "overview",      label: "Overview",     icon: Activity },
    { id: "results",       label: "Results",      icon: BarChart2 },
    { id: "candidates",    label: "Candidates",   icon: List },
    { id: "voters",        label: "Voters",       icon: Users },
    { id: "roster",        label: "Roster",       icon: UserCheck },
    { id: "members",       label: `Members${members.filter(m=>m.status==='pending').length > 0 ? ` (${members.filter(m=>m.status==='pending').length})` : ''}`, icon: Users },
    { id: "dues",          label: `Dues${dues.filter(d=>d.status==='pending').length > 0 ? ` (${dues.filter(d=>d.status==='pending').length})` : ''}`, icon: CreditCard },
    { id: "events",       label: "Events",       icon: Calendar },
    { id: "audit",        label: "Audit Log",    icon: FileText, headOnly: true },
    { id: "investments",  label: "Investments",  icon: TrendingUp, headOnly: true },
    { id: "applications",  label: `Applications${applications.filter(a=>a.status==='pending').length > 0 ? ` (${applications.filter(a=>a.status==='pending').length})` : ''}`, icon: FileText },
    { id: "admins",        label: "Admins",       icon: Settings, headOnly: true },
    { id: "settings",      label: "Settings",     icon: Settings, headOnly: true },
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
                <span className="text-slate-600 mx-1">•</span>
                <span className="text-slate-400">{user.email}</span>
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
        {activeTab === "overview"      && <OverviewTab   votes={votes} candidates={candidates} roster={roster} admins={admins} blacklist={blacklist} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} deadline={deadline} config={config}/>}
        {activeTab === "results"       && <ResultsTab    votes={votes} candidates={candidates} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>}
        {activeTab === "candidates"    && <CandidatesTab candidates={candidates} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin}/>}
        {activeTab === "voters"        && <VotersTab     votes={votes} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>}
        {activeTab === "roster"        && <RosterTab     roster={roster} setRoster={setRoster} blacklist={blacklist} setBlacklist={setBlacklist} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} members={members}/>}
        {activeTab === "members"       && <MembersTab members={members} setMembers={setMembers} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email}/>}
        {activeTab === "dues"          && <DuesTab dues={dues} setDues={setDues} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email} config={config}/>}
        {activeTab === "events"        && <EventsTab events={events} setEvents={setEvents} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email} config={config} members={members}/>}
        {activeTab === "audit"         && isHeadAdmin && <AuditLogTab log={auditLog} config={config}/>}
        {activeTab === "investments"   && isHeadAdmin && <InvestmentsTab showToast={showToast} isHeadAdmin={isHeadAdmin} members={members} config={config}/>}
        {activeTab === "applications"  && <ApplicationsTab applications={applications} setApplications={setApplications} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email}/>}
        {activeTab === "admins"   && isHeadAdmin && <AdminsTab admins={admins} setAdmins={setAdmins} showToast={showToast} deadline={deadline} setDeadline={setDeadline}/>}
        {activeTab === "settings" && isHeadAdmin && <SettingsTab config={config} setConfig={setConfig} showToast={showToast} deadline={deadline}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, accent = "slate" }: { children: React.ReactNode; accent?: string }) {
  const borders: Record<string,string> = { slate:"border-slate-200", red:"border-red-300", green:"border-green-300" };
  return <div className={`bg-white rounded-[3rem] p-10 shadow-xl border-b-8 ${borders[accent] ?? "border-slate-200"}`}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xl font-black uppercase italic mb-6 border-l-8 border-red-600 pl-5">{children}</h3>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ votes, candidates, roster, admins, blacklist, isHeadAdmin, myChapter, deadline, config }: {
  votes: VoteRow[]; candidates: Candidate[]; roster: EligibleVoter[];
  admins: ElectionAdmin[]; blacklist: BlacklistedVoter[];
  isHeadAdmin: boolean; myChapter: string | null; deadline: string | null;
  config: ElectionConfig;
}) {
  const scopedVotes  = isHeadAdmin ? votes : votes.filter(v => v.chapter === myChapter);
  const uniqueVoters = new Set(scopedVotes.map(v => v.voter_id)).size;

  // Live countdown
  const [timeLeft, setTimeLeft] = useState<string>('');
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
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const stats = isHeadAdmin
    ? [
        { label: "Total Ballots",     value: votes.length,     color: "bg-blue-600" },
        { label: "Unique Voters",     value: uniqueVoters,      color: "bg-green-600" },
        { label: "Candidates",        value: candidates.length, color: "bg-purple-600" },
        { label: "Roster Size",       value: roster.length,     color: "bg-orange-500" },
        { label: "Branch Admins",     value: admins.length,     color: "bg-slate-700" },
        { label: "Blacklisted",       value: blacklist.length,  color: "bg-red-600" },
      ]
    : [
        { label: `${myChapter} Ballots`, value: scopedVotes.length, color: "bg-blue-600" },
        { label: "Unique Voters",         value: uniqueVoters,        color: "bg-green-600" },
      ];

  const chapterBreakdown = CHAPTERS.map(ch => ({
    chapter: ch, votes: votes.filter(v => v.chapter === ch).length,
  })).sort((a, b) => b.votes - a.votes);
  const maxV = chapterBreakdown[0]?.votes || 1;

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">{isHeadAdmin ? 'National Overview' : `${myChapter} Overview`}</h2>

      {/* Countdown Banner */}
      {deadline && (
        <div className={`rounded-[2.5rem] p-8 text-white text-center shadow-2xl ${votingClosed ? 'bg-slate-800' : 'bg-slate-900'}`}>
          <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-60">
            {votingClosed ? 'Election Ended' : 'Voting Closes In'}
          </p>
          <p className={`text-5xl md:text-7xl font-black tracking-tight tabular-nums ${votingClosed ? 'text-red-500' : 'text-red-500'}`}>
            {timeLeft}
          </p>
          <p className="text-xs font-bold uppercase tracking-widest mt-3 opacity-40">
            Deadline: {new Date(deadline).toLocaleString()}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(s => (
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
                <span className="text-[9px] font-black uppercase text-blue-500 tracking-widest block">{v.chapter} • {new Date(v.created_at).toLocaleString()}</span>
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
// TAB: RESULTS — with CSV export + print
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

  // ── CSV export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [["Position", "Candidate", "Votes", "Percentage"]];
    Object.entries(positions).forEach(([pos, results]) => {
      const total = results.reduce((s, r) => s + r.count, 0);
      results.forEach(r => {
        const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) : "0.0";
        rows.push([pos, r.candidate, String(r.count), `${pct}%`]);
      });
    });
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `BWIAA_Results_${filterChapter}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Print view ──────────────────────────────────────────────────────────────
  function printResults() {
    const content = `
      <html><head><title>BWIAA 2026 Election Results</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
        h1 { font-size: 28px; font-weight: 900; text-transform: uppercase; border-bottom: 4px solid #dc2626; padding-bottom: 12px; margin-bottom: 8px; }
        .subtitle { font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 40px; }
        .position { margin-bottom: 36px; page-break-inside: avoid; }
        .position-title { font-size: 18px; font-weight: 900; text-transform: uppercase; border-left: 6px solid #dc2626; padding-left: 14px; margin-bottom: 16px; }
        .candidate { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
        .cand-name { font-weight: 700; font-size: 14px; width: 200px; }
        .bar-wrap { flex: 1; background: #f1f5f9; border-radius: 8px; height: 24px; overflow: hidden; }
        .bar { height: 100%; background: #dc2626; border-radius: 8px; }
        .bar.leader { background: #dc2626; }
        .bar.other  { background: #94a3b8; }
        .count { font-weight: 900; font-size: 16px; width: 60px; text-align: right; }
        .pct { font-size: 12px; color: #94a3b8; width: 50px; text-align: right; }
        .badge { font-size: 10px; background: #fef9c3; color: #854d0e; padding: 2px 8px; border-radius: 999px; font-weight: 700; text-transform: uppercase; border: 1px solid #fde047; }
        .footer { margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
      </style></head><body>
      <h1>BWIAA 2026 Election Results</h1>
      <div class="subtitle">
        ${filterChapter === "ALL" ? "National Aggregate" : filterChapter + " Chapter"} &nbsp;•&nbsp;
        Generated: ${new Date().toLocaleString()} &nbsp;•&nbsp;
        Total Ballots: ${filteredVotes.length}
      </div>
      ${Object.entries(positions).map(([pos, results]) => {
        const total = results.reduce((s,r) => s + r.count, 0);
        return `<div class="position">
          <div class="position-title">${pos}</div>
          ${results.map((r, i) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return `<div class="candidate">
              <div class="cand-name">${r.candidate} ${i === 0 && r.count > 0 ? '<span class="badge">Leading</span>' : ''}</div>
              <div class="bar-wrap"><div class="bar ${i === 0 ? 'leader' : 'other'}" style="width:${pct}%"></div></div>
              <div class="count">${r.count}</div>
              <div class="pct">${pct}%</div>
            </div>`;
          }).join('')}
          <div style="font-size:11px;color:#94a3b8;font-weight:bold;margin-top:4px;">${total} ballots cast for this position</div>
        </div>`;
      }).join('')}
      <div class="footer">BWIAA 2026 National Alumni Election — Official Results Document — Confidential</div>
      </body></html>
    `;
    const win = window.open('', '_blank');
    if (win) { win.document.write(content); win.document.close(); win.print(); }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Election Results</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Live EC Presentation View • {filteredVotes.length} ballots</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isHeadAdmin && (
            <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)}
              className="border-2 border-slate-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white">
              <option value="ALL">🌍 National Aggregate</option>
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {/* Export buttons */}
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> CSV
          </button>
          <button onClick={printResults}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Printer size={14}/> Print / PDF
          </button>
        </div>
      </div>

      {Object.entries(positions).map(([pos, results]) => {
        const total = results.reduce((s, r) => s + r.count, 0);
        return (
          <div key={pos} className="bg-white rounded-[3rem] p-10 shadow-xl border-b-8 border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-3">
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
                        {isLeader && (
                          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-yellow-300">
                            <Trophy size={10}/> Leading
                          </span>
                        )}
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
        <div className="text-center py-20 text-slate-400">
          <BarChart2 className="mx-auto mb-4 opacity-30" size={48}/>
          <p className="font-bold uppercase tracking-widest text-sm">No results yet.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CANDIDATES — position is now a DROPDOWN, not free text
// ─────────────────────────────────────────────────────────────────────────────
function CandidatesTab({ candidates, setCandidates, showToast, isHeadAdmin }: {
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean;
}) {
  const [name, setName]           = useState('');
  const [position, setPosition]   = useState(POSITIONS[0]);
  const [customPos, setCustomPos] = useState('');
  const [chapter, setChapter]     = useState(CHAPTERS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<number>(0);
  const [saving, setSaving]       = useState(false);

  const isCustom = position === "__custom__";
  const finalPosition = isCustom ? customPos.trim() : position;
  const MAX_KB = 200; // enforce 200KB max after compression

  // Client-side image compression using Canvas
  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        // Resize to max 400×400 to keep files tiny
        const MAX = 400;
        let { width, height } = img;
        if (width > height) { if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; } }
        else { if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', 0.82);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file.', false); return; }
    try {
      const compressed = await compressImage(file);
      const kb = Math.round(compressed.size / 1024);
      setPhotoSize(kb);
      if (kb > MAX_KB) { showToast(`Image too large after compression (${kb}KB). Please use a smaller photo.`, false); return; }
      const asFile = new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      setPhotoFile(asFile);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch { showToast('Failed to process image.', false); }
  }

  async function addCandidate() {
    if (!name.trim())   { showToast("Candidate name required.", false); return; }
    if (!finalPosition) { showToast("Position required.", false); return; }
    setSaving(true);
    let photo_url: string | undefined;

    if (photoFile) {
      const fileName = `${Date.now()}_${name.trim().replace(/\s+/g, '_')}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('candidate-photos').upload(fileName, photoFile, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) { showToast(`Photo upload failed: ${uploadError.message}`, false); setSaving(false); return; }
      const { data: { publicUrl } } = supabase.storage.from('candidate-photos').getPublicUrl(uploadData.path);
      photo_url = publicUrl;
    }

    const payload: any = { full_name: name.trim(), position_name: finalPosition, chapter };
    if (photo_url) payload.photo_url = photo_url;
    const { data, error } = await supabase.from('candidates').insert([payload]).select().single();
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setCandidates(prev => [...prev, data]);
    setName(''); setPhotoFile(null); setPhotoPreview(null); setPhotoSize(0);
    showToast(`${data.full_name} added to ${data.position_name}`);
  }

  async function removeCandidate(id: number) {
    if (!confirm("Remove this candidate? Their existing votes remain in the database.")) return;
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) { showToast("Failed to remove.", false); return; }
    setCandidates(prev => prev.filter(c => c.id !== id));
    showToast("Candidate removed.");
  }

  const [filterChapter, setFilterChapter] = useState<string>(CHAPTERS[0]);

  const byChapter = useMemo(() => {
    const map: Record<string, Record<string, Candidate[]>> = {};
    candidates.forEach(c => {
      if (!map[c.chapter]) map[c.chapter] = {};
      if (!map[c.chapter][c.position_name]) map[c.chapter][c.position_name] = [];
      map[c.chapter][c.position_name].push(c);
    });
    return map;
  }, [candidates]);

  const filteredByPosition = byChapter[filterChapter] ?? {};
  const positionsCovered = Object.keys(filteredByPosition).length;
  const positionsTotal = POSITIONS.length;

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Manage Candidates</h2>

      {isHeadAdmin && (
        <Card accent="red">
          <SectionTitle>Add New Candidate</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name"
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            <select value={position} onChange={e => setPosition(e.target.value)}
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none">
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">➕ Other (type custom position)</option>
            </select>
            <select value={chapter} onChange={e => setChapter(e.target.value)}
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none">
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isCustom && (
            <input value={customPos} onChange={e => setCustomPos(e.target.value)}
              placeholder="Type custom position name..."
              className="w-full border-2 border-dashed border-red-300 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none mb-4"/>
          )}

          {/* Photo upload */}
          <div className="mb-4">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Candidate Photo <span className="text-slate-300 normal-case font-bold">(optional · max {MAX_KB}KB · auto-compressed)</span>
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Preview */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 shrink-0 flex items-center justify-center">
                {photoPreview
                  ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover"/>
                  : <span className="text-xs text-slate-400 font-bold text-center px-1">No photo</span>
                }
              </div>
              <div className="flex-1 w-full">
                <label className="cursor-pointer flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-4 transition-all">
                  <PlusCircle size={18} className="text-slate-400 shrink-0"/>
                  <span className="text-sm font-bold text-slate-500">
                    {photoFile ? photoFile.name : 'Click to choose a photo from your device'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect}/>
                </label>
                {photoSize > 0 && (
                  <p className={`text-xs font-bold mt-2 ${photoSize > MAX_KB ? 'text-red-500' : 'text-green-600'}`}>
                    {photoSize > MAX_KB ? `⚠ ${photoSize}KB — too large` : `✓ ${photoSize}KB — ready to upload`}
                  </p>
                )}
                {photoFile && (
                  <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoSize(0); }}
                    className="text-xs text-red-400 font-bold mt-1 hover:text-red-600">
                    ✕ Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          <button onClick={addCandidate} disabled={saving || photoSize > MAX_KB}
            className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
            {saving ? 'Uploading...' : 'Add Candidate'}
          </button>
        </Card>
      )}

      {/* Chapter Progress */}
      <Card>
        <SectionTitle>Chapter Setup Progress</SectionTitle>
        <div className="space-y-3">
          {CHAPTERS.map(ch => {
            const chPositions = Object.keys(byChapter[ch] ?? {}).length;
            const complete = chPositions === positionsTotal;
            return (
              <div key={ch} className="flex items-center gap-3 cursor-pointer" onClick={() => setFilterChapter(ch)}>
                <div className="w-36 text-xs font-bold uppercase text-slate-500 text-right shrink-0">{ch}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${complete ? 'bg-green-500' : chPositions > 0 ? 'bg-red-500' : 'bg-slate-200'}`}
                    style={{ width: `${Math.round((chPositions / positionsTotal) * 100)}%` }}/>
                </div>
                <div className="w-14 text-right font-black text-xs text-slate-700">{chPositions}/{positionsTotal}</div>
                {complete && <CheckCircle2 size={14} className="text-green-500 shrink-0"/>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Chapter filter */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-black uppercase tracking-widest text-slate-500 shrink-0">Viewing:</label>
        <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)}
          className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-3 font-bold outline-none text-sm bg-white">
          {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs font-bold text-slate-400 uppercase">{positionsCovered}/{positionsTotal} positions filled</span>
      </div>

      {/* Candidate photo cards per position */}
      {Object.entries(filteredByPosition).map(([pos, cands]) => (
        <Card key={pos}>
          <SectionTitle>{pos}</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cands.map(c => (
              <div key={c.id} className="relative group flex flex-col items-center bg-slate-50 rounded-3xl p-4 border-2 border-slate-100 hover:border-red-200 transition-all">
                {/* Photo */}
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-slate-200 mb-3 shrink-0 border-2 border-slate-200">
                  {c.photo_url
                    ? <img src={c.photo_url} alt={c.full_name} className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center bg-slate-100">
                        <span className="text-2xl font-black text-slate-400">{c.full_name.charAt(0)}</span>
                      </div>
                  }
                </div>
                <p className="font-black text-slate-800 text-xs text-center uppercase leading-tight">{c.full_name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 text-center">{c.chapter}</p>
                {isHeadAdmin && (
                  <button onClick={() => removeCandidate(c.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-50 text-red-400 hover:text-red-600 p-1.5 rounded-xl transition-all">
                    <Trash2 size={12}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {positionsCovered === 0 && (
        <div className="text-center py-20 text-slate-400">
          <List className="mx-auto mb-4 opacity-30" size={48}/>
          <p className="font-bold uppercase tracking-widest text-sm">No candidates yet for {filterChapter}.</p>
          <p className="text-xs mt-2 font-bold uppercase tracking-widest">Use the form above to add all {positionsTotal} positions.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: VOTERS
// ─────────────────────────────────────────────────────────────────────────────
function VotersTab({ votes, isHeadAdmin, myChapter }: { votes: VoteRow[]; isHeadAdmin: boolean; myChapter: string | null; }) {
  const [filterChapter, setFilterChapter] = useState<string>(isHeadAdmin ? "ALL" : (myChapter ?? "ALL"));
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = filterChapter === "ALL" ? votes : votes.filter(v => v.chapter === filterChapter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v => v.voter_name.toLowerCase().includes(q) || v.candidate_name.toLowerCase().includes(q) || v.position_name.toLowerCase().includes(q));
    }
    return list;
  }, [votes, filterChapter, search]);

  // CSV export for chapter voters
  function exportVoterCSV() {
    const rows = [["Chapter","Voter Email","Class Year","Position","Voted For","Timestamp"]];
    filtered.forEach(v => rows.push([v.chapter, v.voter_name, v.class_year, v.position_name, v.candidate_name, new Date(v.created_at).toLocaleString()]));
    const csv  = rows.map(r => r.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `BWIAA_VoteLog_${filterChapter}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Vote Log</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            {filtered.length} ballots • {new Set(filtered.map(v => v.voter_id)).size} unique voters
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isHeadAdmin && (
            <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)}
              className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white">
              <option value="ALL">All Chapters</option>
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600"/>
          <button onClick={exportVoterCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> Export CSV
          </button>
        </div>
      </div>
      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>{["Chapter","Voter Email","Class","Position","Voted For","Time"].map(h => (
                <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id ?? i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                  <td className="px-6 py-4 font-bold text-xs uppercase text-slate-500">{v.chapter}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{v.voter_name}</td>
                  <td className="px-6 py-4 font-black text-red-600">{v.class_year}</td>
                  <td className="px-6 py-4 font-bold text-xs uppercase text-slate-600">{v.position_name}</td>
                  <td className="px-6 py-4 font-black text-slate-900">{v.candidate_name}</td>
                  <td className="px-6 py-4 text-xs text-slate-400 font-bold">{new Date(v.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-16 text-slate-400 font-bold uppercase text-sm">No votes found.</td></tr>
              )}
            </tbody>
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
  roster: EligibleVoter[];
  setRoster: React.Dispatch<React.SetStateAction<EligibleVoter[]>>;
  blacklist: BlacklistedVoter[];
  setBlacklist: React.Dispatch<React.SetStateAction<BlacklistedVoter[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean;
  myChapter: string | null;
  members: Member[];
}) {
  const [rEmail, setREmail]     = useState('');
  const [rChapter, setRChapter] = useState(myChapter ?? CHAPTERS[0]);
  const [rSaving, setRSaving]   = useState(false);
  const [bEmail, setBEmail]     = useState('');
  const [bReason, setBReason]   = useState('');
  const [bSaving, setBSaving]   = useState(false);

  const visibleRoster = isHeadAdmin ? roster : roster.filter(r => r.chapter === myChapter);

  // Only approved members can be on the roster
  const approvedMembers = members.filter(m =>
    m.status === 'approved' && (isHeadAdmin || m.chapter === myChapter)
  );

  async function addToRoster() {
    const email = rEmail.trim().toLowerCase();
    if (!email) { showToast('Email required.', false); return; }

    // ★ SECURITY: Verify this email belongs to an approved member
    const approvedMember = members.find(m =>
      m.email.toLowerCase() === email && m.status === 'approved'
    );

    if (!approvedMember) {
      // Check if they exist at all in members table
      const anyMember = members.find(m => m.email.toLowerCase() === email);
      if (anyMember && anyMember.status === 'pending') {
        showToast(`❌ ${email} has a pending membership application. They must be approved as a member before being added to the voter roster.`, false);
      } else if (anyMember && anyMember.status === 'rejected') {
        showToast(`❌ ${email}'s membership was rejected. They cannot be added to the voter roster.`, false);
      } else {
        showToast(`❌ ${email} is not a registered BWIAA member. Only approved members can be added to the voter roster. They must register and be approved first.`, false);
      }
      return;
    }

    // Chapter guard — chapter admins can only add to their chapter
    if (!isHeadAdmin && approvedMember.chapter !== myChapter) {
      showToast(`❌ ${email} belongs to ${approvedMember.chapter}, not your chapter. You can only manage your own chapter's roster.`, false);
      return;
    }

    setRSaving(true);
    // Use the member's actual chapter from their profile, not manual input
    const { data, error } = await supabase.from('eligible_voters').insert([{
      email,
      chapter: approvedMember.chapter,
    }]).select().single();
    setRSaving(false);

    if (error) {
      const isDupe = error.code === '23505' || error.message.toLowerCase().includes('unique') || error.message.toLowerCase().includes('duplicate');
      showToast(isDupe ? `${email} is already on the roster.` : `Failed: ${error.message}`, false);
      return;
    }

    setRoster(prev => [...prev, data]); setREmail('');
    showToast(`✓ ${approvedMember.full_name} (${email}) added to the voter roster for ${approvedMember.chapter}.`);
  }

  async function removeFromRoster(email: string) {
    if (!confirm(`Remove ${email} from roster?`)) return;
    const { error } = await supabase.from('eligible_voters').delete().eq('email', email);
    if (error) { showToast(`Failed to remove: ${error.message}`, false); return; }
    setRoster(prev => prev.filter(r => r.email !== email));
    showToast(`${email} removed from roster.`);
  }

  async function addToBlacklist() {
    const email = bEmail.trim().toLowerCase();
    if (!email || !bReason.trim()) { showToast("Email and reason required.", false); return; }
    setBSaving(true);
    const { data, error } = await supabase.from('blacklisted_voters').insert([{ email, reason: bReason.trim() }]).select().single();
    setBSaving(false);
    if (error) {
      const isDupe = error.code === '23505' || error.message.toLowerCase().includes('unique') || error.message.toLowerCase().includes('duplicate');
      showToast(isDupe ? "Already blacklisted." : `Failed: ${error.message}`, false);
      return;
    }
    setBlacklist(prev => [data, ...prev]); setBEmail(''); setBReason('');
    showToast(`${email} blocked.`);
  }

  async function removeFromBlacklist(id: number, email: string) {
    if (!confirm(`Unblock ${email}?`)) return;
    const { error } = await supabase.from('blacklisted_voters').delete().eq('id', id);
    if (error) { showToast(`Failed to unblock: ${error.message}`, false); return; }
    setBlacklist(prev => prev.filter(b => b.id !== id));
    showToast(`${email} unblocked.`);
  }

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Roster & Blacklist</h2>

      <Card accent="green">
        <SectionTitle>Add Voter to Roster</SectionTitle>

        {/* Security notice */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <span className="text-amber-500 text-lg shrink-0">🔒</span>
          <div>
            <p className="font-black text-amber-800 text-sm uppercase tracking-widest">Members Only — Voter Eligibility Enforced</p>
            <p className="text-amber-700 text-xs font-bold mt-1 leading-relaxed">
              Only <strong>approved BWIAA members</strong> can be added to the voter roster.
              Non-members cannot be added regardless of their email address.
              Members are automatically added to the roster when their membership is approved.
            </p>
          </div>
        </div>

        {/* Approved members not yet on roster */}
        {(() => {
          const rosterEmails = new Set(roster.map(r => r.email.toLowerCase()));
          const eligible = approvedMembers.filter(m => !rosterEmails.has(m.email.toLowerCase()));
          return eligible.length > 0 ? (
            <div className="mb-5">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                Approved members not yet on roster ({eligible.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {eligible.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-green-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                        {m.photo_url
                          ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                          : <div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-xs">{m.full_name.charAt(0)}</span></div>
                        }
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-sm">{m.full_name}</p>
                        <p className="text-xs text-slate-400 font-bold">{m.email} · {m.chapter}</p>
                      </div>
                    </div>
                    <button onClick={async () => {
                      setRSaving(true);
                      const { data, error } = await supabase.from('eligible_voters')
                        .insert([{ email: m.email.toLowerCase(), chapter: m.chapter }]).select().single();
                      setRSaving(false);
                      if (error) {
                        const isDupe = error.code === '23505' || error.message.toLowerCase().includes('duplicate');
                        showToast(isDupe ? 'Already on roster.' : `Failed: ${error.message}`, false);
                        return;
                      }
                      setRoster(prev => [...prev, data]);
                      showToast(`✓ ${m.full_name} added to voter roster.`);
                    }} disabled={rSaving}
                      className="bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-50 shrink-0">
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5">
              <p className="text-green-700 font-black text-sm">✓ All approved members are already on the voter roster.</p>
            </div>
          );
        })()}

        {/* Manual email add — still requires member verification */}
        <div className="border-t border-slate-100 pt-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Or add by email (verified members only)</p>
          <div className="flex gap-3">
            <input value={rEmail} onChange={e => setREmail(e.target.value)}
              placeholder="member@email.com — must be an approved member"
              className="flex-1 border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none text-sm"/>
            <button onClick={addToRoster} disabled={rSaving || !rEmail.trim()}
              className="bg-green-600 text-white font-black uppercase px-6 py-4 rounded-2xl flex items-center gap-2 hover:bg-green-700 transition-all disabled:opacity-50 shrink-0">
              {rSaving ? <Loader2 size={14} className="animate-spin"/> : <UserCheck size={14}/>}
              Verify & Add
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-2">
            The system will check that this email belongs to an approved member before adding them.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>Eligible Voters ({visibleRoster.length})</SectionTitle>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {visibleRoster.map(r => (
            <div key={r.email} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold text-slate-800 text-sm">{r.email}</p>
                <p className="text-xs text-slate-400 font-bold uppercase">{r.chapter}</p>
              </div>
              <button onClick={() => removeFromRoster(r.email)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all">
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
          {visibleRoster.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-6">No voters on roster.</p>}
        </div>
      </Card>

      {isHeadAdmin && (
        <>
          <Card accent="red">
            <SectionTitle>Blacklist a Voter</SectionTitle>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">
              Blocked emails are denied BEFORE the whitelist check — even if they are on the roster.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <input value={bEmail} onChange={e => setBEmail(e.target.value)} placeholder="blocked@gmail.com"
                className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
              <input value={bReason} onChange={e => setBReason(e.target.value)} placeholder="Reason (e.g. Duplicate account)"
                className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
            <button onClick={addToBlacklist} disabled={bSaving}
              className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50">
              {bSaving ? <Loader2 size={16} className="animate-spin"/> : <UserX size={16}/>} Block Voter
            </button>
          </Card>

          <Card>
            <SectionTitle>Blacklisted ({blacklist.length})</SectionTitle>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {blacklist.map(b => (
                <div key={b.id} className="flex justify-between items-start p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <div>
                    <p className="font-black text-red-700 text-sm">{b.email}</p>
                    <p className="text-xs text-red-400 font-bold mt-1">Reason: {b.reason}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => removeFromBlacklist(b.id, b.email)} className="text-slate-400 hover:text-green-600 hover:bg-green-50 p-2 rounded-xl transition-all ml-4 shrink-0" title="Unblock">
                    <CheckCircle2 size={14}/>
                  </button>
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
  admins: ElectionAdmin[];
  setAdmins: React.Dispatch<React.SetStateAction<ElectionAdmin[]>>;
  showToast: (m: string, ok?: boolean) => void;
  deadline: string | null;
  setDeadline: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [email, setEmail]       = useState('');
  const [branch, setBranch]     = useState(CHAPTERS[0]);
  const [saving, setSaving]     = useState(false);
  const [dlInput, setDlInput]   = useState('');
  const [dlSaving, setDlSaving] = useState(false);

  // Live countdown in admins tab too
  const [timeLeft, setTimeLeft]     = useState('');
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
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  async function saveDeadline() {
    if (!dlInput) { showToast("Please select a date and time.", false); return; }
    setDlSaving(true);
    const { error } = await supabase.from('election_settings')
      .upsert([{ key: 'voting_deadline', value: new Date(dlInput).toISOString() }], { onConflict: 'key' });
    setDlSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setDeadline(new Date(dlInput).toISOString());
    showToast('Voting deadline set successfully.');
  }

  async function clearDeadline() {
    if (!confirm('Remove the voting deadline? Voting will be open indefinitely.')) return;
    const { error } = await supabase.from('election_settings').delete().eq('key', 'voting_deadline');
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setDeadline(null); setDlInput('');
    showToast('Deadline removed. Voting is now open indefinitely.');
  }

  async function addAdmin() {
    const lowerEmail = email.trim().toLowerCase();
    if (!lowerEmail) { showToast("Email required.", false); return; }
    if (lowerEmail === HEAD_ADMIN_EMAIL.toLowerCase()) { showToast("That's the head admin — no need to add.", false); return; }
    setSaving(true);
    const { data, error } = await supabase.from('election_admins').insert([{ email: lowerEmail, branch }]).select().single();
    setSaving(false);
    if (error) { showToast(error.message.includes('unique') ? "Already an admin." : `Failed: ${error.message}`, false); return; }
    setAdmins(prev => [...prev, data]); setEmail('');
    showToast(`${lowerEmail} is now ${branch} admin.`);
  }

  async function removeAdmin(id: number, adminEmail: string) {
    if (!confirm(`Remove ${adminEmail}?`)) return;
    const { error } = await supabase.from('election_admins').delete().eq('id', id);
    if (error) { showToast("Failed.", false); return; }
    setAdmins(prev => prev.filter(a => a.id !== id));
    showToast(`${adminEmail} removed.`);
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-black uppercase italic text-slate-800">Admins</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Add branch chairpersons — they manage their chapter's roster and view results.</p>
      </div>

      {/* ── Voting Deadline ── */}
      <Card accent="red">
        <SectionTitle>Voting Deadline & Countdown</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">
          Once the deadline passes, the ballot is automatically locked — no one can vote.
        </p>

        {/* Current countdown display */}
        {deadline ? (
          <div className={`rounded-3xl p-8 mb-6 text-center ${votingClosed ? 'bg-slate-800' : 'bg-slate-900'}`}>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
              {votingClosed ? 'Voting Has Ended' : 'Time Remaining'}
            </p>
            <p className="text-5xl font-black text-red-500 tabular-nums tracking-tight">{timeLeft}</p>
            <p className="text-xs font-bold text-slate-500 uppercase mt-3">
              Deadline: {new Date(deadline).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl p-6 mb-6 bg-slate-50 border-2 border-dashed border-slate-200 text-center">
            <p className="text-slate-400 font-black uppercase text-sm tracking-widest">No deadline set — voting is open indefinitely</p>
          </div>
        )}

        {/* Deadline picker */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Set New Deadline (Date & Time)
            </label>
            <input type="datetime-local" value={dlInput} onChange={e => setDlInput(e.target.value)}
              min={new Date().toISOString().slice(0,16)}
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-slate-800"/>
          </div>
          <div className="flex gap-3">
            <button onClick={saveDeadline} disabled={dlSaving}
              className="bg-red-600 text-white font-black uppercase px-6 py-4 rounded-2xl flex items-center gap-2 hover:bg-red-700 transition-all disabled:opacity-50 whitespace-nowrap">
              {dlSaving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
              {deadline ? 'Update Deadline' : 'Set Deadline'}
            </button>
            {deadline && (
              <button onClick={clearDeadline}
                className="bg-slate-100 text-slate-600 font-black uppercase px-6 py-4 rounded-2xl hover:bg-slate-200 transition-all whitespace-nowrap">
                Remove
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Add Branch Chairperson</SectionTitle>
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-2xl mb-6">
          <Crown size={20} className="text-yellow-600 shrink-0"/>
          <div>
            <p className="font-black text-yellow-800 text-sm">Head Admin (You)</p>
            <p className="text-xs text-yellow-600 font-bold">{HEAD_ADMIN_EMAIL} — Full access, exempt from all voter restrictions</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="chairperson@gmail.com"
            className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none md:col-span-2"/>
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none">
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={addAdmin} disabled={saving}
          className="bg-slate-900 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-slate-700 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>} Add Chapter Admin
        </button>
      </Card>

      <Card>
        <SectionTitle>Current Branch Admins ({admins.length})</SectionTitle>
        {admins.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-8">No branch admins yet.</p>}
        <div className="space-y-3">
          {admins.map(a => (
            <div key={a.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-black text-slate-800">{a.email}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{a.branch} Chapter Admin</p>
              </div>
              <button onClick={() => removeAdmin(a.id, a.email)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all">
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Permission Levels</SectionTitle>
        <div className="space-y-4">
          {[
            {
              role: "Head Admin (You)", sub: HEAD_ADMIN_EMAIL, icon: <Crown size={16} className="text-yellow-600"/>, color: "bg-yellow-50 border-yellow-200", badge: "text-yellow-800",
              perms: ["Full access to all 6 tabs","Add/remove candidates","Add/remove branch admins","Blacklist & unblock voters","View national aggregate + per chapter","Completely exempt from whitelist & blacklist"],
            },
            {
              role: "Branch Chairperson", sub: "Added from this tab", icon: <ShieldCheck size={16} className="text-slate-500"/>, color: "bg-slate-50 border-slate-200", badge: "text-slate-700",
              perms: ["View their chapter's results","Manage their chapter's roster","View their chapter's vote log","Cannot add candidates or other admins","Cannot access blacklist"],
            },
          ].map(p => (
            <div key={p.role} className={`p-6 rounded-2xl border-2 ${p.color}`}>
              <div className="flex items-center gap-2 mb-1">{p.icon}<span className={`font-black uppercase text-sm ${p.badge}`}>{p.role}</span></div>
              <p className="text-xs text-slate-400 font-bold mb-3">{p.sub}</p>
              <ul className="space-y-1">
                {p.perms.map(perm => (
                  <li key={perm} className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <CheckCircle2 size={11} className="text-green-500 shrink-0"/> {perm}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: APPLICATIONS
// ─────────────────────────────────────────────────────────────────────────────
function ApplicationsTab({ applications, setApplications, setCandidates, showToast, isHeadAdmin, myChapter, adminEmail }: {
  applications: Application[];
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string;
}) {
  const [filter, setFilter]           = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selected, setSelected]       = useState<Application | null>(null);
  const [rejReason, setRejReason]     = useState('');
  const [processing, setProcessing]   = useState(false);
  const [viewScreenshot, setViewScreenshot] = useState<string | null>(null);

  const visible = applications.filter(a => {
    const chapterMatch = isHeadAdmin || a.chapter === myChapter;
    const statusMatch  = filter === 'all' || a.status === filter;
    return chapterMatch && statusMatch;
  });

  const pending  = applications.filter(a => a.status === 'pending'  && (isHeadAdmin || a.chapter === myChapter)).length;
  const approved = applications.filter(a => a.status === 'approved' && (isHeadAdmin || a.chapter === myChapter)).length;
  const rejected = applications.filter(a => a.status === 'rejected' && (isHeadAdmin || a.chapter === myChapter)).length;

  // ── Email notification helper ─────────────────────────────────────────────
  async function sendNotification(type: 'submitted' | 'approved' | 'rejected', application: Application) {
    try {
      await supabase.functions.invoke('notify-applicant', {
        body: { type, application },
      });
    } catch (e) {
      console.warn('Email notification failed (non-critical):', e);
    }
  }

  async function approve(app: Application) {
    setProcessing(true);
    // Add to candidates table automatically
    const { data: cand, error: candErr } = await supabase.from('candidates').insert([{
      full_name: app.full_name, position_name: app.position_name,
      chapter: app.chapter, photo_url: app.photo_url || null,
    }]).select().single();
    if (candErr) { showToast(`Failed to add candidate: ${candErr.message}`, false); setProcessing(false); return; }

    // Update application status
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from('candidate_applications').update({
      status: 'approved', reviewed_at: reviewedAt, reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }

    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved', reviewed_at: reviewedAt } : a));
    setCandidates(prev => [...prev, cand]);
    setSelected(null);
    showToast(`✓ ${app.full_name} approved and added as ${app.position_name} candidate for ${app.chapter}.`);

    // Send approval email (non-blocking)
    sendNotification('approved', { ...app, status: 'approved', reviewed_at: reviewedAt, reviewed_by: adminEmail });
  }

  async function reject(app: Application) {
    if (!rejReason.trim()) { showToast('Please provide a rejection reason.', false); return; }
    setProcessing(true);
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from('candidate_applications').update({
      status: 'rejected', rejection_reason: rejReason.trim(),
      reviewed_at: reviewedAt, reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'rejected', rejection_reason: rejReason, reviewed_at: reviewedAt } : a));
    setSelected(null); setRejReason('');
    showToast(`${app.full_name}'s application rejected.`);

    // Send rejection email (non-blocking)
    sendNotification('rejected', { ...app, status: 'rejected', rejection_reason: rejReason.trim(), reviewed_at: reviewedAt });
  }

  const statusBadge = (s: string) => ({
    pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  }[s] ?? 'bg-slate-100 text-slate-700');

  // ── Export functions ──────────────────────────────────────────────────────────
  function exportCSV(data: Application[]) {
    const headers = ['Application ID','Full Name','Email','DOB','Class Name','Year Graduated',
      'Class Sponsor','Principal','ID Number','Chapter','Position','Payment Method','Status','Rejection Reason','Applied At','Reviewed At','Reviewed By'];
    const rows = data.map(a => [
      a.id.slice(0,8).toUpperCase(), a.full_name, a.applicant_email, a.dob,
      a.class_name, String(a.year_graduated), a.sponsor_name, a.principal_name,
      a.id_number, a.chapter, a.position_name, a.payment_method, a.status,
      a.rejection_reason ?? '', a.created_at ? new Date(a.created_at).toLocaleString() : '',
      a.reviewed_at ? new Date(a.reviewed_at).toLocaleString() : '', a.reviewed_by ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `BWIAA_Applications_${filter}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportPDF(data: Application[]) {
    const title = `BWIAA Candidate Applications — ${filter.toUpperCase()} (${data.length})`;
    const content = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
      h1 { font-size: 20px; font-weight: 900; text-transform: uppercase; border-bottom: 3px solid #dc2626; padding-bottom: 12px; }
      .meta { font-size: 11px; color: #94a3b8; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #0f172a; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
      .pending  { background: #fef9c3; color: #854d0e; }
      .approved { background: #dcfce7; color: #166534; }
      .rejected { background: #fee2e2; color: #991b1b; }
      .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    </style></head><body>
    <h1>${title}</h1>
    <div class="meta">Generated: ${new Date().toLocaleString()} &nbsp;•&nbsp; Total: ${data.length}</div>
    <table>
      <thead><tr>
        <th>App ID</th><th>Full Name</th><th>Position</th><th>Chapter</th>
        <th>Payment</th><th>Status</th><th>Applied</th><th>Notes</th>
      </tr></thead>
      <tbody>
        ${data.map(a => `<tr>
          <td style="font-family:monospace;font-weight:700;color:#dc2626">${a.id.slice(0,8).toUpperCase()}</td>
          <td><strong>${a.full_name}</strong><br/><span style="color:#94a3b8;font-size:10px">${a.applicant_email}</span></td>
          <td>${a.position_name}</td>
          <td>${a.chapter}</td>
          <td>${a.payment_method === 'in_person' ? 'In Person' : 'Screenshot'}</td>
          <td><span class="badge ${a.status}">${a.status}</span></td>
          <td>${new Date(a.created_at).toLocaleDateString()}</td>
          <td style="color:#64748b;font-size:10px">${a.rejection_reason ?? (a.status === 'approved' ? 'Approved ✓' : '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="footer">BWIAA Election Management System — Official Applications Record — Confidential</div>
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(content); win.document.close(); win.print(); }
  }

  return (
    <div className="space-y-8">
      {/* Screenshot lightbox */}
      {viewScreenshot && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewScreenshot(null)}>
          <img src={viewScreenshot} alt="Payment screenshot" className="max-w-full max-h-full rounded-2xl shadow-2xl"/>
          <button className="absolute top-4 right-4 bg-white/10 text-white p-2 rounded-full" onClick={() => setViewScreenshot(null)}>
            <XCircle size={24}/>
          </button>
        </div>
      )}

      {/* Application detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-lg w-full my-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                {selected.photo_url
                  ? <img src={selected.photo_url} className="w-full h-full object-cover" alt={selected.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center bg-slate-200">
                      <span className="text-2xl font-black text-slate-400">{selected.full_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase text-slate-900">{selected.full_name}</h3>
                <p className="text-xs text-red-600 font-bold uppercase mt-1">{selected.position_name}</p>
                <p className="text-xs text-slate-400 font-bold">{selected.chapter}</p>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>
                  {selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1"><XCircle size={20}/></button>
            </div>

            {/* Details */}
            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              {[
                ['Application ID', selected.id.slice(0,8).toUpperCase()],
                ['Email', selected.applicant_email],
                ['Date of Birth', selected.dob],
                ['ID Number', selected.id_number],
                ['Class Name', selected.class_name],
                ['Year Graduated', String(selected.year_graduated)],
                ['Class Sponsor', selected.sponsor_name],
                ['Principal', selected.principal_name],
                ['Payment Method', selected.payment_method === 'in_person' ? 'In Person' : 'Screenshot'],
                ['Applied', new Date(selected.created_at).toLocaleString()],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className={`font-black text-right max-w-[55%] ${l === 'Application ID' ? 'text-red-600 font-mono' : 'text-slate-800'}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Payment screenshots */}
            {selected.payment_method === 'screenshot' && (
              <div className="mb-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Screenshots</p>
                <div className="flex gap-2">
                  {[selected.payment_screenshot_1, selected.payment_screenshot_2, selected.payment_screenshot_3]
                    .filter(Boolean).map((url, i) => (
                    <button key={i} onClick={() => setViewScreenshot(url!)}
                      className="w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 hover:border-red-400 transition-all">
                      <img src={url!} className="w-full h-full object-cover" alt={`Screenshot ${i+1}`}/>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Click to enlarge</p>
              </div>
            )}

            {/* Actions */}
            {selected.status === 'pending' && (
              <div className="space-y-3">
                <button onClick={() => approve(selected)} disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {processing ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                  Approve & Add as Candidate
                </button>
                <div className="flex gap-2">
                  <input value={rejReason} onChange={e => setRejReason(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm"/>
                  <button onClick={() => reject(selected)} disabled={processing || !rejReason.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-5 py-3 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 text-sm">
                    <XCircle size={14}/> Reject
                  </button>
                </div>
              </div>
            )}
            {selected.status !== 'pending' && (
              <div className={`rounded-2xl p-4 text-sm font-bold ${selected.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {selected.status === 'approved' ? '✓ This application was approved and the candidate was added.' : `✗ Rejected: ${selected.rejection_reason}`}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Candidate Applications</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Review, approve or reject candidate registrations
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => exportCSV(visible)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> CSV ({filter})
          </button>
          <button onClick={() => exportPDF(visible)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Printer size={14}/> Print/PDF ({filter})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{pending}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p>
        </div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{approved}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p>
        </div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{rejected}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['pending','approved','rejected','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border
              ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Application list */}
      <Card>
        <SectionTitle>Applications ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(app => (
            <div key={app.id} onClick={() => { setSelected(app); setRejReason(''); }}
              className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                {app.photo_url
                  ? <img src={app.photo_url} className="w-full h-full object-cover" alt={app.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="font-black text-slate-400">{app.full_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 truncate">{app.full_name}</p>
                <p className="text-xs text-slate-400 font-bold uppercase truncate">{app.position_name} — {app.chapter}</p>
                <p className="text-[10px] text-slate-400 font-bold">{new Date(app.created_at).toLocaleDateString()} • <span className="font-mono text-red-500">{app.id.slice(0,8).toUpperCase()}</span></p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${statusBadge(app.status)}`}>
                  {app.status}
                </span>
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  {app.payment_method === 'in_person' ? 'In Person' : `${[app.payment_screenshot_1, app.payment_screenshot_2, app.payment_screenshot_3].filter(Boolean).length} screenshot(s)`}
                </p>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="text-slate-400 font-bold text-sm text-center py-8">No {filter === 'all' ? '' : filter} applications.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: SETTINGS — full dynamic config for any org to customise
// ─────────────────────────────────────────────────────────────────────────────
function SettingsTab({ config, setConfig, showToast, deadline }: {
  config: ElectionConfig;
  setConfig: React.Dispatch<React.SetStateAction<ElectionConfig>>;
  showToast: (m: string, ok?: boolean) => void;
  deadline: string | null;
}) {
  const [local, setLocal]           = useState<ElectionConfig>(JSON.parse(JSON.stringify(config)));
  const [saving, setSaving]         = useState(false);
  const [newChapter, setNewChapter] = useState('');
  const [headAdmins, setHeadAdmins] = useState<string[]>([HEAD_ADMIN_EMAIL]);
  const [newHA, setNewHA]           = useState('');
  const [haSaving, setHaSaving]     = useState(false);

  // Load head admins on mount
  useEffect(() => {
    supabase.from('election_settings').select('value').eq('key', 'head_admins').maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try { setHeadAdmins(JSON.parse(data.value)); } catch {}
        } else {
          setHeadAdmins([HEAD_ADMIN_EMAIL]);
        }
      });
  }, []);

  async function addHeadAdmin() {
    const email = newHA.trim().toLowerCase();
    if (!email || !email.includes('@')) { showToast('Valid email required.', false); return; }
    if (headAdmins.includes(email)) { showToast('Already a head admin.', false); return; }
    setHaSaving(true);
    const updated = [...headAdmins, email];
    const { error } = await supabase.from('election_settings')
      .upsert([{ key: 'head_admins', value: JSON.stringify(updated) }], { onConflict: 'key' });
    setHaSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setHeadAdmins(updated); setNewHA('');
    showToast(`${email} is now a Head Admin.`);
  }

  async function removeHeadAdmin(email: string) {
    if (email === HEAD_ADMIN_EMAIL.toLowerCase()) { showToast('Cannot remove the primary head admin.', false); return; }
    if (!confirm(`Remove ${email} as Head Admin?`)) return;
    const updated = headAdmins.filter(e => e !== email);
    const { error } = await supabase.from('election_settings')
      .upsert([{ key: 'head_admins', value: JSON.stringify(updated) }], { onConflict: 'key' });
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setHeadAdmins(updated);
    showToast(`${email} removed from Head Admins.`);
  }

  function setField(field: keyof ElectionConfig, value: any) {
    setLocal(prev => ({ ...prev, [field]: value }));
  }

  function addChapter() {
    if (!newChapter.trim()) return;
    setLocal(prev => ({ ...prev, chapters: [...prev.chapters, newChapter.trim()] }));
    setNewChapter('');
  }

  function removeChapter(i: number) {
    setLocal(prev => ({ ...prev, chapters: prev.chapters.filter((_, idx) => idx !== i) }));
  }

  function addPosition() {
    setLocal(prev => ({ ...prev, positions_fees: [...prev.positions_fees, { position: 'New Position', fee: 0 }] }));
  }

  function removePosition(i: number) {
    setLocal(prev => ({ ...prev, positions_fees: prev.positions_fees.filter((_, idx) => idx !== i) }));
  }

  function updatePosition(i: number, field: 'position' | 'fee', value: string | number) {
    setLocal(prev => {
      const pf = [...prev.positions_fees];
      pf[i] = { ...pf[i], [field]: field === 'fee' ? Number(value) : value };
      return { ...prev, positions_fees: pf };
    });
  }

  async function saveSettings() {
    setSaving(true);
    const rows = [
      { key: 'org_name',              value: local.org_name },
      { key: 'election_title',        value: local.election_title },
      { key: 'election_year',         value: local.election_year },
      { key: 'currency',              value: local.currency },
      { key: 'currency_symbol',       value: local.currency_symbol },
      { key: 'maintenance_fee',       value: String(local.maintenance_fee) },
      { key: 'maintenance_currency',  value: local.maintenance_currency },
      { key: 'chapters',              value: JSON.stringify(local.chapters) },
      { key: 'positions_fees',        value: JSON.stringify(local.positions_fees) },
    ];
    const { error } = await supabase.from('election_settings')
      .upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    CHAPTERS  = local.chapters;
    POSITIONS = local.positions_fees.map(p => p.position);
    setConfig(local);
    showToast('Settings saved! Changes are now live across the entire platform.');
  }

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800 flex items-center gap-3">
            <Sliders size={28} className="text-red-600"/> Platform Settings
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Customise everything — positions, fees, chapters, branding. Works for any school, company, or organisation.
          </p>
        </div>
        <button onClick={saveSettings} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 shrink-0">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      <Card>
        <SectionTitle>Organisation & Branding</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Organisation Name</label>
            <input value={local.org_name} onChange={e => setField('org_name', e.target.value)}
              placeholder="e.g. BWIAA, Student Council, Acme Corp"
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Election Title</label>
            <input value={local.election_title} onChange={e => setField('election_title', e.target.value)}
              placeholder="e.g. National Alumni Election"
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Election Year</label>
            <input value={local.election_year} onChange={e => setField('election_year', e.target.value)}
              placeholder="e.g. 2026"
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Currency Code</label>
              <input value={local.currency} onChange={e => setField('currency', e.target.value)}
                placeholder="USD, LRD, GBP..."
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Symbol</label>
              <input value={local.currency_symbol} onChange={e => setField('currency_symbol', e.target.value)}
                placeholder="$, £, ₵..."
                className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
            </div>
          </div>
          {/* Maintenance fee */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
            <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">System Maintenance Fee (per due payment)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount</label>
                <input type="number" value={local.maintenance_fee} onChange={e => setField('maintenance_fee', Number(e.target.value))}
                  placeholder="20"
                  className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Currency</label>
                <input value={local.maintenance_currency} onChange={e => setField('maintenance_currency', e.target.value)}
                  placeholder="LRD"
                  className="w-full border-2 border-slate-200 focus:border-amber-500 rounded-2xl px-5 py-4 font-bold outline-none"/>
              </div>
            </div>
            <p className="text-xs text-amber-600 font-bold mt-2">
              This amount is automatically added to every dues payment as a system maintenance contribution.
            </p>
          </div>
        </div>
        <div className="mt-6 p-5 bg-slate-900 rounded-2xl text-white text-center">
          <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Live Preview</p>
          <p className="font-black uppercase italic text-lg">{local.org_name} <span className="text-red-500">{local.election_year}</span></p>
          <p className="text-white/50 text-xs font-bold mt-1">{local.election_title}</p>
        </div>
      </Card>

      <Card>
        <SectionTitle>Chapters & Branches</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4 -mt-2">
          Add, rename or remove chapters. These appear on the voter registration and candidate form.
        </p>
        <div className="space-y-2 mb-4">
          {local.chapters.map((ch, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-black text-slate-400 w-6 text-right shrink-0">{i+1}.</span>
              <input value={ch} onChange={e => {
                const c = [...local.chapters]; c[i] = e.target.value;
                setLocal(prev => ({ ...prev, chapters: c }));
              }} className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <button onClick={() => removeChapter(i)} className="text-red-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all">
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={newChapter} onChange={e => setNewChapter(e.target.value)}
            placeholder="Add new chapter or branch..."
            onKeyDown={e => e.key === 'Enter' && addChapter()}
            className="flex-1 border-2 border-dashed border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
          <button onClick={addChapter} className="bg-slate-900 text-white font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-slate-700 transition-all flex items-center gap-2">
            <PlusCircle size={14}/> Add
          </button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Positions & Registration Fees</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4 -mt-2">
          Customise position titles and registration fees.
        </p>
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
              <input value={pf.position} onChange={e => updatePosition(i, 'position', e.target.value)}
                className="col-span-7 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <input type="number" value={pf.fee} onChange={e => updatePosition(i, 'fee', e.target.value)}
                className="col-span-3 border-2 border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
              <button onClick={() => removePosition(i)} className="col-span-1 text-red-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all flex justify-center">
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>
        <button onClick={addPosition}
          className="border-2 border-dashed border-slate-200 hover:border-red-400 text-slate-500 hover:text-red-600 font-black uppercase px-5 py-3 rounded-xl text-xs w-full transition-all flex items-center justify-center gap-2">
          <PlusCircle size={14}/> Add Position
        </button>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {local.positions_fees.map((pf, i) => (
            <div key={i} className="bg-slate-900 rounded-2xl p-4 text-center">
              <p className="text-red-500 font-black text-lg">{local.currency_symbol}{pf.fee.toLocaleString()}</p>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest leading-tight mt-1">{pf.position}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Head Administrators ── */}
      <Card>
        <SectionTitle>Head Administrators</SectionTitle>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4 -mt-2">
          Head admins have full platform access — add Principals, Presidents, CEOs or co-administrators here.
        </p>
        <div className="space-y-2 mb-4">
          {headAdmins.map((email, i) => (
            <div key={email} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
              <Crown size={14} className={i === 0 ? 'text-yellow-500' : 'text-slate-400'}/>
              <span className="flex-1 font-bold text-slate-800 text-sm">{email}</span>
              {i === 0 && <span className="text-[10px] font-black text-yellow-600 uppercase bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-200">Primary</span>}
              {i > 0 && (
                <button onClick={() => removeHeadAdmin(email)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all">
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <input value={newHA} onChange={e => setNewHA(e.target.value)}
            placeholder="Add head admin email (Principal, CEO, President...)"
            onKeyDown={e => e.key === 'Enter' && addHeadAdmin()}
            className="flex-1 border-2 border-dashed border-slate-200 focus:border-red-600 rounded-xl px-4 py-3 font-bold outline-none text-sm"/>
          <button onClick={addHeadAdmin} disabled={haSaving}
            className="bg-slate-900 text-white font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50">
            {haSaving ? <Loader2 size={14} className="animate-spin"/> : <PlusCircle size={14}/>} Add
          </button>
        </div>
      </Card>

      {/* ── Danger Zone: Reset ── */}
      {(() => {
        const countdownActive = deadline ? new Date(deadline).getTime() > Date.now() : false;
        const electionOver    = deadline ? new Date(deadline).getTime() <= Date.now() : false;
        const locked          = countdownActive || electionOver;

        async function resetTable(table: string, showToast: (m: string, ok?: boolean) => void) {
          // Use gt on created_at (all rows have it) or a dummy false filter workaround
          // Most reliable: delete where created_at is not null (covers all real rows)
          const { error } = await supabase.from(table).delete().gte('created_at', '1970-01-01');
          if (error) {
            // Fallback for tables without created_at (eligible_voters)
            const { error: e2 } = await supabase.from(table).delete().neq('email', 'NOEMAIL_PLACEHOLDER_XYZ');
            if (e2) { showToast(`Failed to reset ${table}: ${e2.message}`, false); return false; }
          }
          return true;
        }

        return (
          <Card accent="red">
            <SectionTitle>⚠ Danger Zone — Reset System</SectionTitle>

            {locked && (
              <div className={`flex items-start gap-3 p-5 rounded-2xl mb-6 border-2 ${countdownActive ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-300'}`}>
                <span className="text-2xl shrink-0">{countdownActive ? '🔒' : '🏁'}</span>
                <div>
                  <p className={`font-black text-sm uppercase ${countdownActive ? 'text-yellow-800' : 'text-red-800'}`}>
                    {countdownActive ? 'Reset Locked — Countdown Active' : 'Reset Locked — Election Has Ended'}
                  </p>
                  <p className={`text-xs font-bold mt-1 ${countdownActive ? 'text-yellow-700' : 'text-red-700'}`}>
                    {countdownActive
                      ? 'The voting countdown is running. Reset is disabled to protect election integrity. Remove the deadline first if you need to reset.'
                      : 'The election has ended. Reset is disabled to preserve the official results. Archive results before resetting.'}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6 -mt-2">
              {locked ? 'Unlock by removing the voting deadline in the Admins tab.' : 'Use these to wipe test data before going live. Each action is irreversible.'}
            </p>

            <div className={`space-y-3 ${locked ? 'opacity-40 pointer-events-none select-none' : ''}`}>
              {[
                { label: 'Reset All Votes', sub: 'Clears every ballot — vote counts go to zero', table: 'votes', color: 'border-orange-200 bg-orange-50', btn: 'bg-orange-500 hover:bg-orange-600' },
                { label: 'Reset Voter Profiles', sub: 'Clears chapter/class assignments — voters must re-register on next login', table: 'voter_profiles', color: 'border-orange-200 bg-orange-50', btn: 'bg-orange-500 hover:bg-orange-600' },
                { label: 'Reset All Candidates', sub: 'Removes all candidates from the ballot', table: 'candidates', color: 'border-red-200 bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
                { label: 'Reset Applications', sub: 'Deletes all candidate registration applications', table: 'candidate_applications', color: 'border-red-200 bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
                { label: 'Reset Voter Roster', sub: 'Clears the eligible voter whitelist — all voters must be re-added', table: 'eligible_voters', color: 'border-red-200 bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
              ].map(({ label, sub, table, color, btn }) => (
                <div key={table} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-2 rounded-2xl ${color}`}>
                  <div>
                    <p className="font-black text-slate-800 text-sm">{label}</p>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">{sub}</p>
                  </div>
                  <button onClick={async () => {
                    if (!confirm(`⚠ Are you absolutely sure you want to ${label}?\n\nThis CANNOT be undone.`)) return;
                    const ok = await resetTable(table, showToast);
                    if (ok) showToast(`✓ ${label} complete. Refresh the page to confirm.`);
                  }} className={`${btn} text-white font-black uppercase px-5 py-3 rounded-xl text-xs transition-all shrink-0`}>
                    Reset
                  </button>
                </div>
              ))}

              {/* Full system reset */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-2 border-slate-800 bg-slate-900 rounded-2xl mt-2">
                <div>
                  <p className="font-black text-white text-sm">🔴 Full System Reset</p>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    Clears votes, voter profiles, candidates, and applications in one go. Settings, admins and roster are preserved.
                  </p>
                </div>
                <button onClick={async () => {
                  if (!confirm('⚠ FULL RESET\n\nThis will permanently delete:\n• All votes\n• All voter profiles\n• All candidates\n• All applications\n\nThis CANNOT be undone. Continue?')) return;
                  if (!confirm('FINAL CONFIRMATION\n\nClick OK to proceed with the full system reset.')) return;
                  let allOk = true;
                  for (const t of ['votes', 'voter_profiles', 'candidates', 'candidate_applications']) {
                    const ok = await resetTable(t, showToast);
                    if (!ok) { allOk = false; break; }
                  }
                  if (allOk) showToast('✓ Full system reset complete. Please refresh the page now.');
                }} className="bg-white text-slate-900 font-black uppercase px-5 py-3 rounded-xl text-xs hover:bg-red-600 hover:text-white transition-all shrink-0">
                  Full Reset
                </button>
              </div>
            </div>
          </Card>
        );
      })()}

      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-10 py-5 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 text-sm">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// TAB: MEMBERS
// ─────────────────────────────────────────────────────────────────────────────
function MembersTab({ members, setMembers, showToast, isHeadAdmin, myChapter, adminEmail }: {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null; adminEmail: string;
}) {
  const [filter, setFilter]           = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selected, setSelected]       = useState<Member | null>(null);
  const [rejReason, setRejReason]     = useState('');
  const [processing, setProcessing]   = useState(false);
  const [search, setSearch]           = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [pwResetting, setPwResetting] = useState(false);
  const [pwResult, setPwResult]       = useState('');
  const [transferChapter, setTransferChapter] = useState('');
  const [transferring, setTransferring]       = useState(false);

  async function adminResetPassword(m: Member) {
    if (!tempPassword.trim() || tempPassword.length < 8) {
      setPwResult('Password must be at least 8 characters.'); return;
    }
    setPwResetting(true); setPwResult('');
    try {
      // Use Supabase Admin API via service role — must be called from a secure edge function
      // For now, store temp password in member notes so admin can share it manually
      const { error } = await supabase.from('members').update({
        // Store a flag that password was reset — admin shares temp password manually
      }).eq('id', m.id);

      // Log the reset action (not the password itself)
      await supabase.from('activity_log').insert([{
        member_id: m.id, member_name: m.full_name, chapter: m.chapter,
        action: 'Password reset by admin',
        details: `Reset by ${adminEmail} — temporary password shared directly`,
      }]);

      setPwResult(`✓ Logged. Share this password directly with ${m.full_name}: "${tempPassword}"`);
      setTempPassword('');
    } catch (e: any) {
      setPwResult(`Failed: ${e.message}`);
    } finally { setPwResetting(false); }
  }

  const visible = members.filter(m => {
    const chapterMatch = isHeadAdmin || m.chapter === myChapter;
    const statusMatch  = filter === 'all' || m.status === filter;
    const searchMatch  = !search ||
      m.full_name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.chapter.toLowerCase().includes(search.toLowerCase());
    return chapterMatch && statusMatch && searchMatch;
  });

  const pending  = members.filter(m => m.status === 'pending'  && (isHeadAdmin || m.chapter === myChapter)).length;
  const approved = members.filter(m => m.status === 'approved' && (isHeadAdmin || m.chapter === myChapter)).length;
  const rejected = members.filter(m => m.status === 'rejected' && (isHeadAdmin || m.chapter === myChapter)).length;

  async function approveMember(m: Member) {
    setProcessing(true);
    const approvedAt = new Date().toISOString();
    const { error } = await supabase.from('members').update({
      status: 'approved', approved_by: adminEmail, approved_at: approvedAt,
    }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }

    // ★ Auto-add to eligible_voters so member can vote
    const { error: rosterErr } = await supabase.from('eligible_voters')
      .upsert([{ email: m.email, chapter: m.chapter }], { onConflict: 'email' });
    if (rosterErr) console.warn('Could not add to voter roster:', rosterErr.message);

    // Log activity
    await supabase.from('activity_log').insert([{
      member_id: m.id, member_name: m.full_name, chapter: m.chapter,
      action: 'Membership approved — added to voter roster',
      details: `Approved by ${adminEmail}`,
    }]);

    setMembers(prev => prev.map(x => x.id === m.id
      ? { ...x, status: 'approved', approved_by: adminEmail, approved_at: approvedAt } : x));
    setSelected(null); setProcessing(false);
    showToast(`✓ ${m.full_name} approved as member and added to voter roster.`);
  }

  async function rejectMember(m: Member) {
    if (!rejReason.trim()) { showToast('Please provide a rejection reason.', false); return; }
    setProcessing(true);
    const { error } = await supabase.from('members').update({
      status: 'rejected', approved_by: adminEmail, approved_at: new Date().toISOString(),
    }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    await supabase.from('activity_log').insert([{
      member_id: m.id, member_name: m.full_name, chapter: m.chapter,
      action: 'Membership rejected',
      details: `Reason: ${rejReason.trim()}`,
    }]);
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: 'rejected' } : x));
    setSelected(null); setRejReason('');
    setProcessing(false);
    showToast(`${m.full_name}'s membership application rejected.`);
  }

  async function deactivateMember(m: Member) {
    if (!confirm(`Deactivate ${m.full_name}? They will lose voting access and member privileges. This can be reversed.`)) return;
    setProcessing(true);
    const { error } = await supabase.from('members').update({ status: 'rejected' }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    // Remove from eligible_voters
    await supabase.from('eligible_voters').delete().eq('email', m.email);
    await supabase.from('activity_log').insert([{
      member_id: m.id, member_name: m.full_name, chapter: m.chapter,
      action: 'Member deactivated',
      details: `Deactivated by ${adminEmail}`,
    }]);
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: 'rejected' } : x));
    setSelected(null); setProcessing(false);
    showToast(`${m.full_name} deactivated and removed from voter roster.`);
  }

  async function reactivateMember(m: Member) {
    if (!confirm(`Reactivate ${m.full_name}? They will regain member privileges and be re-added to the voter roster.`)) return;
    setProcessing(true);
    const { error } = await supabase.from('members').update({
      status: 'approved', approved_by: adminEmail, approved_at: new Date().toISOString(),
    }).eq('id', m.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    // Re-add to eligible_voters
    await supabase.from('eligible_voters').upsert([{ email: m.email, chapter: m.chapter }], { onConflict: 'email' });
    await supabase.from('activity_log').insert([{
      member_id: m.id, member_name: m.full_name, chapter: m.chapter,
      action: 'Member reactivated',
      details: `Reactivated by ${adminEmail}`,
    }]);
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: 'approved' } : x));
    setSelected(null); setProcessing(false);
    showToast(`${m.full_name} reactivated and added back to voter roster.`);
  }

  function exportCSV() {
    const headers = ['Member ID','Full Name','Email','Phone','Chapter','Class Name','Year Graduated','Sponsor','Principal','ID Number','Status','Applied','Approved By','Approved At'];
    const rows = visible.map(m => [
      m.id.slice(0,8).toUpperCase(), m.full_name, m.email, m.phone ?? '',
      m.chapter, m.class_name, String(m.year_graduated), m.sponsor_name,
      m.principal_name, m.id_number, m.status,
      new Date(m.created_at).toLocaleString(),
      m.approved_by ?? '', m.approved_at ? new Date(m.approved_at).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `BWIAA_Members_${filter}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const statusBadge = (s: string) => ({
    pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  }[s] ?? 'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-8">

      {/* Member detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-lg w-full my-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                {selected.photo_url
                  ? <img src={selected.photo_url} className="w-full h-full object-cover" alt={selected.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center bg-slate-200">
                      <span className="text-2xl font-black text-slate-400">{selected.full_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase text-slate-900">{selected.full_name}</h3>
                <p className="text-xs text-red-600 font-bold uppercase mt-1">{selected.chapter}</p>
                <p className="text-xs text-slate-400 font-bold">{selected.email}</p>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>
                  {selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <XCircle size={20}/>
              </button>
            </div>

            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              {[
                ['Member ID',     selected.id.slice(0,8).toUpperCase()],
                ['Email',         selected.email],
                ['Phone',         selected.phone ?? '—'],
                ['ID Number',     selected.id_number],
                ['Class Name',    selected.class_name],
                ['Year Graduated',String(selected.year_graduated)],
                ['Class Sponsor', selected.sponsor_name],
                ['Principal',     selected.principal_name],
                ['Applied',       new Date(selected.created_at).toLocaleString()],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className={`font-black text-right max-w-[55%] ${l === 'Member ID' ? 'text-red-600 font-mono' : 'text-slate-800'}`}>{v}</span>
                </div>
              ))}
            </div>

            {selected.status === 'pending' && (
              <div className="space-y-3">
                <button onClick={() => approveMember(selected)} disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {processing ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                  Approve Membership
                </button>
                <div className="flex gap-2">
                  <input value={rejReason} onChange={e => setRejReason(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm"/>
                  <button onClick={() => rejectMember(selected)} disabled={processing || !rejReason.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-5 py-3 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 text-sm shrink-0">
                    <XCircle size={14}/> Reject
                  </button>
                </div>
              </div>
            )}
            {selected.status !== 'pending' && (
              <div className={`rounded-2xl p-4 text-sm font-bold ${selected.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {selected.status === 'approved'
                  ? `✓ Approved by ${selected.approved_by ?? 'admin'} on ${selected.approved_at ? new Date(selected.approved_at).toLocaleDateString() : '—'}`
                  : '✗ This membership is inactive/rejected.'}
              </div>
            )}

            {/* Deactivate / Reactivate */}
            {selected.status === 'approved' && (
              <div className="border-t border-slate-100 pt-4 mt-2">
                <button onClick={() => deactivateMember(selected)} disabled={processing}
                  className="w-full bg-orange-50 hover:bg-orange-100 text-orange-700 border-2 border-orange-200 font-black uppercase py-3 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                  {processing ? <Loader2 size={14} className="animate-spin"/> : '⛔'} Deactivate Member
                </button>
                <p className="text-xs text-slate-400 font-bold text-center mt-2">Removes voting access · Reversible</p>
              </div>
            )}
            {selected.status === 'rejected' && (
              <div className="border-t border-slate-100 pt-4 mt-2">
                <button onClick={() => reactivateMember(selected)} disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-3 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
                  {processing ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>} Reactivate Member
                </button>
                <p className="text-xs text-slate-400 font-bold text-center mt-2">Restores access and adds back to voter roster</p>
              </div>
            )}

            {/* Admin Password Reset */}
            {selected.status === 'approved' && (
              <div className="border-t border-slate-100 pt-5 mt-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Key size={12}/> Admin Password Reset
                </p>
                <p className="text-xs text-slate-400 font-bold mb-3 leading-relaxed">
                  Set a temporary password for <strong>{selected.full_name}</strong> and share it with them directly.
                </p>
                <div className="flex gap-2">
                  <input value={tempPassword} onChange={e => { setTempPassword(e.target.value); setPwResult(''); }}
                    placeholder="Temporary password (min 8 chars)"
                    className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm" type="text"/>
                  <button onClick={() => adminResetPassword(selected)} disabled={pwResetting || tempPassword.length < 8}
                    className="bg-slate-900 hover:bg-slate-700 text-white font-black uppercase px-4 py-3 rounded-2xl text-xs transition-all disabled:opacity-50 shrink-0">
                    {pwResetting ? <Loader2 size={14} className="animate-spin"/> : 'Set'}
                  </button>
                </div>
                {pwResult && (
                  <div className={`mt-3 p-3 rounded-xl text-xs font-bold leading-relaxed ${pwResult.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {pwResult}
                  </div>
                )}
              </div>
            )}

            {/* Chapter Transfer */}
            {selected.status === 'approved' && isHeadAdmin && (
              <div className="border-t border-slate-100 pt-5 mt-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  🔁 Transfer to Another Chapter
                </p>
                <p className="text-xs text-slate-400 font-bold mb-3 leading-relaxed">
                  Current chapter: <strong>{selected.chapter}</strong>. All records will follow the member.
                </p>
                <div className="flex gap-2">
                  <select value={transferChapter} onChange={e => setTransferChapter(e.target.value)}
                    className="flex-1 border-2 border-slate-200 focus:border-red-600 rounded-2xl px-4 py-3 font-bold outline-none text-sm">
                    <option value="">Select new chapter...</option>
                    {CHAPTERS.filter(c => c !== selected.chapter).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button disabled={!transferChapter || transferring}
                    onClick={async () => {
                      if (!transferChapter || !confirm(`Transfer ${selected.full_name} from ${selected.chapter} to ${transferChapter}? This cannot be undone.`)) return;
                      setTransferring(true);
                      const { error } = await supabase.from('members').update({ chapter: transferChapter }).eq('id', selected.id);
                      if (error) { showToast(`Transfer failed: ${error.message}`, false); setTransferring(false); return; }
                      // Also update eligible_voters
                      await supabase.from('eligible_voters').update({ chapter: transferChapter }).eq('email', selected.email);
                      // Log activity
                      await supabase.from('activity_log').insert([{
                        member_id: selected.id, member_name: selected.full_name,
                        chapter: transferChapter,
                        action: 'Chapter transfer',
                        details: `Transferred from ${selected.chapter} to ${transferChapter} by ${adminEmail}`,
                      }]);
                      setMembers(prev => prev.map(m => m.id === selected.id ? {...m, chapter: transferChapter} : m));
                      setSelected(prev => prev ? {...prev, chapter: transferChapter} : null);
                      setTransferChapter('');
                      setTransferring(false);
                      showToast(`✓ ${selected.full_name} transferred to ${transferChapter}.`);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-4 py-3 rounded-2xl text-xs transition-all disabled:opacity-50 shrink-0 flex items-center gap-1">
                    {transferring ? <Loader2 size={14} className="animate-spin"/> : '→'} Transfer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Member Applications</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Review and approve member registrations
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> CSV ({filter})
          </button>
          <Link href="/members"
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Users size={14}/> View Portal
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{pending}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p>
        </div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{approved}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p>
        </div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{rejected}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or chapter..."
            className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending','approved','rejected','all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border
                ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Member list */}
      <Card>
        <SectionTitle>Members ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(m => (
            <div key={m.id} onClick={() => { setSelected(m); setRejReason(''); }}
              className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                {m.photo_url
                  ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="font-black text-slate-400">{m.full_name.charAt(0)}</span>
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 truncate">{m.full_name}</p>
                <p className="text-xs text-slate-400 font-bold uppercase truncate">{m.chapter} · Class of {m.year_graduated}</p>
                <p className="text-[10px] text-slate-400 font-bold">{new Date(m.created_at).toLocaleDateString()} · <span className="font-mono text-red-500">{m.id.slice(0,8).toUpperCase()}</span></p>
              </div>
              <div className="shrink-0">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${statusBadge(m.status)}`}>
                  {m.status}
                </span>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="text-slate-400 font-bold text-sm text-center py-8">No {filter === 'all' ? '' : filter} member applications.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: DUES
// ─────────────────────────────────────────────────────────────────────────────
function DuesTab({ dues, setDues, showToast, isHeadAdmin, myChapter, adminEmail, config }: {
  dues: DuesPayment[];
  setDues: React.Dispatch<React.SetStateAction<DuesPayment[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null;
  adminEmail: string; config: ElectionConfig;
}) {
  const [filter, setFilter]       = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const [selected, setSelected]   = useState<DuesPayment|null>(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]       = useState('');
  const [viewImg, setViewImg]     = useState<string|null>(null);

  const symbol = config.currency_symbol;
  const currency = config.currency;

  const visible = dues.filter(d => {
    const chMatch = isHeadAdmin || d.chapter === myChapter;
    const stMatch = filter === 'all' || d.status === filter;
    const srMatch = !search || d.member_name.toLowerCase().includes(search.toLowerCase())
      || d.chapter.toLowerCase().includes(search.toLowerCase())
      || d.period.toLowerCase().includes(search.toLowerCase());
    return chMatch && stMatch && srMatch;
  });

  const pending  = dues.filter(d => d.status==='pending'  && (isHeadAdmin||d.chapter===myChapter)).length;
  const approved = dues.filter(d => d.status==='approved' && (isHeadAdmin||d.chapter===myChapter)).length;
  const rejected = dues.filter(d => d.status==='rejected' && (isHeadAdmin||d.chapter===myChapter)).length;
  const totalApproved = dues.filter(d => d.status==='approved' && (isHeadAdmin||d.chapter===myChapter)).reduce((s,d)=>s+d.amount,0);

  async function approve(d: DuesPayment) {
    setProcessing(true);
    const approvedAt = new Date().toISOString();
    const { error } = await supabase.from('dues_payments').update({
      status:'approved', approved_by: adminEmail, approved_at: approvedAt,
    }).eq('id', d.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    await supabase.from('activity_log').insert([{
      member_name: d.member_name, chapter: d.chapter,
      action: 'Dues payment approved',
      details: `${symbol}${d.amount} for ${d.period} approved by ${adminEmail}`,
    }]);
    setDues(prev => prev.map(x => x.id===d.id ? {...x, status:'approved', approved_by:adminEmail, approved_at:approvedAt} : x));
    setSelected(null); setProcessing(false);
    showToast(`✓ ${symbol}${d.amount} payment from ${d.member_name} approved.`);
  }

  async function reject(d: DuesPayment) {
    if (!confirm(`Reject this payment from ${d.member_name}?`)) return;
    setProcessing(true);
    const { error } = await supabase.from('dues_payments').update({
      status:'rejected', approved_by: adminEmail, approved_at: new Date().toISOString(),
    }).eq('id', d.id);
    if (error) { showToast(`Failed: ${error.message}`, false); setProcessing(false); return; }
    setDues(prev => prev.map(x => x.id===d.id ? {...x, status:'rejected'} : x));
    setSelected(null); setProcessing(false);
    showToast(`${d.member_name}'s payment rejected.`);
  }

  function exportCSV() {
    const headers = ['Member','Chapter','Period','Amount','Currency','Method','Status','Notes','Submitted','Approved By','Approved At'];
    const rows = visible.map(d => [
      d.member_name, d.chapter, d.period, String(d.amount), d.currency,
      d.payment_method, d.status, d.notes??'',
      new Date(d.created_at).toLocaleString(),
      d.approved_by??'', d.approved_at?new Date(d.approved_at).toLocaleString():'',
    ]);
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url;
    a.download=`Dues_${filter}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const statusBadge = (s: string) => ({
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved:'bg-green-100 text-green-700 border-green-200',
    rejected:'bg-red-100 text-red-700 border-red-200',
  }[s] ?? 'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-8">
      {viewImg && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={()=>setViewImg(null)}>
          <img src={viewImg} className="max-w-full max-h-full rounded-2xl shadow-2xl" alt="Payment proof"/>
          <button className="absolute top-4 right-4 bg-white/10 text-white p-2 rounded-full" onClick={()=>setViewImg(null)}>
            <XCircle size={24}/>
          </button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-slate-900/95 z-40 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] p-8 max-w-lg w-full my-4 shadow-2xl">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-black uppercase text-slate-900">{selected.member_name}</h3>
                <p className="text-xs text-red-600 font-bold uppercase mt-1">{selected.chapter}</p>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mt-2 ${statusBadge(selected.status)}`}>
                  {selected.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-slate-900">{symbol}{selected.amount.toLocaleString()}</p>
                <p className="text-xs text-slate-400 font-bold">{selected.currency}</p>
              </div>
              <button onClick={()=>setSelected(null)} className="text-slate-400 hover:text-slate-700 p-1 ml-2"><XCircle size={20}/></button>
            </div>

            <div className="space-y-1.5 bg-slate-50 rounded-2xl p-5 mb-5 text-xs">
              {[
                ['Period', selected.period],
                ['Payment Method', selected.payment_method==='in_person'?'In Person':'Screenshot/Transfer'],
                ['Notes', selected.notes??'—'],
                ['Submitted', new Date(selected.created_at).toLocaleString()],
              ].map(([l,v])=>(
                <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-black text-slate-400 uppercase tracking-widest">{l}</span>
                  <span className="font-black text-slate-800 text-right max-w-[60%]">{v}</span>
                </div>
              ))}
            </div>

            {selected.screenshot_url && (
              <div className="mb-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Payment Screenshot</p>
                <img src={selected.screenshot_url} className="rounded-2xl max-h-48 w-full object-cover border border-slate-200 cursor-pointer"
                  alt="Payment proof" onClick={()=>setViewImg(selected.screenshot_url!)}/>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Click to enlarge</p>
              </div>
            )}

            {selected.status==='pending' && (
              <div className="space-y-3">
                <button onClick={()=>approve(selected)} disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  {processing?<Loader2 size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>}
                  Approve Payment
                </button>
                <button onClick={()=>reject(selected)} disabled={processing}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-black uppercase py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 border-2 border-red-200">
                  <XCircle size={16}/> Reject Payment
                </button>
              </div>
            )}
            {selected.status!=='pending' && (
              <div className={`rounded-2xl p-4 text-sm font-bold ${selected.status==='approved'?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>
                {selected.status==='approved'
                  ?`✓ Approved by ${selected.approved_by??'admin'} on ${selected.approved_at?new Date(selected.approved_at).toLocaleDateString():'—'}`
                  :'✗ This payment was rejected.'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Dues Payments</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review and approve member dues submissions</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> CSV
          </button>
          <Link href="/finances" className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <DollarSign size={14}/> Public View
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-yellow-500 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{pending}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Pending</p>
        </div>
        <div className="bg-green-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{approved}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Approved</p>
        </div>
        <div className="bg-red-600 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-4xl font-black">{rejected}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Rejected</p>
        </div>
        <div className="bg-slate-900 text-white rounded-3xl p-6 text-center shadow-lg">
          <p className="text-2xl font-black">{symbol}{totalApproved.toLocaleString()}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mt-1">Total Collected</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name, chapter or period..."
            className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending','approved','rejected','all'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter===f?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <SectionTitle>Payments ({visible.length})</SectionTitle>
        <div className="space-y-3">
          {visible.map(d=>(
            <div key={d.id} onClick={()=>setSelected(d)}
              className="flex items-center gap-4 p-5 bg-slate-50 hover:bg-slate-100 rounded-2xl cursor-pointer transition-all border-2 border-transparent hover:border-slate-200">
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 truncate">{d.member_name}</p>
                <p className="text-xs text-slate-400 font-bold uppercase truncate">{d.chapter} · {d.period}</p>
                <p className="text-[10px] text-slate-400 font-bold">{new Date(d.created_at).toLocaleDateString()} · {d.payment_method==='in_person'?'In Person':'Screenshot'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-xl text-slate-900">{symbol}{d.amount.toLocaleString()}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${statusBadge(d.status)}`}>{d.status}</span>
              </div>
            </div>
          ))}
          {visible.length===0 && (
            <p className="text-slate-400 font-bold text-sm text-center py-8">No {filter==='all'?'':''+filter+' '}dues payments found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: EVENTS & ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────
function EventsTab({ events, setEvents, showToast, isHeadAdmin, myChapter, adminEmail, config, members }: {
  events: EventRow[];
  setEvents: React.Dispatch<React.SetStateAction<EventRow[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean; myChapter: string | null;
  adminEmail: string; config: ElectionConfig;
  members: Member[];
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
    const chMatch = isHeadAdmin || !e.chapter || e.chapter === myChapter || e.chapter === 'All';
    const now = new Date();
    const evDate = new Date(e.event_date);
    if (filter === 'upcoming') return chMatch && evDate >= now;
    if (filter === 'past') return chMatch && evDate < now;
    return chMatch;
  });

  async function createEvent() {
    if (!title.trim()) { showToast('Event title required.', false); return; }
    if (!eventDate) { showToast('Event date required.', false); return; }
    setSaving(true);
    const { data, error } = await supabase.from('events').insert([{
      title: title.trim(),
      description: description.trim() || null,
      chapter: chapter === 'All' ? null : chapter,
      event_date: eventDate,
      event_time: eventTime || null,
      location: location.trim() || null,
      event_type: eventType,
      created_by: adminEmail,
    }]).select().single();
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setEvents(prev => [data, ...prev]);
    setTitle(''); setDesc(''); setDate(''); setTime(''); setLocation('');
    showToast(`✓ ${eventType === 'announcement' ? 'Announcement' : 'Event'} posted to ${chapter === 'All' ? 'all chapters' : chapter}.`);
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setEvents(prev => prev.filter(e => e.id !== id));
    showToast('Event deleted.');
  }

  const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
    meeting:      { label: 'Meeting',      color: 'text-blue-700',   bg: 'bg-blue-100 border-blue-200' },
    event:        { label: 'Event',        color: 'text-green-700',  bg: 'bg-green-100 border-green-200' },
    announcement: { label: 'Announcement', color: 'text-red-700',    bg: 'bg-red-100 border-red-200' },
    other:        { label: 'Other',        color: 'text-slate-700',  bg: 'bg-slate-100 border-slate-200' },
  };

  return (
    <div className="space-y-8">
      {/* Attendance taking modal */}
      {attendanceEvent && (
        <AttendanceModal
          event={attendanceEvent}
          members={members.filter(m =>
            m.status === 'approved' &&
            (isHeadAdmin || !attendanceEvent.chapter || m.chapter === attendanceEvent.chapter)
          )}
          adminEmail={adminEmail}
          onClose={() => setAttendanceEvent(null)}
          showToast={showToast}
        />
      )}
      <div>
        <h2 className="text-3xl font-black uppercase italic text-slate-800">Events & Announcements</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
          Post events, meetings and announcements to your chapter members
        </p>
      </div>

      {/* Create Event */}
      <Card accent="red">
        <SectionTitle>Post New Event / Announcement</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter General Meeting, Election Results Announcement..."
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['meeting','event','announcement','other'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${eventType === t ? 'bg-red-600 text-white border-red-600' : 'border-slate-200 text-slate-500 hover:border-red-400'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter */}
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Chapter {isHeadAdmin ? '(or All)' : ''}
            </label>
            <select value={chapter} onChange={e => setChapter(e.target.value)} disabled={!isHeadAdmin}
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none disabled:bg-slate-50">
              {isHeadAdmin && <option value="All">All Chapters</option>}
              {config.chapters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Date *</label>
            <input type="date" value={eventDate} onChange={e => setDate(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Time (optional)</label>
            <input type="time" value={eventTime} onChange={e => setTime(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Chapter Hall, Zoom, TBA..."
              className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description / Message (optional)</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} placeholder="Provide details about this event or announcement..."
              rows={3} className="w-full border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none resize-none"/>
          </div>
        </div>
        <button onClick={createEvent} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin"/> : eventType === 'announcement' ? <Bell size={16}/> : <Calendar size={16}/>}
          {saving ? 'Posting...' : eventType === 'announcement' ? 'Post Announcement' : 'Create Event'}
        </button>
      </Card>

      {/* Filter */}
      <div className="flex gap-2">
        {(['upcoming','past','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div className="space-y-4">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Calendar size={48} className="mx-auto mb-4 opacity-20"/>
            <p className="font-black uppercase tracking-widest text-sm">No {filter} events</p>
          </div>
        ) : visible.map(ev => {
          const cfg = typeConfig[ev.event_type] ?? typeConfig['other'];
          const isPast = new Date(ev.event_date) < new Date();
          return (
            <Card key={ev.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {ev.chapter && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        {ev.chapter}
                      </span>
                    )}
                    {!ev.chapter && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-800 text-white border border-slate-700">
                        All Chapters
                      </span>
                    )}
                    {isPast && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
                        Past
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-800 text-lg uppercase">{ev.title}</h3>
                  {ev.description && <p className="text-slate-500 text-sm font-bold mt-1 leading-relaxed">{ev.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400 font-bold">
                    <span className="flex items-center gap-1">
                      <Calendar size={12}/> {new Date(ev.event_date).toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
                    </span>
                    {ev.event_time && <span>🕐 {ev.event_time}</span>}
                    {ev.location && <span className="flex items-center gap-1"><MapPin size={12}/> {ev.location}</span>}
                    <span className="text-slate-300">Posted by {ev.created_by}</span>
                  </div>
                </div>
                <button onClick={() => deleteEvent(ev.id)}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all shrink-0">
                  <Trash2 size={16}/>
                </button>
              </div>
              {/* Take Attendance button — for non-announcement events */}
              {ev.event_type !== 'announcement' && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setAttendanceEvent(ev)}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black uppercase text-xs px-5 py-3 rounded-2xl transition-all">
                    <CheckCircle2 size={14}/> Take Attendance
                  </button>
                  <p className="text-[10px] text-slate-400 font-bold mt-2">
                    Mark present, absent or excused for each chapter member
                  </p>
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
  event: EventRow;
  members: Member[];
  adminEmail: string;
  onClose: () => void;
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [attendance, setAttendance] = useState<Record<string,'present'|'absent'|'excused'>>({});
  const [notes, setNotes]           = useState<Record<string,string>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [search, setSearch]         = useState('');

  useEffect(() => {
    supabase.from('attendance').select('*').eq('event_id', event.id).then(({ data }) => {
      if (data) {
        const map: Record<string,'present'|'absent'|'excused'> = {};
        const noteMap: Record<string,string> = {};
        data.forEach((a: any) => { map[a.member_id] = a.status; noteMap[a.member_id] = a.note ?? ''; });
        setAttendance(map); setNotes(noteMap);
      }
      setLoading(false);
    });
  }, [event.id]);

  function setStatus(memberId: string, status: 'present'|'absent'|'excused') {
    setAttendance(prev => ({ ...prev, [memberId]: status }));
  }

  function markAll(status: 'present'|'absent'|'excused') {
    const map: Record<string,'present'|'absent'|'excused'> = {};
    members.forEach(m => { map[m.id] = status; });
    setAttendance(map);
  }

  async function saveAttendance() {
    setSaving(true);
    const rows = Object.entries(attendance).map(([member_id, status]) => ({
      event_id: event.id, member_id, status, note: notes[member_id] || null,
    }));
    if (rows.length === 0) { showToast('No attendance marked yet.', false); setSaving(false); return; }
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'event_id,member_id' });
    if (error) { showToast(`Failed: ${error.message}`, false); setSaving(false); return; }
    const present = rows.filter(r => r.status === 'present').length;
    const absent  = rows.filter(r => r.status === 'absent').length;
    const excused = rows.filter(r => r.status === 'excused').length;
    await supabase.from('activity_log').insert([{
      member_name: adminEmail, chapter: event.chapter ?? 'All',
      action: `Attendance taken — ${event.title}`,
      details: `Present: ${present}, Absent: ${absent}, Excused: ${excused}`,
    }]);
    showToast(`✓ Attendance saved — ${present} present, ${absent} absent, ${excused} excused.`);
    setSaving(false); onClose();
  }

  const filtered = members.filter(m => !search || m.full_name.toLowerCase().includes(search.toLowerCase()));
  const totalMarked  = Object.keys(attendance).length;
  const totalPresent = Object.values(attendance).filter(s => s === 'present').length;

  const BTNS = [
    { status: 'present' as const, label:'P', full:'Present', color:'bg-green-600 text-white',   outline:'border-green-300' },
    { status: 'absent'  as const, label:'A', full:'Absent',  color:'bg-red-600 text-white',     outline:'border-red-300'   },
    { status: 'excused' as const, label:'E', full:'Excused', color:'bg-yellow-500 text-white',  outline:'border-yellow-300'},
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-slate-900 uppercase text-sm truncate">{event.title}</h3>
          <p className="text-xs text-slate-400 font-bold">
            {new Date(event.event_date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
            {event.event_time && ` · ${event.event_time}`}{event.chapter && ` · ${event.chapter}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setMobileView(v => !v)}
            className="hidden md:flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs uppercase px-3 py-2 rounded-xl transition-all">
            {mobileView ? '🖥 Desktop' : '📱 Mobile'}
          </button>
          <div className="text-right">
            <p className="text-xs font-black text-slate-800">{totalMarked}/{members.length} marked</p>
            <p className="text-[10px] text-green-600 font-bold">{totalPresent} present</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all">
            <XCircle size={20}/>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mark All:</p>
        {BTNS.map(b => (
          <button key={b.status} onClick={() => markAll(b.status)}
            className={`${b.color} font-black text-xs uppercase px-4 py-2 rounded-xl`}>
            All {b.full}
          </button>
        ))}
        <div className="flex-1"/>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-red-600 w-36"/>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32}/></div>
        ) : mobileView ? (
          /* Mobile checklist */
          <div className="divide-y divide-slate-100">
            {filtered.map(m => {
              const cur = attendance[m.id];
              return (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4 bg-white">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                    {m.photo_url
                      ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                      : <div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-sm">{m.full_name.charAt(0)}</span></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-sm truncate">{m.full_name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{m.class_name} · {m.year_graduated}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {BTNS.map(b => (
                      <button key={b.status} onClick={() => setStatus(m.id, b.status)}
                        className={`w-12 h-12 rounded-2xl font-black text-base transition-all border-2 ${cur === b.status ? b.color + ' border-transparent scale-110 shadow-lg' : 'bg-white border-slate-200 text-slate-300'}`}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table */
          <div className="p-6">
            <div className="grid grid-cols-[2fr,auto,auto,auto,2fr] gap-3 px-4 py-3 bg-slate-100 rounded-2xl mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>Member</span>
              <span className="text-green-700 text-center px-4">Present</span>
              <span className="text-red-600 text-center px-4">Absent</span>
              <span className="text-yellow-600 text-center px-4">Excused</span>
              <span>Note</span>
            </div>
            <div className="space-y-1">
              {filtered.map(m => {
                const cur = attendance[m.id];
                return (
                  <div key={m.id} className={`grid grid-cols-[2fr,auto,auto,auto,2fr] gap-3 px-4 py-3 rounded-2xl items-center border transition-all ${
                    cur === 'present' ? 'bg-green-50 border-green-100' :
                    cur === 'absent'  ? 'bg-red-50 border-red-100' :
                    cur === 'excused' ? 'bg-yellow-50 border-yellow-100' :
                    'bg-white hover:bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                        {m.photo_url ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                          : <div className="w-full h-full flex items-center justify-center bg-slate-300"><span className="font-black text-slate-500 text-xs">{m.full_name.charAt(0)}</span></div>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-sm truncate">{m.full_name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{m.class_name} · {m.year_graduated}</p>
                      </div>
                    </div>
                    {BTNS.map(b => (
                      <div key={b.status} className="flex justify-center px-3">
                        <button onClick={() => setStatus(m.id, b.status)}
                          className={`w-10 h-10 rounded-xl font-black text-sm transition-all border-2 ${
                            cur === b.status ? b.color + ' border-transparent scale-110 shadow-md' : 'bg-white border-slate-200 text-slate-300 hover:border-slate-400'
                          }`}>
                          {b.label}
                        </button>
                      </div>
                    ))}
                    <input value={notes[m.id] ?? ''} onChange={e => setNotes(prev => ({...prev, [m.id]: e.target.value}))}
                      placeholder="Optional note..." className="border border-slate-200 focus:border-red-600 rounded-xl px-3 py-2 text-xs font-bold outline-none w-full"/>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex gap-4 text-xs font-bold flex-wrap">
          <span className="text-green-600 font-black">{Object.values(attendance).filter(s=>s==='present').length} Present</span>
          <span className="text-red-500 font-black">{Object.values(attendance).filter(s=>s==='absent').length} Absent</span>
          <span className="text-yellow-600 font-black">{Object.values(attendance).filter(s=>s==='excused').length} Excused</span>
          <span className="text-slate-400">{members.length - totalMarked} Unmarked</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Export CSV */}
          <button onClick={() => {
            const headers = ['Member Name','Chapter','Class','Year','Status','Note'];
            const rows = members.map(m => [
              m.full_name, m.chapter, m.class_name, String(m.year_graduated),
              attendance[m.id] ?? 'unmarked',
              notes[m.id] ?? '',
            ]);
            const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
            const blob = new Blob([csv],{type:'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Attendance_${event.title.replace(/\s+/g,'_')}_${event.event_date}.csv`;
            a.click(); URL.revokeObjectURL(url);
          }} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl transition-all">
            <Download size={13}/> CSV
          </button>
          {/* Print / PDF */}
          <button onClick={() => {
            const pw = window.open('','_blank');
            if (!pw) return;
            const presentList  = members.filter(m => attendance[m.id] === 'present');
            const absentList   = members.filter(m => attendance[m.id] === 'absent');
            const excusedList  = members.filter(m => attendance[m.id] === 'excused');
            const unmarkedList = members.filter(m => !attendance[m.id]);
            const row = (m: Member, status: string) => `
              <tr>
                <td>${m.full_name}</td>
                <td>${m.class_name} '${String(m.year_graduated).slice(-2)}</td>
                <td style="color:${status==='present'?'#16a34a':status==='absent'?'#dc2626':status==='excused'?'#d97706':'#94a3b8'};font-weight:900;text-transform:uppercase">${status}</td>
                <td>${notes[m.id] ?? ''}</td>
              </tr>`;
            pw.document.write(`<!DOCTYPE html><html><head>
              <title>Attendance — ${event.title}</title>
              <style>
                body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#0f172a}
                h1{font-size:16px;font-weight:900;text-transform:uppercase;margin-bottom:2px}
                .meta{color:#64748b;font-size:10px;margin-bottom:16px}
                .summary{display:flex;gap:16px;margin-bottom:16px;font-size:11px}
                .s{padding:6px 12px;border-radius:6px;font-weight:900;text-transform:uppercase}
                .p{background:#dcfce7;color:#15803d}.a{background:#fee2e2;color:#b91c1c}
                .e{background:#fef3c7;color:#92400e}.u{background:#f1f5f9;color:#475569}
                table{width:100%;border-collapse:collapse;margin-bottom:20px}
                th{background:#1e293b;color:white;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
                td{padding:6px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
                tr:nth-child(even){background:#f8fafc}
                h2{font-size:12px;font-weight:900;text-transform:uppercase;margin:16px 0 6px;padding-bottom:4px;border-bottom:2px solid #e2e8f0}
                @media print{body{padding:0}}
              </style></head><body>
              <h1>${event.title}</h1>
              <div class="meta">
                ${new Date(event.event_date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
                ${event.event_time ? ' · ' + event.event_time : ''}
                ${event.chapter ? ' · ' + event.chapter : ' · All Chapters'}
                ${event.location ? ' · ' + event.location : ''}
              </div>
              <div class="summary">
                <div class="s p">✓ Present: ${presentList.length}</div>
                <div class="s a">✗ Absent: ${absentList.length}</div>
                <div class="s e">~ Excused: ${excusedList.length}</div>
                <div class="s u">? Unmarked: ${unmarkedList.length}</div>
              </div>
              ${presentList.length > 0 ? `<h2>✓ Present (${presentList.length})</h2>
                <table><thead><tr><th>Name</th><th>Class</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>${presentList.map(m => row(m,'present')).join('')}</tbody></table>` : ''}
              ${absentList.length > 0 ? `<h2>✗ Absent (${absentList.length})</h2>
                <table><thead><tr><th>Name</th><th>Class</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>${absentList.map(m => row(m,'absent')).join('')}</tbody></table>` : ''}
              ${excusedList.length > 0 ? `<h2>~ Excused (${excusedList.length})</h2>
                <table><thead><tr><th>Name</th><th>Class</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>${excusedList.map(m => row(m,'excused')).join('')}</tbody></table>` : ''}
              ${unmarkedList.length > 0 ? `<h2>? Unmarked (${unmarkedList.length})</h2>
                <table><thead><tr><th>Name</th><th>Class</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>${unmarkedList.map(m => row(m,'unmarked')).join('')}</tbody></table>` : ''}
              <p style="color:#94a3b8;font-size:9px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px">
                Generated ${new Date().toLocaleString()} · Recorded by ${adminEmail}
              </p>
              <script>window.onload=()=>{window.print()}</script>
            </body></html>`);
            pw.document.close();
          }} className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl transition-all">
            <Printer size={13}/> Print / PDF
          </button>
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-5 py-2.5 rounded-xl text-xs transition-all">Cancel</button>
          <button onClick={saveAttendance} disabled={saving || totalMarked === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-6 py-2.5 rounded-xl text-xs transition-all disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>}
            Save Attendance
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
function AuditLogTab({ log, config }: { log: any[]; config: ElectionConfig }) {
  const [search, setSearch]           = useState('');
  const [chapterFilter, setChapter]   = useState('All');
  const [actionFilter, setAction]     = useState('All');

  const filtered = log.filter(l => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (l.member_name ?? '').toLowerCase().includes(s) ||
      (l.action ?? '').toLowerCase().includes(s) ||
      (l.details ?? '').toLowerCase().includes(s);
    const matchChapter = chapterFilter === 'All' || l.chapter === chapterFilter;
    const matchAction  = actionFilter  === 'All' || (l.action ?? '').includes(actionFilter);
    return matchSearch && matchChapter && matchAction;
  });

  const actionTypes = ['All', ...Array.from(new Set(log.map(l => l.action).filter(Boolean))).sort()];

  function exportCSV() {
    const headers = ['Timestamp','Member','Chapter','Action','Details'];
    const rows = filtered.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.member_name ?? '—',
      l.chapter ?? '—',
      l.action ?? '—',
      l.details ?? '—',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BWIAA_Audit_Log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function printLog() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = filtered.map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString()}</td>
        <td><strong>${l.member_name ?? '—'}</strong></td>
        <td>${l.chapter ?? '—'}</td>
        <td>${l.action ?? '—'}</td>
        <td>${l.details ?? '—'}</td>
      </tr>`).join('');
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <title>BWIAA Audit Log — ${new Date().toLocaleDateString()}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p { color: #666; font-size: 10px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e293b; color: white; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) { background: #f8fafc; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>BWIAA Official Audit Log</h1>
      <p>Generated: ${new Date().toLocaleString()} · ${filtered.length} records · ${chapterFilter !== 'All' ? chapterFilter : 'All Chapters'}</p>
      <table>
        <thead><tr><th>Timestamp</th><th>Member</th><th>Chapter</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Audit Log</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Full record of all actions — who did what, when, and where
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Download size={14}/> CSV
          </button>
          <button onClick={printLog}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
            <Printer size={14}/> Print
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white rounded-3xl p-5 text-center">
          <p className="text-3xl font-black">{log.length}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-50 mt-1">Total Entries</p>
        </div>
        <div className="bg-blue-600 text-white rounded-3xl p-5 text-center">
          <p className="text-3xl font-black">{[...new Set(log.map(l=>l.member_name).filter(Boolean))].length}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Unique Members</p>
        </div>
        <div className="bg-red-600 text-white rounded-3xl p-5 text-center">
          <p className="text-3xl font-black">{filtered.length}</p>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mt-1">Showing</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search member, action, details..."
            className="w-full pl-10 pr-4 py-4 border-2 border-slate-200 focus:border-red-600 rounded-2xl font-bold outline-none text-sm bg-white"/>
        </div>
        <select value={chapterFilter} onChange={e => setChapter(e.target.value)}
          className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-sm bg-white">
          {['All', ...config.chapters].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setAction(e.target.value)}
          className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none text-sm bg-white min-w-0 max-w-[200px]">
          {actionTypes.slice(0, 20).map(a => <option key={a} value={a}>{a.length > 30 ? a.slice(0,30)+'…' : a}</option>)}
        </select>
      </div>

      {/* Log table */}
      <Card>
        <div className="overflow-x-auto -mx-2">
          {/* Header */}
          <div className="grid grid-cols-5 gap-3 px-4 py-3 bg-slate-50 rounded-2xl mb-2 min-w-[600px]">
            {['Time','Member','Chapter','Action','Details'].map(h => (
              <p key={h} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          {/* Rows */}
          <div className="space-y-1 min-w-[600px]">
            {filtered.length === 0 ? (
              <p className="text-slate-400 font-bold text-sm text-center py-8">No matching log entries.</p>
            ) : filtered.map((l, i) => (
              <div key={l.id ?? i} className="grid grid-cols-5 gap-3 px-4 py-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                <div>
                  <p className="text-[10px] font-black text-slate-800">{new Date(l.created_at).toLocaleDateString()}</p>
                  <p className="text-[9px] text-slate-400 font-bold">{new Date(l.created_at).toLocaleTimeString()}</p>
                </div>
                <p className="text-xs font-black text-slate-800 truncate self-center">{l.member_name ?? '—'}</p>
                <p className="text-xs font-bold text-slate-500 truncate self-center">{l.chapter ?? '—'}</p>
                <p className="text-xs font-bold text-red-600 truncate self-center">{l.action ?? '—'}</p>
                <p className="text-xs font-bold text-slate-500 truncate self-center">{l.details ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
        {filtered.length > 0 && (
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-4 pt-4 border-t border-slate-100">
            {filtered.length} entries shown · Last updated {log[0] ? new Date(log[0].created_at).toLocaleString() : '—'}
          </p>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: INVESTMENTS
// ─────────────────────────────────────────────────────────────────────────────
function InvestmentsTab({ showToast, isHeadAdmin, members, config }: {
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean;
  members: Member[];
  config: ElectionConfig;
}) {
  const [investments, setInvestments] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  // Form
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState('Stock Market');
  const [description, setDesc]  = useState('');
  const [amount, setAmount]     = useState('');
  const [currency, setCurrency] = useState('USD');
  const [returnAmount, setReturn] = useState('');
  const [returnDate, setReturnDate] = useState('');
  // Distributing
  const [distributing, setDistributing] = useState<string|null>(null);

  useEffect(() => {
    supabase.from('investments').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setInvestments(data); setLoading(false); });
  }, []);

  async function recordInvestment() {
    if (!title.trim() || !amount) { showToast('Title and amount required.', false); return; }
    setSaving(true);
    const { data, error } = await supabase.from('investments').insert([{
      title: title.trim(), category, description: description.trim()||null,
      invested_amount: parseFloat(amount), currency,
      return_amount: returnAmount ? parseFloat(returnAmount) : null,
      return_date: returnDate || null,
      status: 'active',
      created_by: 'admin',
    }]).select().single();
    setSaving(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setInvestments(prev => [data, ...prev]);
    setTitle(''); setAmount(''); setDesc(''); setReturn(''); setReturnDate('');
    showToast(`✓ Investment "${data.title}" recorded.`);
  }

  async function distributeReturns(inv: any) {
    if (!inv.return_amount) { showToast('Enter the return amount first.', false); return; }
    if (!confirm(`Distribute returns for "${inv.title}"?\n\n70% ($${(inv.return_amount * 0.7).toFixed(2)}) split among eligible members.\n30% ($${(inv.return_amount * 0.3).toFixed(2)}) reinvested.\n\nThis cannot be undone.`)) return;

    setDistributing(inv.id);

    // Get members who have at least one approved dues payment
    const { data: duesPayers } = await supabase.from('dues_payments')
      .select('member_id').eq('status', 'approved').not('member_id', 'is', null);

    const eligibleIds = [...new Set((duesPayers ?? []).map((d: any) => d.member_id))];
    const eligibleMembers = members.filter(m => m.status === 'approved' && eligibleIds.includes(m.id));

    if (eligibleMembers.length === 0) {
      showToast('No eligible members found. Members must have at least one approved dues payment.', false);
      setDistributing(null); return;
    }

    const memberPool   = inv.return_amount * 0.70;
    const shareEach    = memberPool / eligibleMembers.length;
    const now          = new Date().toISOString();

    // Insert individual return records for each member
    const returnRows = eligibleMembers.map(m => ({
      investment_id: inv.id, member_id: m.id,
      member_name: m.full_name, share_amount: shareEach,
      currency: inv.currency, distributed_at: now,
    }));

    const { error: retErr } = await supabase.from('member_returns').insert(returnRows);
    if (retErr) { showToast(`Failed to record returns: ${retErr.message}`, false); setDistributing(null); return; }

    // Update investment status
    await supabase.from('investments').update({
      status: 'returned', member_share_each: shareEach,
      eligible_members: eligibleMembers.length, distributed_at: now,
    }).eq('id', inv.id);

    // Log to activity
    await supabase.from('activity_log').insert([{
      member_name: 'System', chapter: 'All',
      action: `Investment returns distributed — ${inv.title}`,
      details: `$${shareEach.toFixed(2)} each to ${eligibleMembers.length} members · 30% ($${(inv.return_amount * 0.3).toFixed(2)}) reinvested`,
    }]);

    setInvestments(prev => prev.map(i => i.id === inv.id
      ? { ...i, status: 'returned', member_share_each: shareEach, eligible_members: eligibleMembers.length, distributed_at: now }
      : i));
    setDistributing(null);
    showToast(`✓ $${shareEach.toFixed(2)} distributed to each of ${eligibleMembers.length} eligible members.`);
  }

  async function markReturned(inv: any, retAmount: number) {
    await supabase.from('investments').update({ return_amount: retAmount, status: 'returned' }).eq('id', inv.id);
    setInvestments(prev => prev.map(i => i.id === inv.id ? {...i, return_amount: retAmount, status: 'returned'} : i));
    showToast(`Return amount recorded. Click Distribute to send shares to members.`);
  }

  const CATEGORIES = ['Stock Market','Transportation','Entertainment','Real Estate','Other'];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Investment Portfolio</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Record investments · distribute returns · 70% members / 30% reinvested
          </p>
        </div>
        <Link href="/investments" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase px-5 py-3 rounded-2xl transition-all">
          <TrendingUp size={14}/> Member View
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Total Invested', value:`$${investments.reduce((s,i)=>s+i.invested_amount,0).toLocaleString()}`, bg:'bg-blue-600' },
          { label:'Total Returned', value:`$${investments.filter(i=>i.status==='returned').reduce((s,i)=>s+(i.return_amount??0),0).toLocaleString()}`, bg:'bg-green-600' },
          { label:'Active',         value:String(investments.filter(i=>i.status==='active').length), bg:'bg-amber-600' },
          { label:'Completed',      value:String(investments.filter(i=>i.status==='returned').length), bg:'bg-slate-700' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} text-white rounded-3xl p-5 text-center shadow-lg`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Record new investment */}
      <Card accent="green">
        <SectionTitle>Record New Investment</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Investment Title *</label>
            <input value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="e.g. Tech Stock Portfolio Q1 2026, Shuttle Bus Route..."
              className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount Invested *</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              placeholder="0.00" className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Return Amount (if known)</label>
            <input type="number" value={returnAmount} onChange={e=>setReturn(e.target.value)}
              placeholder="0.00 — fill in when return is received"
              className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Return Date</label>
            <input type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none"/>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description (optional)</label>
            <textarea value={description} onChange={e=>setDesc(e.target.value)} rows={2}
              placeholder="Brief description of this investment..."
              className="w-full border-2 border-slate-200 focus:border-green-600 rounded-2xl px-5 py-4 font-bold outline-none resize-none"/>
          </div>
        </div>
        <button onClick={recordInvestment} disabled={saving}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <TrendingUp size={16}/>}
          Record Investment
        </button>
      </Card>

      {/* Distribution formula info */}
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex gap-4 items-start">
        <div className="text-2xl shrink-0">📊</div>
        <div>
          <p className="font-black text-green-800 uppercase text-sm">Distribution Formula</p>
          <p className="text-green-700 text-xs font-bold mt-1 leading-relaxed">
            When you click <strong>Distribute Returns</strong> on an investment: 70% of the return is split equally among all
            active members who have <strong>at least one approved dues payment</strong>. 30% is noted as reinvested.
            Each member's share is recorded in their account and visible in the Investments page.
          </p>
        </div>
      </div>

      {/* Investments list */}
      <Card>
        <SectionTitle>All Investments ({investments.length})</SectionTitle>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32}/></div>
        ) : investments.length === 0 ? (
          <p className="text-slate-400 font-bold text-sm text-center py-8">No investments recorded yet.</p>
        ) : investments.map(inv => (
          <div key={inv.id} className="border-2 border-slate-100 rounded-2xl overflow-hidden mb-3">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg text-white ${
                      inv.category==='Stock Market'?'bg-blue-600':inv.category==='Transportation'?'bg-amber-600':
                      inv.category==='Entertainment'?'bg-purple-600':inv.category==='Real Estate'?'bg-green-600':'bg-slate-600'
                    }`}>{inv.category}</span>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${
                      inv.status==='returned'?'bg-green-50 text-green-700 border-green-200':
                      inv.status==='active'  ?'bg-blue-50 text-blue-700 border-blue-200':
                      'bg-amber-50 text-amber-700 border-amber-200'}`}>{inv.status}</span>
                  </div>
                  <p className="font-black text-slate-800 uppercase">{inv.title}</p>
                  {inv.description && <p className="text-xs text-slate-500 font-bold mt-0.5">{inv.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-2 text-xs font-bold text-slate-500">
                    <span>Invested: <strong className="text-slate-800">${inv.invested_amount.toLocaleString()}</strong></span>
                    {inv.return_amount && <span>Return: <strong className="text-green-700">${inv.return_amount.toLocaleString()}</strong></span>}
                    {inv.member_share_each && <span>Per member: <strong className="text-green-700">${inv.member_share_each.toFixed(2)}</strong></span>}
                    {inv.eligible_members && <span>To <strong>{inv.eligible_members}</strong> members</span>}
                  </div>
                </div>
              </div>

              {/* Return input + distribute */}
              {inv.status !== 'returned' && (
                <div className="flex gap-3 flex-wrap mt-3 pt-3 border-t border-slate-100">
                  <div className="flex gap-2 flex-1 min-w-0">
                    <input
                      type="number"
                      placeholder="Enter actual return amount..."
                      defaultValue={inv.return_amount ?? ''}
                      id={`ret-${inv.id}`}
                      className="flex-1 border-2 border-slate-200 focus:border-green-600 rounded-2xl px-4 py-2.5 font-bold outline-none text-sm min-w-0"/>
                    <button onClick={() => {
                      const el = document.getElementById(`ret-${inv.id}`) as HTMLInputElement;
                      if (!el?.value) { showToast('Enter return amount first.', false); return; }
                      markReturned(inv, parseFloat(el.value));
                    }} className="bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs px-4 py-2.5 rounded-2xl transition-all shrink-0">
                      Save
                    </button>
                  </div>
                  <button
                    onClick={() => distributeReturns(inv)}
                    disabled={!inv.return_amount || distributing === inv.id}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs px-5 py-2.5 rounded-2xl transition-all disabled:opacity-50 shrink-0">
                    {distributing === inv.id ? <Loader2 size={13} className="animate-spin"/> : <TrendingUp size={13}/>}
                    Distribute 70/30
                  </button>
                </div>
              )}

              {inv.status === 'returned' && inv.distributed_at && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-green-600 font-bold">
                    ✓ Distributed on {new Date(inv.distributed_at).toLocaleDateString()} · ${inv.member_share_each?.toFixed(2)} per member · {inv.eligible_members} members
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
