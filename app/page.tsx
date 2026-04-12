"use client";

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Vote, ShieldCheck, LogOut, Loader2, CheckCircle2,
  AlertCircle, Fingerprint, Activity, Terminal, XCircle
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate { id: number; full_name: string; position_name: string; chapter: string; }
interface VoteRow   { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const CHAPTERS = [
  "Harbel and RIA","Monrovia","Buchanan","Gbarnga","Kakata",
  "Voinjama","Zwedru","Robertsport","Greenville","Harper","Sanniquellie","Cestos City"
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
  const [classInput, setClassInput]   = useState('');
  const [confirm, setConfirm]         = useState<{ pos: string; cand: string } | null>(null);
  const [casting, setCasting]         = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { setUser(user); await loadVoterProfile(user); }
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
    if (lowerEmail === HEAD_ADMIN_EMAIL.toLowerCase()) return; // ★ head admin bypass

    try {
      // 1. Blacklist check first
      const { data: blocked } = await supabase
        .from('blacklisted_voters').select('email, reason').eq('email', lowerEmail).maybeSingle();
      if (blocked) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage(`ACCESS DENIED: This email has been blocked. Reason: ${blocked.reason}. Contact the Election Committee.`);
        return;
      }

      // 2. Whitelist check — if roster has entries, voter must be on it
      const { count, error: countError } = await supabase
        .from('eligible_voters').select('*', { count: 'exact', head: true });
      if (countError) return; // fail open if we can't read roster
      if (count && count > 0) {
        const { data: found } = await supabase
          .from('eligible_voters').select('email, chapter').eq('email', lowerEmail).maybeSingle();
        if (!found) {
          await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
          setErrorMessage(`ACCESS DENIED: ${email} is not on the official BWIAA voter roster. Contact your chapter administrator.`);
          return;
        }
        // 3. ★ Auto-assign chapter from roster if voter profile has no chapter yet
        if (found.chapter && !myChapter) {
          setMyChapter(found.chapter);
          // persist to voter_profiles so it survives refresh
          const { data: { user: u } } = await supabase.auth.getUser();
          if (u) {
            await supabase.from('voter_profiles').upsert(
              [{ id: u.id, home_chapter: found.chapter }],
              { onConflict: 'id' }
            );
          }
        }
      }
    } catch (e) {
      console.error("Access check error:", e);
    }
  }

  async function handleChapterSelect(chapter: string) {
    const year = parseInt(classInput, 10);
    if (!classInput || classInput.length !== 4 || isNaN(year) || year < 1950 || year > new Date().getFullYear()) {
      setErrorMessage("Please enter a valid 4-digit Graduating Class Year (e.g. 1995) before selecting your chapter.");
      return;
    }
    // Check if this voter is on the roster — if so, use THEIR assigned chapter, not what they clicked
    const lowerEmail = (await supabase.auth.getUser()).data.user?.email?.toLowerCase();
    if (lowerEmail) {
      const { data: found } = await supabase
        .from('eligible_voters').select('chapter').eq('email', lowerEmail).maybeSingle();
      if (found?.chapter) {
        // Voter is on roster — use their assigned chapter, ignore what they clicked
        localStorage.setItem('pending_voter_data', JSON.stringify({ chapter: found.chapter, classYear: classInput }));
        await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
        return;
      }
    }
    localStorage.setItem('pending_voter_data', JSON.stringify({ chapter, classYear: classInput }));
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  function selectCandidate(pos: string, cand: string) {
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
    const map: Record<string, string[]> = {};
    // Only show candidates assigned to the voter's own chapter
    candidates
      .filter(c => c.chapter === myChapter)
      .forEach(c => {
        if (!map[c.position_name]) map[c.position_name] = [];
        map[c.position_name].push(c.full_name);
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
          BWIAA <span className="text-red-600">2026</span>
        </h1>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-10">National Alumni Election</p>
        <div className="bg-white p-6 rounded-3xl mb-8 shadow-2xl w-full max-w-sm border-t-8 border-red-600">
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">
            Step 1 — Enter Your Graduating Class Year
          </label>
          <input type="number" value={classInput} onChange={e => setClassInput(e.target.value)} placeholder="e.g. 1995"
            className="p-4 rounded-2xl text-slate-900 font-black w-full text-center border-2 border-slate-100 focus:border-red-600 outline-none text-2xl" />
        </div>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">Step 2 — Select Your Chapter</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
          {CHAPTERS.map(c => (
            <button key={c} onClick={() => handleChapterSelect(c)}
              className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-black transition-all flex flex-col items-center gap-4 hover:bg-slate-800">
              <Vote size={28} className="text-red-600" />
              <span className="text-xs uppercase tracking-widest text-center leading-relaxed">{c}</span>
            </button>
          ))}
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

      <header className="bg-white border-b-2 border-slate-100 p-5 mb-10 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-xl shadow"><ShieldCheck size={18}/></div>
            <div className="font-black text-slate-900 uppercase leading-tight italic text-sm">
              BWIAA Ballot 2026<br/>
              <span className="text-[10px] text-red-600 font-bold">{myChapter ?? '—'} • CLASS OF {myClass ?? '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-bold hidden md:block">{user?.email}</span>
            <AdminLink userEmail={user?.email} headAdminEmail={HEAD_ADMIN_EMAIL} />
            <button onClick={handleSignOut} className="bg-slate-100 p-2.5 rounded-xl text-slate-400 hover:text-red-600 transition-all border border-slate-200" title="Sign Out">
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 space-y-12">
        {Object.entries(positionMap).map(([posTitle, candList]) => {
          const hasVoted = votedPositions.has(posTitle);
          return (
            <section key={posTitle} className={`bg-white p-8 md:p-12 rounded-[4rem] shadow-xl border-b-[18px] transition-all ${hasVoted ? 'border-green-400 opacity-80' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-2xl font-black text-slate-800 uppercase italic border-l-8 border-red-600 pl-6">{posTitle}</h2>
                {hasVoted && (
                  <span className="flex items-center gap-2 text-green-600 font-black text-xs uppercase tracking-widest bg-green-50 px-4 py-2 rounded-full border border-green-200">
                    <CheckCircle2 size={14}/> Voted
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {candList.map(cand => {
                  const posVotes = tallyVotes.filter(v => v.position_name === posTitle);
                  const count    = posVotes.filter(v => v.candidate_name === cand).length;
                  const total    = posVotes.length;
                  const percent  = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <button key={cand} onClick={() => selectCandidate(posTitle, cand)} disabled={hasVoted}
                      className={`relative w-full text-left p-8 rounded-[2.5rem] border-2 transition-all overflow-hidden
                        ${hasVoted ? 'border-slate-100 cursor-not-allowed bg-slate-50/30' : 'border-slate-100 hover:border-red-600 bg-slate-50/50 active:scale-95 hover:shadow-lg'}`}>
                      <div className="relative z-10 flex justify-between items-center font-black uppercase">
                        <span className="text-lg tracking-tight text-slate-800">{cand}</span>
                        <div className="text-right">
                          <span className="text-4xl text-red-600 block">{count}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">National Tally</span>
                        </div>
                      </div>
                      <div className="absolute left-0 top-0 h-full bg-red-100/40 border-r-4 border-red-200/50 -z-10 transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {Object.keys(positionMap).length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <Loader2 className="mx-auto mb-4 opacity-30" size={48}/>
            <p className="font-bold uppercase tracking-widest text-sm">No candidates have been added for the {myChapter} chapter yet.</p>
            <p className="text-xs mt-2 font-bold uppercase tracking-widest">Contact your election administrator.</p>
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
