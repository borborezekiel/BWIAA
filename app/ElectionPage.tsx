"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Loader2, LogOut, Vote, CheckCircle2, Clock, Lock,
  Trophy, ChevronRight, AlertTriangle, UserPlus, LogIn,
  FileText, Shield, BarChart2, Megaphone
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Candidate {
  id: number; full_name: string; position_name: string;
  chapter: string; photo_url?: string;
}
interface VoterProfile {
  email: string; chapter: string; class_year: string;
}
interface ElectionPhase {
  registration_open: boolean;
  voting_open: boolean;
  results_announced: boolean;
  voting_deadline: string | null;
  org_name: string;
  election_title: string;
  election_year: string;
}

const POSITION_ORDER = [
  "President", "Vice President for Administration", "Vice President for Operations",
  "Secretary General", "Financial Secretary", "Treasurer", "Parliamentarian", "Chaplain",
];

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ElectionPage() {
  const [user, setUser]               = useState<any>(null);
  const [profile, setProfile]         = useState<VoterProfile | null>(null);
  const [member, setMember]           = useState<any>(null);
  const [candidates, setCandidates]   = useState<Candidate[]>([]);
  const [phase, setPhase]             = useState<ElectionPhase>({
    registration_open: false, voting_open: false, results_announced: false,
    voting_deadline: null, org_name: 'BWIAA',
    election_title: 'National Alumni Election', election_year: '2026',
  });
  const [myVotes, setMyVotes]         = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [voting, setVoting]           = useState<string | null>(null);
  const [results, setResults]         = useState<Record<string, { candidate: string; count: number }[]>>({});
  const [timeLeft, setTimeLeft]       = useState('');
  const [votingClosed, setVotingClosed] = useState(false);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load everything ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // 1. Load phase settings
      const { data: settings } = await supabase.from('election_settings').select('*');
      const get = (k: string) => settings?.find((r: any) => r.key === k)?.value;
      const newPhase: ElectionPhase = {
        registration_open: get('registration_open') === 'true',
        voting_open:        get('voting_open')        === 'true',
        results_announced:  get('results_announced')  === 'true',
        voting_deadline:    get('voting_deadline')    ?? null,
        org_name:           get('org_name')           ?? 'BWIAA',
        election_title:     get('election_title')     ?? 'National Alumni Election',
        election_year:      get('election_year')      ?? '2026',
      };
      setPhase(newPhase);

      // 2. Auth
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user ?? null);

      if (user) {
        // Load member record (auth_user_id first, email fallback)
        let mem: any = null;
        const { data: m1 } = await supabase.from('members')
          .select('*').eq('auth_user_id', user.id).maybeSingle();
        if (m1) {
          mem = m1;
        } else {
          const { data: m2 } = await supabase.from('members')
            .select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
          if (m2) {
            mem = m2;
            if (!m2.auth_user_id) {
              await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
            }
          }
        }
        setMember(mem ?? null);

        // Load voter profile
        const { data: vp } = await supabase.from('voter_profiles')
          .select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        setProfile(vp ?? null);

        // Load this user's votes
        if (vp) {
          const { data: voteRows } = await supabase.from('votes')
            .select('position_name, candidate_name').eq('voter_name', user.email?.toLowerCase());
          if (voteRows) {
            const map: Record<string, string> = {};
            voteRows.forEach((v: any) => { map[v.position_name] = v.candidate_name; });
            setMyVotes(map);
          }
        }
      }

      // 3. Load candidates
      const { data: cands } = await supabase.from('candidates').select('*').order('position_name');
      if (cands) setCandidates(cands);

      // 4. Load results if announced
      if (get('results_announced') === 'true' || get('voting_open') === 'false') {
        const { data: votes } = await supabase.from('votes').select('position_name, candidate_name');
        if (votes && cands) {
          const map: Record<string, { candidate: string; count: number }[]> = {};
          cands.forEach((c: Candidate) => {
            if (!map[c.position_name]) map[c.position_name] = [];
            const count = votes.filter((v: any) => v.position_name === c.position_name && v.candidate_name === c.full_name).length;
            map[c.position_name].push({ candidate: c.full_name, count });
          });
          Object.keys(map).forEach(p => map[p].sort((a, b) => b.count - a.count));
          setResults(map);
        }
      }

      setLoading(false);
    })();
  }, []);

  // ── Live countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!phase.voting_deadline) { setTimeLeft(''); return; }
    const tick = () => {
      const diff = new Date(phase.voting_deadline!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('CLOSED'); setVotingClosed(true); return; }
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
  }, [phase.voting_deadline]);

  // ── Vote ────────────────────────────────────────────────────────────────────
  async function castVote(position: string, candidateName: string, chapter: string) {
    if (!user || !profile) return;
    if (myVotes[position]) { showToast('You already voted for this position.', false); return; }
    setVoting(position);
    const { error } = await supabase.from('votes').insert([{
      voter_name:     user.email?.toLowerCase(),
      voter_id:       user.id,
      position_name:  position,
      candidate_name: candidateName,
      chapter:        profile.chapter,
      class_year:     profile.class_year,
    }]);
    setVoting(null);
    if (error) {
      const isDupe = error.code === '23505' || error.message.toLowerCase().includes('unique');
      showToast(isDupe ? 'You already voted for this position.' : `Vote failed: ${error.message}`, false);
      return;
    }
    setMyVotes(prev => ({ ...prev, [position]: candidateName }));
    showToast(`✓ Vote cast for ${candidateName}!`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  // ── Derived state ───────────────────────────────────────────────────────────
  const isEligibleVoter = !!profile;
  const isApprovedMember = member?.status === 'approved';
  const canVote = phase.voting_open && !votingClosed && isEligibleVoter;
  const showResults = phase.results_announced || (phase.voting_open && votingClosed);

  // Group candidates by position in POSITION_ORDER
  const byPosition = POSITION_ORDER.reduce<Record<string, Candidate[]>>((acc, pos) => {
    const cands = candidates.filter(c => c.chapter === profile?.chapter && c.position_name === pos);
    if (cands.length > 0) acc[pos] = cands;
    return acc;
  }, {});

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"/>
        <p className="text-white/40 font-black uppercase tracking-widest text-xs">Verifying National Identity...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-2xl">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl shrink-0">
              <Vote size={18} className="text-white"/>
            </div>
            <div>
              <p className="font-black uppercase italic text-sm leading-tight">
                {phase.org_name} {phase.election_year}
              </p>
              {profile && (
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                  {profile.chapter} · Class of {profile.class_year}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:block text-xs font-bold text-white/40 truncate max-w-[160px]">{user.email}</span>
                <Link href="/members/dashboard"
                  className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-xs px-4 py-2 rounded-xl border border-white/10 transition-all">
                  Dashboard
                </Link>
                <button onClick={signOut}
                  className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white p-2.5 rounded-xl transition-all border border-red-600/30">
                  <LogOut size={15}/>
                </button>
              </>
            ) : (
              <>
                <Link href="/members/login"
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-black uppercase text-xs px-4 py-2 rounded-xl border border-white/10 transition-all">
                  <LogIn size={14}/> Sign In
                </Link>
                <Link href="/members/register"
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-4 py-2 rounded-xl transition-all">
                  <UserPlus size={14}/> Join
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Phase Banner ── */}
      {phase.voting_open && phase.voting_deadline && (
        <div className={`${votingClosed ? 'bg-slate-800' : 'bg-slate-900'} text-white text-center py-4 px-6`}>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">
            {votingClosed ? 'Voting Has Closed' : 'Voting Closes In'}
          </p>
          <p className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight ${votingClosed ? 'text-slate-400' : 'text-red-500'}`}>
            {timeLeft}
          </p>
          {!votingClosed && (
            <p className="text-[10px] text-white/30 font-bold mt-1">
              Deadline: {new Date(phase.voting_deadline).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* ── APPLY FOR OFFICE CTA ── */}
        {phase.registration_open && (
          <div className="bg-slate-900 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
            <div className="flex items-center gap-5">
              <div className="bg-red-600 rounded-2xl p-4 shrink-0">
                <FileText size={28} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-black uppercase italic text-xl">Run for Office</p>
                <p className="text-white/50 font-bold text-sm mt-1">
                  {isApprovedMember
                    ? 'You are an approved member — click to submit your candidacy application.'
                    : user
                      ? member?.status === 'pending'
                        ? 'Your membership is pending approval. You can apply once approved.'
                        : 'You must be an approved BWIAA member to run for office.'
                      : 'Sign in as an approved member to apply as a candidate.'}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              {isApprovedMember ? (
                <Link href="/register"
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm whitespace-nowrap">
                  Apply Now <ChevronRight size={16}/>
                </Link>
              ) : user ? (
                <div className="flex items-center gap-2 bg-white/10 text-white/40 font-black uppercase px-8 py-4 rounded-2xl text-sm cursor-not-allowed">
                  <Lock size={16}/> Members Only
                </div>
              ) : (
                <Link href="/members/login"
                  className="flex items-center gap-2 bg-white text-slate-900 font-black uppercase px-8 py-4 rounded-2xl transition-all text-sm whitespace-nowrap hover:bg-white/90">
                  <LogIn size={16}/> Sign In First
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── PHASE: PRE-ELECTION (nothing open yet) ── */}
        {!phase.registration_open && !phase.voting_open && !phase.results_announced && (
          <PhaseCard
            icon={<Clock size={40} className="text-yellow-500"/>}
            color="yellow"
            title="Election Not Yet Open"
            message="The election committee is preparing for the upcoming election. Registration and voting dates will be announced soon."
            user={user}
          />
        )}

        {/* ── PHASE: REGISTRATION OPEN, VOTING NOT YET ── */}
        {phase.registration_open && !phase.voting_open && !phase.results_announced && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-[2.5rem] p-8 flex items-start gap-5">
            <div className="bg-blue-100 rounded-2xl p-3 shrink-0">
              <Shield size={24} className="text-blue-600"/>
            </div>
            <div>
              <p className="font-black text-blue-800 uppercase text-lg">Candidate Registration Open</p>
              <p className="text-blue-700 font-bold text-sm mt-1 leading-relaxed">
                Approved members can apply to run for office. Voting has not yet begun — the Election Committee will open the ballot once all candidates are confirmed.
              </p>
            </div>
          </div>
        )}

        {/* ── PHASE: VOTING OPEN ── */}
        {phase.voting_open && !votingClosed && (
          <>
            {/* Not logged in */}
            {!user && (
              <PhaseCard
                icon={<Lock size={40} className="text-red-500"/>}
                color="red"
                title="Sign In to Vote"
                message="You must be a registered BWIAA member and signed in to cast your vote."
                user={user}
              />
            )}

            {/* Logged in but not on voter roster */}
            {user && !isEligibleVoter && (
              <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl border-2 border-orange-200">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={28} className="text-orange-500"/>
                </div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Not on Voter Roster</h2>
                <p className="text-slate-500 font-bold text-sm mb-2 leading-relaxed max-w-md mx-auto">
                  Your account (<strong>{user.email}</strong>) is not on the eligible voter list for this election.
                </p>
                <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-md mx-auto">
                  If you believe this is an error, contact your chapter administrator. Only approved members added to the voter roster by their chapter chairperson may vote.
                </p>
                <Link href="/members/dashboard" className="inline-flex items-center gap-2 mt-6 bg-red-600 text-white font-black uppercase px-8 py-4 rounded-2xl text-sm hover:bg-red-700 transition-all">
                  Go to Member Dashboard
                </Link>
              </div>
            )}

            {/* Eligible voter — show ballot */}
            {user && isEligibleVoter && (
              <div className="space-y-6">
                {/* Voter confirmation bar */}
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-6 py-4 flex items-center gap-4">
                  <CheckCircle2 size={20} className="text-green-600 shrink-0"/>
                  <div className="flex-1">
                    <p className="font-black text-green-800 text-sm uppercase">✓ Verified Voter</p>
                    <p className="text-green-700 text-xs font-bold">{profile?.chapter} · Class of {profile?.class_year} · {user.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">
                      {Object.keys(myVotes).length}/{Object.keys(byPosition).length} positions voted
                    </p>
                  </div>
                </div>

                {/* No candidates yet */}
                {Object.keys(byPosition).length === 0 && (
                  <div className="bg-white rounded-[2.5rem] p-16 text-center shadow-xl">
                    <Clock size={48} className="mx-auto mb-4 text-slate-300"/>
                    <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Ballot Not Ready Yet</h2>
                    <p className="text-slate-500 font-bold text-sm leading-relaxed max-w-md mx-auto">
                      Candidates for the <span className="text-red-600 font-black">{profile?.chapter}</span> chapter have not been finalised yet. Your ballot will appear here once the Election Committee has confirmed all candidates for your chapter.
                    </p>
                    <div className="mt-8 bg-slate-50 rounded-2xl p-5 inline-block text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Registration</p>
                      {[['Chapter', profile?.chapter], ['Class Year', profile?.class_year], ['Email', user?.email], ['Status', '✓ Verified Voter']].map(([l, v]) => (
                        <div key={l} className="flex justify-between gap-8 py-1.5 border-b border-slate-100 last:border-0">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{l}</span>
                          <span className={`text-[10px] font-black ${l === 'Status' ? 'text-green-600' : 'text-slate-700'}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 font-bold mt-6">This page will update automatically when candidates are added. You can check back later or contact your chapter administrator.</p>
                  </div>
                )}

                {/* Ballot positions */}
                {Object.entries(byPosition).map(([position, cands]) => {
                  const voted = myVotes[position];
                  return (
                    <div key={position} className={`bg-white rounded-[2.5rem] p-8 shadow-xl border-2 transition-all ${voted ? 'border-green-200' : 'border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-black uppercase italic text-slate-800">{position}</h3>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {cands.length} candidate{cands.length !== 1 ? 's' : ''} · {profile?.chapter}
                          </p>
                        </div>
                        {voted && (
                          <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-2xl">
                            <CheckCircle2 size={14} className="text-green-600"/>
                            <span className="text-xs font-black text-green-700 uppercase">Voted</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {cands.map(c => {
                          const isVotedFor = voted === c.full_name;
                          const hasVoted   = !!voted;
                          return (
                            <div key={c.id} className={`relative rounded-2xl border-2 p-5 flex flex-col items-center text-center transition-all
                              ${isVotedFor ? 'border-green-400 bg-green-50 shadow-lg' : hasVoted ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 hover:border-red-300 hover:shadow-md'}`}>
                              {isVotedFor && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-widest">
                                  ✓ Your Vote
                                </div>
                              )}
                              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 mb-3 shrink-0">
                                {c.photo_url
                                  ? <img src={c.photo_url} className="w-full h-full object-cover" alt={c.full_name}/>
                                  : <div className="w-full h-full flex items-center justify-center bg-slate-200">
                                      <span className="text-2xl font-black text-slate-400">{c.full_name.charAt(0)}</span>
                                    </div>
                                }
                              </div>
                              <p className="font-black text-slate-800 text-sm uppercase leading-tight">{c.full_name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{c.chapter}</p>
                              {!hasVoted && (
                                <button
                                  onClick={() => castVote(position, c.full_name, c.chapter)}
                                  disabled={voting === position}
                                  className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                                  {voting === position ? <Loader2 size={12} className="animate-spin"/> : <Vote size={12}/>}
                                  Cast Vote
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── PHASE: VOTING CLOSED (deadline passed but results not announced) ── */}
        {phase.voting_open && votingClosed && !phase.results_announced && (
          <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-xl border-2 border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Clock size={28} className="text-slate-400"/>
            </div>
            <h2 className="text-2xl font-black uppercase italic text-slate-800 mb-3">Voting Has Closed</h2>
            <p className="text-slate-500 font-bold text-sm leading-relaxed max-w-md mx-auto">
              The voting period has ended. The Election Committee is tallying the results. Official results will be announced shortly.
            </p>
          </div>
        )}

        {/* ── PHASE: RESULTS ANNOUNCED ── */}
        {phase.results_announced && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 flex items-center gap-5 shadow-2xl">
              <div className="bg-yellow-500 rounded-2xl p-4 shrink-0">
                <Trophy size={28} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-black uppercase italic text-2xl">Official Results</p>
                <p className="text-white/50 font-bold text-sm mt-1">
                  {phase.org_name} {phase.election_year} — Final Election Results
                </p>
              </div>
            </div>

            {Object.entries(results).map(([position, res]) => {
              const total = res.reduce((s, r) => s + r.count, 0);
              const winner = res[0];
              return (
                <div key={position} className="bg-white rounded-[2.5rem] p-8 shadow-xl border-2 border-slate-100">
                  <h3 className="text-xl font-black uppercase italic text-slate-800 border-l-8 border-red-600 pl-5 mb-6">{position}</h3>
                  <div className="space-y-4">
                    {res.map((r, i) => {
                      const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                      const isWinner = i === 0 && r.count > 0;
                      return (
                        <div key={r.candidate}>
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                              <span className="font-black text-sm uppercase text-slate-800">{r.candidate}</span>
                              {isWinner && (
                                <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-yellow-300">
                                  <Trophy size={10}/> Winner
                                </span>
                              )}
                            </div>
                            <span className="font-black text-slate-700">{r.count} <span className="text-slate-400 font-bold text-xs">({pct}%)</span></span>
                          </div>
                          <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${isWinner ? 'bg-red-600' : 'bg-slate-300'}`}
                              style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-4">{total} total votes cast</p>
                </div>
              );
            })}

            {Object.keys(results).length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <BarChart2 size={48} className="mx-auto mb-4 opacity-20"/>
                <p className="font-bold uppercase tracking-widest text-sm">Results will appear here once announced.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Member portal quick links ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          {[
            { href: '/members',           label: 'Member Portal',  icon: <UserPlus size={18}/>, color: 'bg-slate-800 hover:bg-slate-700' },
            { href: '/members/dashboard', label: 'My Dashboard',   icon: <Shield size={18}/>,   color: 'bg-red-600 hover:bg-red-700' },
            { href: '/history',           label: 'Past Elections', icon: <Trophy size={18}/>,   color: 'bg-amber-600 hover:bg-amber-700' },
            { href: '/register/status',   label: 'App Status',     icon: <FileText size={18}/>, color: 'bg-blue-600 hover:bg-blue-700' },
          ].map(({ href, label, icon, color }) => (
            <Link key={href} href={href}
              className={`${color} text-white rounded-2xl p-4 flex flex-col items-center gap-2 text-center transition-all`}>
              {icon}
              <span className="font-black text-[10px] uppercase tracking-widest leading-tight">{label}</span>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}

// ─── Phase Card ──────────────────────────────────────────────────────────────
function PhaseCard({ icon, color, title, message, user }: {
  icon: React.ReactNode; color: 'yellow' | 'red';
  title: string; message: string; user: any;
}) {
  const colors = {
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', iconBg: 'bg-yellow-100', text: 'text-yellow-800', sub: 'text-yellow-700' },
    red:    { bg: 'bg-white',     border: 'border-slate-200',  iconBg: 'bg-red-100',    text: 'text-slate-900',  sub: 'text-slate-500' },
  }[color];

  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-[2.5rem] p-10 text-center shadow-xl`}>
      <div className={`w-20 h-20 ${colors.iconBg} rounded-full flex items-center justify-center mx-auto mb-6`}>
        {icon}
      </div>
      <h2 className={`text-2xl font-black uppercase italic ${colors.text} mb-3`}>{title}</h2>
      <p className={`${colors.sub} font-bold text-sm leading-relaxed max-w-md mx-auto`}>{message}</p>
      {!user && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link href="/members/login"
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-4 rounded-2xl text-sm transition-all">
            <LogIn size={16}/> Sign In
          </Link>
          <Link href="/members/register"
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase px-8 py-4 rounded-2xl text-sm transition-all">
            <UserPlus size={16}/> Register as Member
          </Link>
        </div>
      )}
    </div>
  );
}
