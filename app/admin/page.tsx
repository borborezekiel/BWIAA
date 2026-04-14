"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, LogOut, Loader2, BarChart2, Users, UserCheck,
  UserX, List, Settings, PlusCircle, Trash2, Trophy, Activity,
  CheckCircle2, XCircle, Terminal, Crown, Download, Printer, FileText, Sliders,
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

// ─── Dynamic Config (loaded from election_settings, overrides these defaults) ──
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const DEFAULT_CONFIG = {
  org_name:       "BWIAA",
  election_title: "National Alumni Election",
  election_year:  "2026",
  currency:       "USD",
  currency_symbol:"$",
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

type Tab = "overview" | "results" | "candidates" | "voters" | "roster" | "admins" | "applications" | "settings";

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
  const [config, setConfig]         = useState<ElectionConfig>(DEFAULT_CONFIG);

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
      if (lowerEmail === HEAD_ADMIN_EMAIL.toLowerCase()) {
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
    const [v, c, r, b, a, settingsRes, ap] = await Promise.all([
      supabase.from('votes').select('*').order('created_at', { ascending: false }),
      supabase.from('candidates').select('*').order('position_name'),
      supabase.from('eligible_voters').select('*').order('email'),
      supabase.from('blacklisted_voters').select('*').order('created_at', { ascending: false }),
      supabase.from('election_admins').select('*').order('email'),
      supabase.from('election_settings').select('*'),
      supabase.from('candidate_applications').select('*').order('created_at', { ascending: false }),
    ]);
    if (v.data) setVotes(v.data);
    if (c.data) setCandidates(c.data);
    if (r.data) setRoster(r.data);
    if (b.data) setBlacklist(b.data);
    if (a.data) setAdmins(a.data);
    if (ap.data) setApplications(ap.data);

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
    { id: "overview",     label: "Overview",     icon: Activity },
    { id: "results",      label: "Results",      icon: BarChart2 },
    { id: "candidates",   label: "Candidates",   icon: List },
    { id: "voters",       label: "Voters",       icon: Users },
    { id: "roster",       label: "Roster",       icon: UserCheck },
    { id: "applications", label: `Applications${applications.filter(a=>a.status==='pending').length > 0 ? ` (${applications.filter(a=>a.status==='pending').length})` : ''}`, icon: FileText },
    { id: "admins",       label: "Admins",       icon: Settings, headOnly: true },
    { id: "settings",     label: "Settings",     icon: Settings, headOnly: true },
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
        {activeTab === "roster"        && <RosterTab     roster={roster} setRoster={setRoster} blacklist={blacklist} setBlacklist={setBlacklist} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>}
        {activeTab === "applications"  && <ApplicationsTab applications={applications} setApplications={setApplications} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter} adminEmail={user?.email}/>}
        {activeTab === "admins"   && isHeadAdmin && <AdminsTab admins={admins} setAdmins={setAdmins} showToast={showToast} deadline={deadline} setDeadline={setDeadline}/>}
        {activeTab === "settings" && isHeadAdmin && <SettingsTab config={config} setConfig={setConfig} showToast={showToast}/>}
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
function RosterTab({ roster, setRoster, blacklist, setBlacklist, showToast, isHeadAdmin, myChapter }: {
  roster: EligibleVoter[];
  setRoster: React.Dispatch<React.SetStateAction<EligibleVoter[]>>;
  blacklist: BlacklistedVoter[];
  setBlacklist: React.Dispatch<React.SetStateAction<BlacklistedVoter[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean;
  myChapter: string | null;
}) {
  const [rEmail, setREmail]     = useState('');
  const [rChapter, setRChapter] = useState(myChapter ?? CHAPTERS[0]);
  const [rSaving, setRSaving]   = useState(false);
  const [bEmail, setBEmail]     = useState('');
  const [bReason, setBReason]   = useState('');
  const [bSaving, setBSaving]   = useState(false);

  const visibleRoster = isHeadAdmin ? roster : roster.filter(r => r.chapter === myChapter);

  async function addToRoster() {
    const email = rEmail.trim().toLowerCase();
    if (!email) { showToast("Email required.", false); return; }
    setRSaving(true);
    const { data, error } = await supabase.from('eligible_voters').insert([{ email, chapter: rChapter }]).select().single();
    setRSaving(false);
    if (error) {
      const isDupe = error.code === '23505' || error.message.toLowerCase().includes('unique') || error.message.toLowerCase().includes('duplicate');
      showToast(isDupe ? "Already on roster." : `Failed: ${error.message}`, false);
      return;
    }
    setRoster(prev => [...prev, data]); setREmail('');
    showToast(`${email} added to roster.`);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <input value={rEmail} onChange={e => setREmail(e.target.value)} placeholder="member@gmail.com"
            className="border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none md:col-span-2"/>
          <select value={rChapter} onChange={e => setRChapter(e.target.value)} disabled={!isHeadAdmin}
            className="border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none disabled:bg-slate-100">
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={addToRoster} disabled={rSaving}
          className="bg-green-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-green-700 transition-all disabled:opacity-50">
          {rSaving ? <Loader2 size={16} className="animate-spin"/> : <UserCheck size={16}/>} Add to Roster
        </button>
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

  async function approve(app: Application) {
    setProcessing(true);
    // Add to candidates table automatically
    const { data: cand, error: candErr } = await supabase.from('candidates').insert([{
      full_name: app.full_name, position_name: app.position_name,
      chapter: app.chapter, photo_url: app.photo_url || null,
    }]).select().single();
    if (candErr) { showToast(`Failed to add candidate: ${candErr.message}`, false); setProcessing(false); return; }

    // Update application status
    const { error } = await supabase.from('candidate_applications').update({
      status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }

    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved' } : a));
    setCandidates(prev => [...prev, cand]);
    setSelected(null);
    showToast(`✓ ${app.full_name} approved and added as ${app.position_name} candidate for ${app.chapter}.`);
  }

  async function reject(app: Application) {
    if (!rejReason.trim()) { showToast('Please provide a rejection reason.', false); return; }
    setProcessing(true);
    const { error } = await supabase.from('candidate_applications').update({
      status: 'rejected', rejection_reason: rejReason.trim(),
      reviewed_at: new Date().toISOString(), reviewed_by: adminEmail,
    }).eq('id', app.id);
    setProcessing(false);
    if (error) { showToast(`Failed: ${error.message}`, false); return; }
    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'rejected', rejection_reason: rejReason } : a));
    setSelected(null); setRejReason('');
    showToast(`${app.full_name}'s application rejected.`);
  }

  const statusBadge = (s: string) => ({
    pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    approved: 'bg-green-100 text-green-700 border-green-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  }[s] ?? 'bg-slate-100 text-slate-700');

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
                  <span className="font-black text-slate-800 text-right max-w-[55%]">{v}</span>
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

      <div>
        <h2 className="text-3xl font-black uppercase italic text-slate-800">Candidate Applications</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
          Review, approve or reject candidate registrations
        </p>
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
                <p className="text-[10px] text-slate-400 font-bold">{new Date(app.created_at).toLocaleDateString()}</p>
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
function SettingsTab({ config, setConfig, showToast }: {
  config: ElectionConfig;
  setConfig: React.Dispatch<React.SetStateAction<ElectionConfig>>;
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [local, setLocal]   = useState<ElectionConfig>(JSON.parse(JSON.stringify(config)));
  const [saving, setSaving] = useState(false);
  const [newChapter, setNewChapter] = useState('');

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
      { key: 'org_name',        value: local.org_name },
      { key: 'election_title',  value: local.election_title },
      { key: 'election_year',   value: local.election_year },
      { key: 'currency',        value: local.currency },
      { key: 'currency_symbol', value: local.currency_symbol },
      { key: 'chapters',        value: JSON.stringify(local.chapters) },
      { key: 'positions_fees',  value: JSON.stringify(local.positions_fees) },
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