"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, LogOut, Loader2, BarChart2, Users, UserCheck,
  UserX, List, Settings, PlusCircle, Trash2, Trophy, Activity,
  CheckCircle2, XCircle, Terminal, AlertTriangle, Crown,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate {
  id: number;
  full_name: string;
  position_name: string;
  chapter: string;
}
interface VoteRow {
  id: number;
  voter_name: string;
  voter_id: string;
  position_name: string;
  candidate_name: string;
  chapter: string;
  class_year: string;
  created_at: string;
}
interface EligibleVoter {
  id: number;
  email: string;
  chapter: string;
}
interface BlacklistedVoter {
  id: number;
  email: string;
  reason: string;
  created_at: string;
}
interface ElectionAdmin {
  id: number;
  email: string;
  chapter: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const CHAPTERS = [
  "Harbel and RIA","Monrovia","Buchanan","Gbarnga","Kakata",
  "Voinjama","Zwedru","Robertsport","Greenville","Harper","Sanniquellie","Cestos City",
];

type Tab = "overview" | "results" | "candidates" | "voters" | "roster" | "admins";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [user, setUser]                   = useState<any>(null);
  const [isHeadAdmin, setIsHeadAdmin]     = useState(false);
  const [myAdminChapter, setMyAdminChapter] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized]   = useState(false);
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<Tab>("overview");

  // Shared data
  const [votes, setVotes]         = useState<VoteRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roster, setRoster]       = useState<EligibleVoter[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistedVoter[]>([]);
  const [admins, setAdmins]       = useState<ElectionAdmin[]>([]);

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Auth: head admin or election_admins table ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser(user);

      const lowerEmail = user.email?.toLowerCase();

      if (lowerEmail === HEAD_ADMIN_EMAIL.toLowerCase()) {
        setIsHeadAdmin(true);
        setIsAuthorized(true);
      } else {
        const { data } = await supabase
          .from('election_admins')
          .select('email, chapter')
          .eq('email', lowerEmail)
          .maybeSingle();
        if (data) {
          setIsAuthorized(true);
          setMyAdminChapter(data.chapter);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  // ── Load data once authorized ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthorized) return;
    fetchAll();

    // Realtime: new votes appear instantly
    const live = supabase.channel('admin-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        setVotes(prev => [payload.new as VoteRow, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(live); };
  }, [isAuthorized]);

  async function fetchAll() {
    const [v, c, r, b, a] = await Promise.all([
      supabase.from('votes').select('*').order('created_at', { ascending: false }),
      supabase.from('candidates').select('*').order('position_name'),
      supabase.from('eligible_voters').select('*').order('email'),
      supabase.from('blacklisted_voters').select('*').order('created_at', { ascending: false }),
      supabase.from('election_admins').select('*').order('email'),
    ]);
    if (v.data) setVotes(v.data);
    if (c.data) setCandidates(c.data);
    if (r.data) setRoster(r.data);
    if (b.data) setBlacklist(b.data);
    if (a.data) setAdmins(a.data);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-4">
      <Loader2 className="animate-spin text-red-600" size={40} />
      <span className="font-black uppercase tracking-widest text-sm">Verifying Access...</span>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-6 p-8 text-center">
      <XCircle size={64} className="text-red-600" />
      <h1 className="text-3xl font-black uppercase italic">Not Signed In</h1>
      <Link href="/" className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase">
        Go to Voting Page
      </Link>
    </div>
  );

  if (!isAuthorized) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-6 p-8 text-center">
      <ShieldCheck size={64} className="text-red-600" />
      <h1 className="text-3xl font-black uppercase italic">Access Denied</h1>
      <p className="text-slate-400 font-bold">{user.email} is not authorized to access the Command Center.</p>
      <Link href="/" className="bg-slate-700 text-white px-8 py-4 rounded-2xl font-black uppercase">
        Go Back
      </Link>
    </div>
  );

  // Branch admins only see their chapter tabs (no Admins tab)
  const allTabs: { id: Tab; label: string; icon: any; headOnly?: boolean }[] = [
    { id: "overview",   label: "Overview",   icon: Activity },
    { id: "results",    label: "Results",    icon: BarChart2 },
    { id: "candidates", label: "Candidates", icon: List },
    { id: "voters",     label: "Voters",     icon: Users },
    { id: "roster",     label: "Roster",     icon: UserCheck },
    { id: "admins",     label: "Admins",     icon: Settings, headOnly: true },
  ];
  const tabs = allTabs.filter(t => !t.headOnly || isHeadAdmin);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">

      {/* Toast */}
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
              BWIAA Command Center
              <br/>
              <span className="text-[10px] font-bold flex items-center gap-1">
                {isHeadAdmin
                  ? <><Crown size={10} className="text-yellow-400"/> <span className="text-yellow-400">Head Admin</span></>
                  : <span className="text-slate-400">{myAdminChapter} Chapter Admin</span>
                }
                <span className="text-slate-600 mx-1">•</span>
                <span className="text-slate-400">{user.email}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-black uppercase border border-white/10 transition-all">
              ← Voting Page
            </Link>
            <button
              onClick={handleSignOut}
              className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2.5 rounded-xl transition-all border border-red-600/30"
            >
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b-2 border-slate-100 sticky top-[73px] z-30 shadow-sm overflow-x-auto">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-4 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-4 transition-all
                ${activeTab === id
                  ? 'border-red-600 text-red-600 bg-red-50'
                  : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}
            >
              <Icon size={14}/> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-4 pt-10">
        {activeTab === "overview"   && (
          <OverviewTab votes={votes} candidates={candidates} roster={roster} admins={admins} blacklist={blacklist} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>
        )}
        {activeTab === "results"    && (
          <ResultsTab votes={votes} candidates={candidates} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>
        )}
        {activeTab === "candidates" && (
          <CandidatesTab candidates={candidates} setCandidates={setCandidates} showToast={showToast} isHeadAdmin={isHeadAdmin}/>
        )}
        {activeTab === "voters"     && (
          <VotersTab votes={votes} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>
        )}
        {activeTab === "roster"     && (
          <RosterTab roster={roster} setRoster={setRoster} blacklist={blacklist} setBlacklist={setBlacklist} showToast={showToast} isHeadAdmin={isHeadAdmin} myChapter={myAdminChapter}/>
        )}
        {activeTab === "admins" && isHeadAdmin && (
          <AdminsTab admins={admins} setAdmins={setAdmins} showToast={showToast}/>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ children, accent = "slate" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className={`bg-white rounded-[3rem] p-10 shadow-xl border-b-8 border-${accent}-200`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xl font-black uppercase italic mb-6 border-l-8 border-red-600 pl-5">{children}</h3>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ votes, candidates, roster, admins, blacklist, isHeadAdmin, myChapter }: {
  votes: VoteRow[]; candidates: Candidate[]; roster: EligibleVoter[];
  admins: ElectionAdmin[]; blacklist: BlacklistedVoter[];
  isHeadAdmin: boolean; myChapter: string | null;
}) {
  const scopedVotes = isHeadAdmin ? votes : votes.filter(v => v.chapter === myChapter);
  const uniqueVoters = new Set(scopedVotes.map(v => v.voter_id)).size;

  const stats = isHeadAdmin
    ? [
        { label: "Total Ballots Cast",  value: votes.length,      color: "bg-blue-600" },
        { label: "Unique Voters",        value: uniqueVoters,       color: "bg-green-600" },
        { label: "Candidates Running",  value: candidates.length,  color: "bg-purple-600" },
        { label: "Registered Roster",   value: roster.length,      color: "bg-orange-500" },
        { label: "Branch Admins",        value: admins.length,      color: "bg-slate-700" },
        { label: "Blacklisted",          value: blacklist.length,   color: "bg-red-600" },
      ]
    : [
        { label: `${myChapter} Ballots`, value: scopedVotes.length, color: "bg-blue-600" },
        { label: "Unique Voters",         value: uniqueVoters,       color: "bg-green-600" },
      ];

  const chapterBreakdown = CHAPTERS.map(ch => ({
    chapter: ch,
    votes: votes.filter(v => v.chapter === ch).length,
  })).sort((a, b) => b.votes - a.votes);

  const maxVotes = chapterBreakdown[0]?.votes || 1;

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">
        {isHeadAdmin ? 'National Overview' : `${myChapter} Overview`}
      </h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${s.color} text-white rounded-3xl p-8 shadow-lg`}>
            <div className="text-5xl font-black mb-2">{s.value}</div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chapter Participation — head admin only */}
      {isHeadAdmin && (
        <SectionCard>
          <SectionTitle>Chapter Participation</SectionTitle>
          <div className="space-y-4">
            {chapterBreakdown.map(({ chapter, votes: cnt }) => (
              <div key={chapter} className="flex items-center gap-4">
                <div className="w-40 text-xs font-bold uppercase text-slate-500 text-right shrink-0">{chapter}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-700"
                    style={{ width: `${Math.round((cnt / maxVotes) * 100)}%` }}
                  />
                </div>
                <div className="w-10 text-right font-black text-sm text-slate-700">{cnt}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Recent activity */}
      <SectionCard>
        <SectionTitle>Recent Activity</SectionTitle>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
          {scopedVotes.slice(0, 30).map((v, i) => (
            <div key={v.id ?? i} className="flex flex-col md:flex-row justify-between items-start md:items-center py-3 border-b border-slate-100 last:border-0 gap-1">
              <div>
                <span className="text-[9px] font-black uppercase text-blue-500 tracking-widest block">
                  {v.chapter} • {new Date(v.created_at).toLocaleString()}
                </span>
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
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: RESULTS (EC Presentation View)
// ─────────────────────────────────────────────────────────────────────────────
function ResultsTab({ votes, candidates, isHeadAdmin, myChapter }: {
  votes: VoteRow[]; candidates: Candidate[]; isHeadAdmin: boolean; myChapter: string | null;
}) {
  const [filterChapter, setFilterChapter] = useState<string>(
    isHeadAdmin ? "ALL" : (myChapter ?? "ALL")
  );

  const filteredVotes = filterChapter === "ALL" ? votes : votes.filter(v => v.chapter === filterChapter);

  const positions = useMemo(() => {
    const posMap: Record<string, { candidate: string; count: number }[]> = {};
    candidates.forEach(c => {
      if (!posMap[c.position_name]) posMap[c.position_name] = [];
      const cnt = filteredVotes.filter(
        v => v.position_name === c.position_name && v.candidate_name === c.full_name
      ).length;
      posMap[c.position_name].push({ candidate: c.full_name, count: cnt });
    });
    Object.keys(posMap).forEach(pos => posMap[pos].sort((a, b) => b.count - a.count));
    return posMap;
  }, [candidates, filteredVotes]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Election Results</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Live EC Presentation View</p>
        </div>
        {isHeadAdmin && (
          <select
            value={filterChapter}
            onChange={e => setFilterChapter(e.target.value)}
            className="border-2 border-slate-200 rounded-2xl px-5 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white"
          >
            <option value="ALL">🌍 National Aggregate</option>
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
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
                      <span className="font-black text-slate-700">
                        {r.count} <span className="text-slate-400 font-bold text-xs">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isLeader ? 'bg-red-600' : 'bg-slate-300'}`}
                        style={{ width: `${pct}%` }}
                      />
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
          <p className="font-bold uppercase tracking-widest text-sm">No results yet. Add candidates and collect votes.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────
function CandidatesTab({ candidates, setCandidates, showToast, isHeadAdmin }: {
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  showToast: (m: string, ok?: boolean) => void;
  isHeadAdmin: boolean;
}) {
  const [name, setName]         = useState('');
  const [position, setPosition] = useState('');
  const [chapter, setChapter]   = useState('National');
  const [saving, setSaving]     = useState(false);

  async function addCandidate() {
    if (!name.trim() || !position.trim()) { showToast("Name and position required.", false); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('candidates')
      .insert([{ full_name: name.trim(), position_name: position.trim(), chapter }])
      .select()
      .single();
    setSaving(false);
    if (error) { showToast("Failed to add candidate.", false); return; }
    setCandidates(prev => [...prev, data]);
    setName(''); setPosition('');
    showToast(`${data.full_name} added to ${data.position_name}`);
  }

  async function removeCandidate(id: number) {
    if (!confirm("Remove this candidate? Their votes will remain in the database.")) return;
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) { showToast("Failed to remove.", false); return; }
    setCandidates(prev => prev.filter(c => c.id !== id));
    showToast("Candidate removed.");
  }

  const byPosition = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    candidates.forEach(c => {
      if (!map[c.position_name]) map[c.position_name] = [];
      map[c.position_name].push(c);
    });
    return map;
  }, [candidates]);

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Manage Candidates</h2>

      {/* Add form — head admin only */}
      {isHeadAdmin && (
        <SectionCard accent="red">
          <SectionTitle>Add New Candidate</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full Name"
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"
            />
            <input
              value={position}
              onChange={e => setPosition(e.target.value)}
              placeholder="Position (e.g. National President)"
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"
            />
            <select
              value={chapter}
              onChange={e => setChapter(e.target.value)}
              className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"
            >
              <option value="National">National</option>
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={addCandidate}
            disabled={saving}
            className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
            Add Candidate
          </button>
        </SectionCard>
      )}

      {/* Candidate list by position */}
      {Object.entries(byPosition).map(([pos, cands]) => (
        <SectionCard key={pos}>
          <SectionTitle>{pos}</SectionTitle>
          <div className="space-y-3">
            {cands.map(c => (
              <div key={c.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-black text-slate-800">{c.full_name}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase">{c.chapter}</p>
                </div>
                {isHeadAdmin && (
                  <button
                    onClick={() => removeCandidate(c.id)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"
                  >
                    <Trash2 size={16}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ))}

      {candidates.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <List className="mx-auto mb-4 opacity-30" size={48}/>
          <p className="font-bold uppercase tracking-widest text-sm">No candidates yet.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: VOTERS (Live vote log)
// ─────────────────────────────────────────────────────────────────────────────
function VotersTab({ votes, isHeadAdmin, myChapter }: {
  votes: VoteRow[]; isHeadAdmin: boolean; myChapter: string | null;
}) {
  const [filterChapter, setFilterChapter] = useState<string>(
    isHeadAdmin ? "ALL" : (myChapter ?? "ALL")
  );
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = filterChapter === "ALL" ? votes : votes.filter(v => v.chapter === filterChapter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.voter_name.toLowerCase().includes(q) ||
        v.candidate_name.toLowerCase().includes(q) ||
        v.position_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [votes, filterChapter, search]);

  const uniqueVoters = new Set(filtered.map(v => v.voter_id)).size;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic text-slate-800">Vote Log</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            {filtered.length} ballots • {uniqueVoters} unique voters
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isHeadAdmin && (
            <select
              value={filterChapter}
              onChange={e => setFilterChapter(e.target.value)}
              className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600 bg-white"
            >
              <option value="ALL">All Chapters</option>
              {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search voter or candidate..."
            className="border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-red-600"
          />
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                {["Chapter","Voter Email","Class","Position","Voted For","Time"].map(h => (
                  <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest">{h}</th>
                ))}
              </tr>
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
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-400 font-bold uppercase text-sm">
                    No votes found.
                  </td>
                </tr>
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
  // Roster form
  const [rEmail, setREmail]     = useState('');
  const [rChapter, setRChapter] = useState(myChapter ?? CHAPTERS[0]);
  const [rSaving, setRSaving]   = useState(false);

  // Blacklist form
  const [bEmail, setBEmail]   = useState('');
  const [bReason, setBReason] = useState('');
  const [bSaving, setBSaving] = useState(false);

  // Scoped roster view
  const visibleRoster = isHeadAdmin ? roster : roster.filter(r => r.chapter === myChapter);

  async function addToRoster() {
    const email = rEmail.trim().toLowerCase();
    if (!email) { showToast("Email required.", false); return; }
    setRSaving(true);
    const { data, error } = await supabase
      .from('eligible_voters')
      .insert([{ email, chapter: rChapter }])
      .select()
      .single();
    setRSaving(false);
    if (error) { showToast(error.message.includes('unique') ? "Email already on roster." : "Failed to add.", false); return; }
    setRoster(prev => [...prev, data]);
    setREmail('');
    showToast(`${email} added to roster.`);
  }

  async function removeFromRoster(id: number, email: string) {
    if (!confirm(`Remove ${email} from the roster?`)) return;
    const { error } = await supabase.from('eligible_voters').delete().eq('id', id);
    if (error) { showToast("Failed to remove.", false); return; }
    setRoster(prev => prev.filter(r => r.id !== id));
    showToast(`${email} removed from roster.`);
  }

  async function addToBlacklist() {
    const email = bEmail.trim().toLowerCase();
    if (!email || !bReason.trim()) { showToast("Email and reason required.", false); return; }
    setBSaving(true);
    const { data, error } = await supabase
      .from('blacklisted_voters')
      .insert([{ email, reason: bReason.trim() }])
      .select()
      .single();
    setBSaving(false);
    if (error) { showToast(error.message.includes('unique') ? "Already blacklisted." : "Failed.", false); return; }
    setBlacklist(prev => [data, ...prev]);
    setBEmail(''); setBReason('');
    showToast(`${email} blacklisted.`);
  }

  async function removeFromBlacklist(id: number, email: string) {
    if (!confirm(`Unblock ${email}?`)) return;
    const { error } = await supabase.from('blacklisted_voters').delete().eq('id', id);
    if (error) { showToast("Failed.", false); return; }
    setBlacklist(prev => prev.filter(b => b.id !== id));
    showToast(`${email} unblocked.`);
  }

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black uppercase italic text-slate-800">Roster & Blacklist</h2>

      {/* ── ADD TO ROSTER ── */}
      <SectionCard accent="green">
        <SectionTitle>Add Voter to Roster</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <input
            value={rEmail}
            onChange={e => setREmail(e.target.value)}
            placeholder="member@gmail.com"
            className="border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none md:col-span-2"
          />
          <select
            value={rChapter}
            onChange={e => setRChapter(e.target.value)}
            disabled={!isHeadAdmin}
            className="border-2 border-slate-200 focus:border-green-500 rounded-2xl px-5 py-4 font-bold outline-none disabled:bg-slate-100"
          >
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={addToRoster}
          disabled={rSaving}
          className="bg-green-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-green-700 transition-all disabled:opacity-50"
        >
          {rSaving ? <Loader2 size={16} className="animate-spin"/> : <UserCheck size={16}/>}
          Add to Roster
        </button>
      </SectionCard>

      {/* Roster list */}
      <SectionCard>
        <div className="flex justify-between items-center mb-6">
          <SectionTitle>Eligible Voters ({visibleRoster.length})</SectionTitle>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {visibleRoster.map(r => (
            <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold text-slate-800 text-sm">{r.email}</p>
                <p className="text-xs text-slate-400 font-bold uppercase">{r.chapter}</p>
              </div>
              <button
                onClick={() => removeFromRoster(r.id, r.email)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"
              >
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
          {visibleRoster.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-6">No voters on roster yet.</p>}
        </div>
      </SectionCard>

      {/* ── BLACKLIST — head admin only ── */}
      {isHeadAdmin && (
        <>
          <SectionCard accent="red">
            <SectionTitle>Blacklist a Voter</SectionTitle>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">
              Blocked emails are denied even if they are on the roster. Checked before whitelist.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <input
                value={bEmail}
                onChange={e => setBEmail(e.target.value)}
                placeholder="blocked@gmail.com"
                className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"
              />
              <input
                value={bReason}
                onChange={e => setBReason(e.target.value)}
                placeholder="Reason (e.g. Duplicate account)"
                className="border-2 border-slate-200 focus:border-red-600 rounded-2xl px-5 py-4 font-bold outline-none"
              />
            </div>
            <button
              onClick={addToBlacklist}
              disabled={bSaving}
              className="bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-red-700 transition-all disabled:opacity-50"
            >
              {bSaving ? <Loader2 size={16} className="animate-spin"/> : <UserX size={16}/>}
              Block Voter
            </button>
          </SectionCard>

          <SectionCard>
            <SectionTitle>Blacklisted ({blacklist.length})</SectionTitle>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {blacklist.map(b => (
                <div key={b.id} className="flex justify-between items-start p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <div>
                    <p className="font-black text-red-700 text-sm">{b.email}</p>
                    <p className="text-xs text-red-400 font-bold mt-1">Reason: {b.reason}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => removeFromBlacklist(b.id, b.email)}
                    className="text-slate-400 hover:text-green-600 hover:bg-green-50 p-2 rounded-xl transition-all ml-4 shrink-0"
                    title="Unblock"
                  >
                    <CheckCircle2 size={14}/>
                  </button>
                </div>
              ))}
              {blacklist.length === 0 && <p className="text-slate-400 font-bold text-sm text-center py-6">No blocked voters.</p>}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ADMINS (Head Admin only)
// ─────────────────────────────────────────────────────────────────────────────
function AdminsTab({ admins, setAdmins, showToast }: {
  admins: ElectionAdmin[];
  setAdmins: React.Dispatch<React.SetStateAction<ElectionAdmin[]>>;
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [email, setEmail]     = useState('');
  const [chapter, setChapter] = useState(CHAPTERS[0]);
  const [saving, setSaving]   = useState(false);

  async function addAdmin() {
    const lowerEmail = email.trim().toLowerCase();
    if (!lowerEmail) { showToast("Email required.", false); return; }
    if (lowerEmail === HEAD_ADMIN_EMAIL.toLowerCase()) {
      showToast("That's the head admin — no need to add.", false); return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('election_admins')
      .insert([{ email: lowerEmail, chapter }])
      .select()
      .single();
    setSaving(false);
    if (error) {
      showToast(error.message.includes('unique') ? "Already an admin." : "Failed to add.", false);
      return;
    }
    setAdmins(prev => [...prev, data]);
    setEmail('');
    showToast(`${lowerEmail} is now ${chapter} chapter admin.`);
  }

  async function removeAdmin(id: number, adminEmail: string) {
    if (!confirm(`Remove ${adminEmail} as admin?`)) return;
    const { error } = await supabase.from('election_admins').delete().eq('id', id);
    if (error) { showToast("Failed to remove.", false); return; }
    setAdmins(prev => prev.filter(a => a.id !== id));
    showToast(`${adminEmail} removed.`);
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-black uppercase italic text-slate-800">Admins</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
          Add chapter chairpersons — they can manage their chapter's roster and view results.
        </p>
      </div>

      {/* Add Admin Form */}
      <SectionCard accent="slate">
        <SectionTitle>Add Branch Chairperson</SectionTitle>

        {/* Head admin badge */}
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-2xl mb-6">
          <Crown size={20} className="text-yellow-600 shrink-0"/>
          <div>
            <p className="font-black text-yellow-800 text-sm">Head Admin (You)</p>
            <p className="text-xs text-yellow-600 font-bold">{HEAD_ADMIN_EMAIL} — Full access, exempt from all restrictions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="chairperson@gmail.com"
            className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none md:col-span-2"
          />
          <select
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            className="border-2 border-slate-200 focus:border-slate-700 rounded-2xl px-5 py-4 font-bold outline-none"
          >
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={addAdmin}
          disabled={saving}
          className="bg-slate-900 text-white font-black uppercase px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-slate-700 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin"/> : <PlusCircle size={16}/>}
          Add Chapter Admin
        </button>
      </SectionCard>

      {/* Current admins list */}
      <SectionCard>
        <SectionTitle>Current Branch Admins ({admins.length})</SectionTitle>
        {admins.length === 0 && (
          <p className="text-slate-400 font-bold text-sm text-center py-8">
            No branch admins yet. Add a chairperson above.
          </p>
        )}
        <div className="space-y-3">
          {admins.map(a => (
            <div key={a.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-black text-slate-800">{a.email}</p>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {a.chapter} Chapter Admin
                </p>
              </div>
              <button
                onClick={() => removeAdmin(a.id, a.email)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"
              >
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Permissions info */}
      <SectionCard>
        <SectionTitle>Permission Levels</SectionTitle>
        <div className="space-y-4">
          {[
            {
              role: "Head Admin (You)",
              email: HEAD_ADMIN_EMAIL,
              perms: ["Full access to all tabs", "Add/remove candidates", "Add/remove admins", "Blacklist voters", "View all chapters", "Exempt from whitelist & blacklist"],
              color: "bg-yellow-50 border-yellow-200",
              badge: "text-yellow-700",
              icon: <Crown size={16} className="text-yellow-600"/>,
            },
            {
              role: "Branch Chairperson",
              email: "Added from this tab",
              perms: ["View their chapter's results", "Manage their chapter's roster", "View their chapter's vote log", "Cannot add candidates or admins"],
              color: "bg-slate-50 border-slate-200",
              badge: "text-slate-600",
              icon: <ShieldCheck size={16} className="text-slate-500"/>,
            },
          ].map(p => (
            <div key={p.role} className={`p-6 rounded-2xl border-2 ${p.color}`}>
              <div className="flex items-center gap-2 mb-3">
                {p.icon}
                <span className={`font-black uppercase text-sm ${p.badge}`}>{p.role}</span>
              </div>
              <p className="text-xs text-slate-500 font-bold mb-3">{p.email}</p>
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
      </SectionCard>
    </div>
  );
}
