"use client";

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Vote, ShieldCheck, LogOut, Loader2, CheckCircle2,
  AlertCircle, Fingerprint, Activity, Terminal, XCircle, Users
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate { id: number; full_name: string; position_name: string; chapter: string; photo_url?: string; }
interface VoteRow   { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }

interface PositionFee { position: string; fee: number; }
interface ElectionConfig {
  org_name: string; election_title: string; election_year: string;
  currency: string; currency_symbol: string;
  chapters: string[]; positions_fees: PositionFee[];
}

const DEFAULT_CONFIG: ElectionConfig = {
  org_name: "BWIAA", election_title: "National Alumni Election", election_year: "2026",
  currency: "USD", currency_symbol: "$",
  chapters: [
    "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
    "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
    "Paynesville Branch","Mother Chapter",
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

// ─── Constants ────────────────────────────────────────────────────────────────
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const CHAPTERS = [
  "Harbel Chapter",
  "Montserrado Chapter",
  "Grand Bassa Chapter",
  "Nimba Chapter",
  "Weala Branch",
  "Robertsport Branch",
  "LAC Branch",
  "Bong Chapter",
  "Paynesville Branch",
  "Mother Chapter",
];

export default function BWIAAElection2026() {
  const [user, setUser]               = useState<any>(null);
  const [myChapter, setMyChapter]     = useState<string | null>(null);
  const [myClass, setMyClass]         = useState<string | null>(null);
  const [candidates, setCandidates]   = useState<Candidate[]>([]);
  const [votes, setVotes]             = useState<VoteRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [receipt, setReceipt]         = useState<VoteRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirm, setConfirm]         = useState<{ pos: string; cand: string } | null>(null);
  const [casting, setCasting]         = useState(false);
  const [deadline, setDeadline]       = useState<string | null>(null);
  const [timeLeft, setTimeLeft]       = useState('');
  const [votingClosed, setVotingClosed] = useState(false);
  const [electionConfig, setElectionConfig] = useState<ElectionConfig>(DEFAULT_CONFIG);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { setUser(user); await loadVoterProfile(user); }
        // Fetch all settings
        const { data: settings } = await supabase.from('election_settings').select('*');
        if (settings) {
          const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
          const dl = get('voting_deadline');
          if (dl) setDeadline(dl);
          const merged = { ...DEFAULT_CONFIG };
          if (get('org_name'))        merged.org_name        = get('org_name');
          if (get('election_title'))  merged.election_title  = get('election_title');
          if (get('election_year'))   merged.election_year   = get('election_year');
          if (get('currency'))        merged.currency        = get('currency');
          if (get('currency_symbol')) merged.currency_symbol = get('currency_symbol');
          if (get('chapters'))        { try { merged.chapters = JSON.parse(get('chapters')); } catch {} }
          if (get('positions_fees'))  { try { merged.positions_fees = JSON.parse(get('positions_fees')); } catch {} }
          setElectionConfig(merged);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    init();
    refreshVotes();
    fetchCandidates();

    const live = supabase.channel('national-audit')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        setVotes(prev => [payload.new as VoteRow, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(live); };
  }, []);

  useEffect(() => {
    if (user && !myChapter) {
      const raw = localStorage.getItem('pending_voter_data');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending.chapter) completeRegistration(user, pending.chapter, pending.classYear);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkAccess(user.email);
  }, [user]);

  // Deadline countdown + auto-archive when it hits zero
  useEffect(() => {
    if (!deadline) return;
    const tick = async () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('VOTING CLOSED');
        setVotingClosed(true);

        // Auto-archive: only if not already archived for this deadline
        const archiveKey = `archived_${deadline}`;
        if (!localStorage.getItem(archiveKey)) {
          localStorage.setItem(archiveKey, '1');
          try {
            // Fetch all votes and candidates to compute winners
            const [{ data: allVotes }, { data: allCandidates }] = await Promise.all([
              supabase.from('votes').select('*'),
              supabase.from('candidates').select('*'),
            ]);
            if (!allVotes || !allCandidates) return;

            // Group by chapter + position, find winner
            const grouped: Record<string, Record<string, Record<string, number>>> = {};
            allVotes.forEach((v: any) => {
              if (!grouped[v.chapter]) grouped[v.chapter] = {};
              if (!grouped[v.chapter][v.position_name]) grouped[v.chapter][v.position_name] = {};
              const curr = grouped[v.chapter][v.position_name][v.candidate_name] ?? 0;
              grouped[v.chapter][v.position_name][v.candidate_name] = curr + 1;
            });

            const year = new Date().getFullYear();
            const { data: settings } = await supabase.from('election_settings').select('*');
            const orgName = settings?.find((r: any) => r.key === 'org_name')?.value ?? 'BWIAA';
            const electionTitle = settings?.find((r: any) => r.key === 'election_title')?.value ?? 'Election';

            const historyRows: any[] = [];
            Object.entries(grouped).forEach(([chapter, positions]) => {
              Object.entries(positions).forEach(([position, candidates]) => {
                const total = Object.values(candidates).reduce((a, b) => a + b, 0);
                const winnerName = Object.entries(candidates).sort((a, b) => b[1] - a[1])[0]?.[0];
                const winnerVotes = candidates[winnerName] ?? 0;
                const winnerCand = allCandidates.find((c: any) => c.full_name === winnerName && c.chapter === chapter);
                historyRows.push({
                  election_year:    year,
                  election_name:    `${orgName} ${electionTitle} ${year}`,
                  chapter,
                  position_name:    position,
                  winner_name:      winnerName,
                  winner_photo_url: winnerCand?.photo_url ?? null,
                  total_votes:      total,
                  winner_votes:     winnerVotes,
                  archived_by:      'system',
                });
              });
            });

            if (historyRows.length > 0) {
              await supabase.from('election_history').upsert(historyRows, {
                onConflict: 'election_year,chapter,position_name',
              });
            }
          } catch (e) {
            console.error('Auto-archive error:', e);
          }
        }
        return;
      }
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

  async function loadVoterProfile(u: any) {
    const { data: profile } = await supabase
      .from('voter_profiles').select('home_chapter, class_year').eq('id', u.id).maybeSingle();
    if (profile) { setMyChapter(profile.home_chapter); setMyClass(profile.class_year); }
  }

  async function fetchCandidates() {
    const { data } = await supabase.from('candidates').select('*').order('position_name');
    if (data) setCandidates(data);
  }

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*').order('created_at', { ascending: false });
    if (data) setVotes(data);
  }

  async function completeRegistration(u: any, chapter: string, classYear: string) {
    const { error } = await supabase.from('voter_profiles').upsert(
      [{ id: u.id, home_chapter: chapter, class_year: classYear }],
      { onConflict: 'id' }
    );
    if (!error) { setMyChapter(chapter); setMyClass(classYear); localStorage.removeItem('pending_voter_data'); }
  }

  async function checkAccess(email: string) {
    const lowerEmail = email.toLowerCase();

    // ★ Head admin bypass — also check multi-head-admins from settings
    const { data: haSetting } = await supabase
      .from('election_settings').select('value').eq('key', 'head_admins').maybeSingle();
    let headAdmins: string[] = [HEAD_ADMIN_EMAIL.toLowerCase()];
    if (haSetting?.value) { try { headAdmins = JSON.parse(haSetting.value).map((e: string) => e.toLowerCase()); } catch {} }
    if (headAdmins.includes(lowerEmail)) return;

    try {
      // 1. Blacklist check first
      const { data: blocked } = await supabase
        .from('blacklisted_voters').select('email, reason').eq('email', lowerEmail).maybeSingle();
      if (blocked) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage(`ACCESS DENIED: This email has been blocked. Reason: ${blocked.reason}. Contact the Election Committee.`);
        return;
      }

      // 2. Whitelist check — ALWAYS enforced, even if roster is empty
      const { count, error: countError } = await supabase
        .from('eligible_voters').select('*', { count: 'exact', head: true });

      // If we can't read the roster at all, deny access (fail closed — not open)
      if (countError) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage('ACCESS DENIED: Unable to verify voter eligibility. Contact your administrator.');
        return;
      }

      // Roster is empty — nobody gets in except head admins (already handled above)
      if (!count || count === 0) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage('ACCESS DENIED: The voter roster has not been set up yet. Contact your chapter administrator to be added to the roster.');
        return;
      }

      // Roster has entries — voter must be on it
      const { data: found } = await supabase
        .from('eligible_voters').select('email, chapter').eq('email', lowerEmail).maybeSingle();
      if (!found) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage(`ACCESS DENIED: ${email} is not on the official voter roster. Contact your chapter administrator to be added.`);
        return;
      }

      // 3. ★ Auto-assign chapter from roster
      if (found.chapter && !myChapter) {
        setMyChapter(found.chapter);
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          await supabase.from('voter_profiles').upsert(
            [{ id: u.id, home_chapter: found.chapter }],
            { onConflict: 'id' }
          );
        }
      }
    } catch (e) {
      console.error("Access check error:", e);
      await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
      setErrorMessage('ACCESS DENIED: An error occurred during verification. Please try again.');
    }
  }

  async function handleChapterSelect(chapter: string) {
    // No class year needed — approved members have the right to vote
    // Class year will be pulled from their member profile if available
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      // Try to get class year from member profile
      const { data: mem } = await supabase.from('members')
        .select('year_graduated, chapter').eq('email', u.email?.toLowerCase() ?? '').maybeSingle();
      const classYear = mem?.year_graduated ? String(mem.year_graduated) : new Date().getFullYear().toString();
      const assignedChapter = mem?.chapter ?? chapter;
      localStorage.setItem('pending_voter_data', JSON.stringify({ chapter: assignedChapter, classYear }));
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    } else {
      localStorage.setItem('pending_voter_data', JSON.stringify({ chapter, classYear: new Date().getFullYear().toString() }));
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    }
  }

  function selectCandidate(pos: string, cand: string) {
    if (votingClosed) {
      setErrorMessage('VOTING HAS CLOSED. The election deadline has passed. No further ballots can be cast.');
      return;
    }
    const alreadyVoted = votes.some(v => v.voter_id === user?.id && v.position_name === pos);
    if (alreadyVoted) {
      setErrorMessage(`INTEGRITY ALERT: You have already cast a ballot for ${pos}.`);
      return;
    }
    setConfirm({ pos, cand });
  }

  async function castBallot() {
    if (!confirm || !user || !myChapter) return;
    setCasting(true);
    const { data, error } = await supabase
      .from('votes')
      .insert([{ position_name: confirm.pos, candidate_name: confirm.cand, voter_name: user.email, voter_id: user.id, chapter: myChapter, class_year: myClass }])
      .select().single();
    setCasting(false);
    setConfirm(null);
    if (error) {
      setErrorMessage(`INTEGRITY ALERT: Our records show you have already cast a ballot for ${confirm.pos}.`);
    } else {
      setReceipt(data);
    }
  }

  async function handleSignOut() {
    localStorage.clear();
    await supabase.auth.signOut();
    window.location.href = window.location.origin;
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const positionMap = useMemo(() => {
    const map: Record<string, Candidate[]> = {};
    candidates
      .filter(c => c.chapter === myChapter)
      .forEach(c => {
        if (!map[c.position_name]) map[c.position_name] = [];
        map[c.position_name].push(c);
      });
    return map;
  }, [candidates, myChapter]);

  const votedPositions = useMemo(() =>
    new Set(votes.filter(v => v.voter_id === user?.id).map(v => v.position_name)),
    [votes, user]
  );

  // ── TALLY: national scope so counter is always live from vote #1 ─────────────
  // The old version filtered to `v.chapter === myChapter` which returned 0
  // whenever no one from the same chapter had voted yet. Switched to national.
  const tallyVotes = votes;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
      <Loader2 className="animate-spin text-red-600" size={48} />
      <p className="font-black animate-pulse uppercase tracking-widest text-sm">Verifying National Identity...</p>
    </div>
  );

  // ── Chapter selection ─────────────────────────────────────────────────────────
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        {errorMessage && (
          <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
              <XCircle size={64} className="text-red-600 mx-auto mb-6" />
              <h2 className="text-2xl font-black uppercase italic mb-4">Access Denied</h2>
              <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Understood</button>
            </div>
          </div>
        )}
        <h1 className="text-white text-5xl md:text-7xl font-black mb-4 tracking-tighter uppercase italic text-center">
          {electionConfig.org_name} <span className="text-red-600">{electionConfig.election_year}</span>
        </h1>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-2">{electionConfig.election_title}</p>

        {/* Member Portal shortcut */}
        <Link href="/members" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-black text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all mb-10">
          <Users size={13}/> Member Portal — Dues, Events & Account
        </Link>

        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Select Your Chapter to Vote</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
          {CHAPTERS.map(c => (
            <button key={c} onClick={() => handleChapterSelect(c)}
              className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-black transition-all flex flex-col items-center gap-4 hover:bg-slate-800">
              <Vote size={28} className="text-red-600" />
              <span className="text-xs uppercase tracking-widest text-center leading-relaxed">{c}</span>
            </button>
          ))}
        </div>

        {/* ── Candidate Registration Section ── */}
        <div className="w-full max-w-5xl mt-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-white/10"/>
            <p className="text-white/40 text-xs font-black uppercase tracking-widest">Or</p>
            <div className="flex-1 h-px bg-white/10"/>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[3rem] p-8 md:p-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div>
                <h2 className="text-white text-2xl font-black uppercase italic">Run for Office</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{electionConfig.org_name} {electionConfig.election_year} Candidate Registration</p>
              </div>
              <Link href="/register" className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl text-sm transition-all flex items-center gap-2 shrink-0">
                <Vote size={16}/> Apply to Run
              </Link>
            </div>

            {/* Fee schedule */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {electionConfig.positions_fees.map(({ position, fee }) => (
                <div key={position} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                  <p className="text-red-400 font-black text-lg">{electionConfig.currency_symbol}{fee.toLocaleString()}</p>
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest leading-tight mt-1">{position}</p>
                </div>
              ))}
            </div>

            {/* EC Guidelines summary */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-4">EC Guidelines</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  "Registration of Candidates (Timeline Required)",
                  "Accreditation of Voters",
                  "Certification of Qualified Candidates",
                  "Screening via Class Name, Year Graduated, Sponsor & Principal",
                  "Voting shall be by secret ballot",
                  "Results announced same day",
                ].map(g => (
                  <div key={g} className="flex items-start gap-2">
                    <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5"/>
                    <p className="text-white/50 text-xs font-bold leading-tight">{g}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Check application status */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link href="/register/status" className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-black uppercase px-6 py-4 rounded-2xl text-xs text-center transition-all tracking-widest">
                Check Application Status
              </Link>
              <Link href="/members" className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-black uppercase px-6 py-4 rounded-2xl text-xs text-center transition-all tracking-widest">
                Member Portal
              </Link>
              <Link href="/history" className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-black uppercase px-6 py-4 rounded-2xl text-xs text-center transition-all tracking-widest">
                Election History
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Voting Page ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 text-slate-900">

      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <AlertCircle size={64} className="text-red-600 mx-auto mb-6" />
            <h2 className="text-3xl font-black uppercase italic mb-4">Notice</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Understood</button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <Vote size={56} className="text-red-600 mx-auto mb-6"/>
            <h2 className="text-2xl font-black uppercase italic mb-2">Confirm Your Vote</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">This cannot be undone</p>
            <div className="bg-slate-50 rounded-3xl p-6 mb-8 text-left space-y-3 border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Position</span>
                <span className="font-black text-slate-800 text-sm uppercase">{confirm.pos}</span>
              </div>
              <div className="w-full h-px bg-slate-200"/>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Candidate</span>
                <span className="font-black text-red-600 text-sm uppercase">{confirm.cand}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} disabled={casting}
                className="flex-1 bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">
                Go Back
              </button>
              <button onClick={castBallot} disabled={casting}
                className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {casting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                {casting ? 'Submitting...' : 'Cast Vote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-green-500">
            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black uppercase italic mb-2 text-green-600">Vote Verified</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Your ballot has been recorded</p>
            <div className="bg-slate-50 p-6 rounded-3xl text-left font-mono text-[11px] mb-8 space-y-2 border border-slate-100">
              <p><span className="text-slate-400">CERTIFICATE:</span> {receipt.id}</p>
              <p><span className="text-slate-400">POSITION:</span>    {receipt.position_name}</p>
              <p><span className="text-slate-400">VOTED FOR:</span>   {receipt.candidate_name}</p>
              <p><span className="text-slate-400">CHAPTER:</span>     {receipt.chapter}</p>
              <p><span className="text-slate-400">CLASS OF:</span>    {receipt.class_year}</p>
              <p><span className="text-slate-400">TIMESTAMP:</span>   {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Close Receipt</button>
          </div>
        </div>
      )}

      <header className="bg-white border-b-2 border-slate-100 p-5 mb-0 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-xl shadow"><ShieldCheck size={18}/></div>
            <div className="font-black text-slate-900 uppercase leading-tight italic text-sm">
              BWIAA Ballot 2026<br/>
              <span className="text-[10px] text-red-600 font-bold">{myChapter ?? '—'} • CLASS OF {myClass ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {deadline && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${votingClosed ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                <Activity size={12}/>
                {votingClosed ? 'VOTING CLOSED' : timeLeft}
              </div>
            )}
            {/* Member Portal — distinct green button, always visible */}
            <Link href="/members/dashboard"
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl transition-all">
              <Users size={12}/> Member Portal
            </Link>
            <span className="text-[11px] text-slate-400 font-bold hidden md:block">{user?.email}</span>
            <AdminLink userEmail={user?.email} headAdminEmail={HEAD_ADMIN_EMAIL} />
            <button onClick={handleSignOut} className="bg-slate-100 p-2.5 rounded-xl text-slate-400 hover:text-red-600 transition-all border border-slate-200" title="Sign Out">
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </header>

      {/* Voting closed full banner */}
      {votingClosed && (
        <div className="bg-red-600 text-white text-center py-4 px-6 font-black uppercase tracking-widest text-sm">
          ⛔ Voting has closed — The election deadline has passed. No further ballots can be accepted.
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 space-y-12 mt-10">
        {Object.entries(positionMap).map(([posTitle, candObjs]) => {
          const hasVoted = votedPositions.has(posTitle);
          return (
            <section key={posTitle} className={`bg-white p-6 md:p-12 rounded-[3rem] shadow-xl border-b-[12px] transition-all ${hasVoted ? 'border-green-400' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-8 gap-3">
                <h2 className="text-lg md:text-2xl font-black text-slate-800 uppercase italic border-l-8 border-red-600 pl-5 leading-tight">{posTitle}</h2>
                {hasVoted && (
                  <span className="flex items-center gap-2 text-green-600 font-black text-xs uppercase tracking-widest bg-green-50 px-4 py-2 rounded-full border border-green-200 shrink-0">
                    <CheckCircle2 size={14}/> Voted
                  </span>
                )}
              </div>
              {/* Responsive grid: 2 cols on mobile, 3+ on larger screens */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-5">
                {candObjs.map(cand => {
                  const posVotes = tallyVotes.filter(v => v.position_name === posTitle);
                  const count    = posVotes.filter(v => v.candidate_name === cand.full_name).length;
                  const total    = posVotes.length;
                  const percent  = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <button key={cand.id} onClick={() => selectCandidate(posTitle, cand.full_name)}
                      disabled={hasVoted || votingClosed}
                      className={`relative flex flex-col items-center p-4 md:p-6 rounded-3xl border-2 transition-all overflow-hidden text-center
                        ${hasVoted || votingClosed
                          ? 'border-slate-100 cursor-not-allowed bg-slate-50/50 opacity-70'
                          : 'border-slate-100 hover:border-red-600 bg-white active:scale-95 hover:shadow-xl'}`}>
                      {/* Photo */}
                      <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-slate-100 mb-3 border-2 border-slate-200 shrink-0">
                        {cand.photo_url
                          ? <img src={cand.photo_url} alt={cand.full_name} className="w-full h-full object-cover"/>
                          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                              <span className="text-xl md:text-3xl font-black text-slate-500">{cand.full_name.charAt(0)}</span>
                            </div>
                        }
                      </div>
                      {/* Name */}
                      <p className="font-black text-slate-800 text-xs md:text-sm uppercase leading-tight mb-2">{cand.full_name}</p>
                      {/* Live tally */}
                      <div className="flex items-center gap-1">
                        <span className="text-xl md:text-3xl font-black text-red-600">{count}</span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold leading-tight text-left">National<br/>Tally</span>
                      </div>
                      {/* Progress bar */}
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
                        <div className="h-full bg-red-400 transition-all duration-1000" style={{ width: `${percent}%` }}/>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {Object.keys(positionMap).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="bg-white rounded-[3rem] p-10 md:p-14 max-w-lg w-full text-center shadow-xl border-b-8 border-yellow-400">
              {/* Animated waiting indicator */}
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-yellow-200 animate-ping opacity-40"/>
                <div className="absolute inset-2 rounded-full border-4 border-yellow-300 animate-ping opacity-30" style={{ animationDelay: '0.3s' }}/>
                <div className="absolute inset-4 rounded-full bg-yellow-400 flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>

              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">
                Ballot Not Ready Yet
              </h2>
              <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">
                Candidates for the <span className="text-red-600 font-black">{myChapter}</span> chapter
                have not been finalised yet. Your ballot will appear here once the Election Committee
                has confirmed all candidates for your chapter.
              </p>

              {/* Voter info card */}
              <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Registration</p>
                <div className="flex justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Chapter</span>
                  <span className="text-xs font-black text-slate-800">{myChapter ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Class Year</span>
                  <span className="text-xs font-black text-slate-800">{myClass ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Email</span>
                  <span className="text-xs font-black text-slate-800">{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Status</span>
                  <span className="text-xs font-black text-green-600">✓ Verified Voter</span>
                </div>
              </div>

              {deadline && !votingClosed && (
                <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                  <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">Election Countdown</p>
                  <p className="text-red-500 font-black text-2xl tabular-nums">{timeLeft}</p>
                </div>
              )}

              <p className="text-xs text-slate-400 font-bold">
                This page will update automatically when candidates are added. You can check back later or contact your chapter administrator.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto mt-24 px-4 p-10 bg-slate-900 rounded-[3.5rem] text-white relative overflow-hidden">
        <Fingerprint size={200} className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center border-b border-white/10 pb-8 mb-8 gap-4">
            <h3 className="text-xl font-black italic uppercase text-blue-400 tracking-tighter flex items-center gap-2">
              <Activity size={20}/> Audit Intelligence
            </h3>
            <span className="bg-blue-600 px-5 py-2 rounded-full font-black text-lg shadow-xl">{votes.length} NATIONAL BALLOTS</span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {votes.map((v, i) => (
              <div key={v.id ?? i} className="flex flex-col md:flex-row md:justify-between items-start md:items-center py-3 border-b border-white/5 last:border-0 gap-1">
                <div>
                  <span className="text-[9px] font-black uppercase text-blue-400 tracking-[0.2em] block">{v.chapter} • {new Date(v.created_at).toLocaleTimeString()}</span>
                  <span className="text-xs font-bold text-slate-300">{v.voter_name}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-lg text-red-400 font-black uppercase tracking-widest">CLASS OF {v.class_year}</span>
                  <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-lg text-slate-300 font-black uppercase">{v.position_name}</span>
                  <span className="text-xs font-black text-white uppercase">→ {v.candidate_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function AdminLink({ userEmail, headAdminEmail }: { userEmail: string; headAdminEmail: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!userEmail) return;
    if (userEmail.toLowerCase() === headAdminEmail.toLowerCase()) { setIsAdmin(true); return; }
    supabase.from('election_admins').select('email').eq('email', userEmail).maybeSingle()
      .then(({ data }) => { if (data) setIsAdmin(true); });
  }, [userEmail]);
  if (!isAdmin) return null;
  return (
    <Link href="/admin" className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-red-600 transition-all shadow-xl uppercase border border-white/10">
      <Terminal size={13}/> Command Center
    </Link>
  );
}
