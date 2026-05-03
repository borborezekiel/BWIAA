"use client";

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Vote, ShieldCheck, LogOut, Loader2, CheckCircle2,
  AlertCircle, Fingerprint, Activity, Terminal, XCircle, Users,
  FileText,
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

const HEAD_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const CHAPTERS = [
  "Harbel Chapter","Montserrado Chapter","Grand Bassa Chapter","Nimba Chapter",
  "Weala Branch","Robertsport Branch","LAC Branch","Bong Chapter",
  "Paynesville Branch","Mother Chapter",
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
  // ── NEW: phase + member state ────────────────────────────────────────────────
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [isApprovedMember, setIsApprovedMember] = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          await loadVoterProfile(user);

          // ── NEW: check if this user is an approved member ──────────────────
          // Try auth_user_id first, fall back to email
          let mem: any = null;
          const { data: m1 } = await supabase.from('members')
            .select('id, status, auth_user_id')
            .eq('auth_user_id', user.id).maybeSingle();
          if (m1) {
            mem = m1;
          } else {
            const { data: m2 } = await supabase.from('members')
              .select('id, status, auth_user_id')
              .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
            if (m2) {
              mem = m2;
              // Auto-link auth_user_id if missing
              if (!m2.auth_user_id) {
                await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
              }
            }
          }
          setIsApprovedMember(mem?.status === 'approved');
        }

        // Fetch all settings
        const { data: settings } = await supabase.from('election_settings').select('*');
        if (settings) {
          const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
          const dl = get('voting_deadline');
          if (dl) setDeadline(dl);

          // ── NEW: read registration_open phase ──────────────────────────────
          setRegistrationOpen(get('registration_open') === 'true');

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

  useEffect(() => {
    if (!deadline) return;
    const tick = async () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('VOTING CLOSED');
        setVotingClosed(true);
        const archiveKey = `archived_${deadline}`;
        if (!localStorage.getItem(archiveKey)) {
          localStorage.setItem(archiveKey, '1');
          try {
            const [{ data: allVotes }, { data: allCandidates }] = await Promise.all([
              supabase.from('votes').select('*'),
              supabase.from('candidates').select('*'),
            ]);
            if (!allVotes || !allCandidates) return;
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
                historyRows.push({ election_year: year, election_name: `${orgName} ${electionTitle} ${year}`, chapter, position_name: position, winner_name: winnerName, winner_photo_url: winnerCand?.photo_url ?? null, total_votes: total, winner_votes: winnerVotes, archived_by: 'system' });
              });
            });
            if (historyRows.length > 0) {
              await supabase.from('election_history').upsert(historyRows, { onConflict: 'election_year,chapter,position_name' });
            }
          } catch (e) { console.error('Auto-archive error:', e); }
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
    const { data: haSetting } = await supabase
      .from('election_settings').select('value').eq('key', 'head_admins').maybeSingle();
    let headAdmins: string[] = [HEAD_ADMIN_EMAIL.toLowerCase()];
    if (haSetting?.value) { try { headAdmins = JSON.parse(haSetting.value).map((e: string) => e.toLowerCase()); } catch {} }
    if (headAdmins.includes(lowerEmail)) return;

    try {
      const { data: blocked } = await supabase
        .from('blacklisted_voters').select('email, reason').eq('email', lowerEmail).maybeSingle();
      if (blocked) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage(`ACCESS DENIED: This email has been blocked. Reason: ${blocked.reason}. Contact the Election Committee.`);
        return;
      }
      const { count, error: countError } = await supabase
        .from('eligible_voters').select('*', { count: 'exact', head: true });
      if (countError) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage('ACCESS DENIED: Unable to verify voter eligibility. Contact your administrator.');
        return;
      }
      if (!count || count === 0) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage('ACCESS DENIED: The voter roster has not been set up yet. Contact your chapter administrator.');
        return;
      }
      const { data: found } = await supabase
        .from('eligible_voters').select('email, chapter').eq('email', lowerEmail).maybeSingle();
      if (!found) {
        await supabase.auth.signOut(); localStorage.clear(); setUser(null); setMyChapter(null);
        setErrorMessage(`ACCESS DENIED: ${email} is not on the official voter roster. Contact your chapter administrator.`);
        return;
      }
      if (found.chapter && !myChapter) {
        setMyChapter(found.chapter);
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          await supabase.from('voter_profiles').upsert(
            [{ id: u.id, home_chapter: found.chapter }], { onConflict: 'id' }
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
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
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

  const tallyVotes = votes;

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
      <Loader2 className="animate-spin text-red-600" size={48} />
      <p className="font-black animate-pulse uppercase tracking-widest text-sm">Verifying National Identity...</p>
    </div>
  );

  // ── Landing page (not yet logged in / no chapter profile) ───────────────────
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-[#0a0a00] text-white overflow-x-hidden">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700;900&display=swap');
          :root {
            --gold: #D4A017;
            --gold-light: #F5C842;
            --gold-dark: #8B6914;
            --black: #0a0a00;
            --black2: #111100;
          }
          .font-bebas { font-family: 'Bebas Neue', sans-serif; }
          .font-oswald { font-family: 'Oswald', sans-serif; }
          .text-gold { color: var(--gold); }
          .text-gold-light { color: var(--gold-light); }
          .bg-gold { background-color: var(--gold); }
          .border-gold { border-color: var(--gold); }

          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(40px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; } to { opacity: 1; }
          }
          @keyframes ticker {
            from { transform: translateX(100%); }
            to   { transform: translateX(-100%); }
          }
          @keyframes pulse-gold {
            0%, 100% { box-shadow: 0 0 0 0 rgba(212,160,23,0.5); }
            50%       { box-shadow: 0 0 0 16px rgba(212,160,23,0); }
          }
          @keyframes shimmer {
            0%   { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          @keyframes roar {
            0%,100% { transform: scale(1); }
            50%      { transform: scale(1.03); }
          }
          .anim-1 { animation: fadeUp 0.7s ease forwards; }
          .anim-2 { animation: fadeUp 0.7s ease 0.15s forwards; opacity: 0; }
          .anim-3 { animation: fadeUp 0.7s ease 0.3s forwards; opacity: 0; }
          .anim-4 { animation: fadeUp 0.7s ease 0.45s forwards; opacity: 0; }
          .anim-5 { animation: fadeUp 0.7s ease 0.6s forwards; opacity: 0; }
          .anim-6 { animation: fadeUp 0.7s ease 0.75s forwards; opacity: 0; }
          .ticker-wrap { overflow: hidden; white-space: nowrap; }
          .ticker-inner { display: inline-block; animation: ticker 28s linear infinite; }
          .shimmer-text {
            background: linear-gradient(90deg, var(--gold) 0%, var(--gold-light) 40%, #fff8dc 50%, var(--gold-light) 60%, var(--gold) 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 3s linear infinite;
          }
          .tiger-pulse { animation: roar 4s ease-in-out infinite; }
          .chapter-btn {
            transition: all 0.25s ease;
            border: 1px solid rgba(212,160,23,0.2);
            background: rgba(212,160,23,0.04);
          }
          .chapter-btn:hover {
            border-color: var(--gold);
            background: rgba(212,160,23,0.12);
            transform: translateY(-3px);
            box-shadow: 0 8px 32px rgba(212,160,23,0.2);
          }
          .social-btn { transition: all 0.2s ease; }
          .social-btn:hover { transform: translateY(-2px); filter: brightness(1.2); }
          .gold-divider {
            height: 3px;
            background: linear-gradient(90deg, transparent, var(--gold), var(--gold-light), var(--gold), transparent);
          }
          .stripe-bg {
            background-image: repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 20px,
              rgba(212,160,23,0.03) 20px,
              rgba(212,160,23,0.03) 40px
            );
          }
          .fee-card {
            border: 1px solid rgba(212,160,23,0.2);
            background: rgba(212,160,23,0.05);
            transition: all 0.2s;
          }
          .fee-card:hover {
            border-color: var(--gold);
            background: rgba(212,160,23,0.1);
          }
        `}</style>

        {/* ── Error Modal ── */}
        {errorMessage && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-[#111100] border-2 border-red-600 p-10 rounded-3xl max-w-md w-full text-center shadow-2xl">
              <XCircle size={56} className="text-red-500 mx-auto mb-5" />
              <h2 className="font-bebas text-4xl text-white mb-3 tracking-wider">Access Denied</h2>
              <p className="text-white/60 mb-8 font-oswald leading-relaxed">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 hover:bg-red-700 text-white font-oswald font-bold py-4 rounded-2xl uppercase tracking-widest transition-all">Understood</button>
            </div>
          </div>
        )}

        {/* ── Live Announcements Ticker ── */}
        <div className="bg-[#D4A017] py-2.5">
          <div className="ticker-wrap">
            <div className="ticker-inner font-oswald font-bold text-black text-sm tracking-widest uppercase">
              {[
                "🐯 Welcome to the Official BWIAA 2026 National Alumni Portal",
                "⭐ One Legacy. One Family. One Future.",
                "🗳️ Select your chapter below to cast your vote",
                "📋 Candidate Registration is Now Open — Approved Members Apply Now",
                "🌐 Visit bwiaa.vercel.app — Stay Connected · Get Involved · Make an Impact",
                "🐯 Stronger Together. Tigers Forever.",
                "📣 Results will be announced the same day as voting closes",
              ].map((a, i) => (
                <span key={i} className="mx-12">{a}</span>
              ))}
              {/* Duplicate for seamless loop */}
              {[
                "🐯 Welcome to the Official BWIAA 2026 National Alumni Portal",
                "⭐ One Legacy. One Family. One Future.",
                "🗳️ Select your chapter below to cast your vote",
                "📋 Candidate Registration is Now Open — Approved Members Apply Now",
                "🌐 Visit bwiaa.vercel.app — Stay Connected · Get Involved · Make an Impact",
                "🐯 Stronger Together. Tigers Forever.",
              ].map((a, i) => (
                <span key={`b${i}`} className="mx-12">{a}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Hero Section ── */}
        <div className="relative stripe-bg">
          {/* Gold corner accents */}
          <div className="absolute top-0 left-0 w-32 h-32 border-t-4 border-l-4 border-gold opacity-30"/>
          <div className="absolute top-0 right-0 w-32 h-32 border-t-4 border-r-4 border-gold opacity-30"/>

          <div className="max-w-6xl mx-auto px-6 pt-12 pb-16">
            {/* Nav bar */}
            <div className="flex items-center justify-between mb-14 anim-1">
              <div className="flex items-center gap-4">
                {/* BWI crest placeholder */}
                <div className="w-14 h-14 rounded-full border-2 border-gold flex items-center justify-center bg-[#D4A017]/10 tiger-pulse">
                  <span className="font-bebas text-gold text-xl tracking-wider">BWI</span>
                </div>
                <div>
                  <p className="font-bebas text-gold tracking-[0.2em] text-sm">BOOKER WASHINGTON INSTITUTE</p>
                  <p className="font-oswald text-white/50 text-xs tracking-widest uppercase">Alumni Association</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/members"
                  className="font-oswald font-semibold text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl border border-gold/40 text-gold hover:bg-gold/10 transition-all">
                  Member Portal
                </Link>
                <Link href="/admin"
                  className="font-oswald font-semibold text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl bg-white/5 text-white/50 hover:text-white border border-white/10 transition-all">
                  Admin
                </Link>
              </div>
            </div>

            {/* Hero content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="anim-1">
                  <p className="font-oswald font-bold text-gold tracking-[0.3em] text-sm uppercase mb-4">
                    Official National Portal
                  </p>
                </div>
                <h1 className="anim-2">
                  <span className="font-bebas block text-[5rem] md:text-[7rem] leading-none tracking-wider shimmer-text">
                    BWIAA
                  </span>
                  <span className="font-bebas block text-[5rem] md:text-[7rem] leading-none tracking-wider text-white">
                    2026
                  </span>
                </h1>
                <p className="font-bebas text-3xl md:text-4xl text-gold-light tracking-widest mt-2 anim-3">
                  {electionConfig.election_title}
                </p>

                <div className="gold-divider my-8 anim-3"/>

                <div className="space-y-3 anim-4">
                  {["One Legacy. One Family. One Future.",
                    "The official home of the Booker Washington Institute Alumni Association.",
                    "Stay connected. Get involved. Make an impact."].map((t, i) => (
                    <p key={i} className={`font-oswald ${i === 0 ? 'text-gold font-bold text-xl' : 'text-white/60 text-sm'} leading-relaxed`}>{t}</p>
                  ))}
                </div>

                {/* Social links */}
                <div className="flex items-center gap-3 mt-8 anim-5">
                  <p className="font-oswald text-white/30 text-xs uppercase tracking-widest">Follow Us:</p>
                  {[
                    { label: 'WhatsApp', color: 'bg-[#25D366]', href: 'https://wa.me/', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.855L0 24l6.305-1.508A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.366l-.358-.214-3.742.895.953-3.641-.234-.374A9.818 9.818 0 1112 21.818z"/></svg>
                    )},
                    { label: 'Facebook', color: 'bg-[#1877F2]', href: 'https://facebook.com/', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    )},
                    { label: 'Instagram', color: 'bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]', href: 'https://instagram.com/', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    )},
                  ].map(s => (
                    <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                      className={`social-btn ${s.color} w-9 h-9 rounded-xl flex items-center justify-center shadow-lg`}
                      title={s.label}>
                      {s.icon}
                    </a>
                  ))}
                  <a href="https://bwiaa.vercel.app" target="_blank" rel="noopener noreferrer"
                    className="social-btn flex items-center gap-2 border border-gold/40 text-gold font-oswald font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-gold/10 transition-all">
                    🌐 bwiaa.vercel.app
                  </a>
                </div>
              </div>

              {/* Right: Chapter voting grid */}
              <div className="anim-4">
                <p className="font-oswald font-semibold text-white/40 text-xs uppercase tracking-[0.3em] mb-5 text-center">
                  Select Your Chapter to Vote
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {CHAPTERS.map((c, i) => (
                    <button key={c} onClick={() => handleChapterSelect(c)}
                      className="chapter-btn rounded-2xl p-4 flex flex-col items-center gap-3 text-center group"
                      style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center group-hover:bg-gold/20 transition-all">
                        <Vote size={18} className="text-gold"/>
                      </div>
                      <span className="font-oswald font-semibold text-white/80 text-xs uppercase tracking-wider leading-tight group-hover:text-gold transition-all">{c}</span>
                    </button>
                  ))}
                </div>
                <p className="text-center text-white/20 font-oswald text-xs mt-5 tracking-widest uppercase">
                  Voting is by secret ballot · One member, one vote
                </p>
              </div>
            </div>
          </div>

          <div className="gold-divider"/>
        </div>

        {/* ── Pillars Section ── */}
        <div className="bg-[#0d0d00] py-16 anim-5">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { icon: '👥', title: 'Stay Connected', desc: 'Reconnect with old friends and meet fellow Tigers.' },
                { icon: '📅', title: 'Get Involved',   desc: 'Join events, programs, and initiatives that make a difference.' },
                { icon: '🎓', title: 'Empower Futures', desc: 'Support scholarships and mentorship for the next generation.' },
                { icon: '📣', title: 'Stay Informed',  desc: 'Get the latest updates, news, and chapter announcements.' },
              ].map(p => (
                <div key={p.title} className="text-center group">
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform inline-block">{p.icon}</div>
                  <p className="font-oswald font-bold text-gold uppercase tracking-widest text-sm mb-2">{p.title}</p>
                  <p className="font-oswald text-white/40 text-xs leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="gold-divider"/>

        {/* ── Chapters Grid ── */}
        <div className="bg-[#0a0a00] py-16 stripe-bg">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-10 anim-5">
              <h2 className="font-bebas text-5xl tracking-widest text-white">
                Our Chapters. <span className="text-gold">Our Strength.</span>
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
              {CHAPTERS.map(c => (
                <div key={c} className="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded-xl px-4 py-3">
                  <CheckCircle2 size={12} className="text-gold shrink-0"/>
                  <span className="font-oswald font-semibold text-white/70 text-xs uppercase tracking-wide">{c}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <p className="font-bebas text-3xl md:text-4xl text-white tracking-wider">
                We Are More Than a Network.
              </p>
              <p className="font-bebas text-2xl md:text-3xl text-gold tracking-wider mt-1">
                We Are a Movement. We Are BWIAA.
              </p>
            </div>
          </div>
        </div>

        <div className="gold-divider"/>

        {/* ── Run for Office Section ── */}
        <div className="bg-[#0d0d00] py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div>
                <h2 className="font-bebas text-5xl md:text-6xl text-white tracking-wider leading-tight mb-4">
                  Lead. Serve.<br/><span className="text-gold">Make History.</span>
                </h2>
                <p className="font-oswald text-white/50 mb-8 leading-relaxed">
                  Run for office in BWIAA 2026 and be part of shaping the future of our association.
                </p>
                <Link href="/register"
                  className="inline-flex items-center gap-3 bg-gold hover:bg-gold-light text-black font-oswald font-bold uppercase tracking-widest px-8 py-4 rounded-2xl transition-all text-sm"
                  style={{ animation: 'pulse-gold 2s ease-in-out infinite' }}>
                  <FileText size={18}/> Apply to Run
                </Link>
                <div className="mt-8 space-y-2">
                  {["Make your voice count","Support your chapter and community","Build leadership and lifelong skills","Leave a legacy that inspires"].map(w => (
                    <div key={w} className="flex items-center gap-3">
                      <CheckCircle2 size={14} className="text-gold shrink-0"/>
                      <p className="font-oswald text-white/60 text-sm">{w}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-oswald font-bold text-white/30 text-xs uppercase tracking-[0.3em] mb-4">Registration Fees</p>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {electionConfig.positions_fees.map(({ position, fee }) => (
                    <div key={position} className="fee-card rounded-2xl p-4 text-center">
                      <p className="font-bebas text-3xl text-gold tracking-wider">{electionConfig.currency_symbol}{fee.toLocaleString()}</p>
                      <p className="font-oswald font-semibold text-white/50 text-[10px] uppercase tracking-widest leading-tight mt-1">{position}</p>
                    </div>
                  ))}
                </div>

                {/* EC Guidelines */}
                <div className="border border-gold/20 rounded-2xl p-6 bg-gold/3">
                  <p className="font-oswald font-bold text-gold text-xs uppercase tracking-[0.3em] mb-4">EC Guidelines</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {["Registration of Candidates (Timeline Required)","Certification of Qualified Candidates","Voting shall be by secret ballot","Accreditation of Voters","Screening via Class Name, Year Graduated, Sponsor & Principal","Results announced same day"].map(g => (
                      <div key={g} className="flex items-start gap-2">
                        <CheckCircle2 size={11} className="text-gold shrink-0 mt-0.5"/>
                        <p className="font-oswald text-white/40 text-xs leading-tight">{g}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="gold-divider"/>

        {/* ── Quick Links ── */}
        <div className="bg-[#0a0a00] py-10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { href: '/register/status', label: 'Check Application Status', icon: '📋' },
                { href: '/members',         label: 'Member Portal',            icon: '👤' },
                { href: '/history',         label: 'Election History',         icon: '🏆' },
              ].map(l => (
                <Link key={l.href} href={l.href}
                  className="flex items-center gap-4 border border-gold/20 hover:border-gold/60 bg-gold/3 hover:bg-gold/8 rounded-2xl px-6 py-5 transition-all group">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{l.icon}</span>
                  <span className="font-oswald font-semibold text-white/60 group-hover:text-gold text-sm uppercase tracking-widest transition-all">{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="gold-divider"/>
        <div className="bg-[#050500] py-10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <p className="font-bebas text-3xl text-gold tracking-widest">BWIAA 2026</p>
                <p className="font-oswald text-white/30 text-xs uppercase tracking-widest mt-1">Booker Washington Institute Alumni Association</p>
              </div>
              <div className="flex items-center gap-4">
                {[
                  { label: 'WhatsApp', color: '#25D366', href: 'https://wa.me/' },
                  { label: 'Facebook', color: '#1877F2', href: 'https://facebook.com/' },
                  { label: 'Instagram', color: '#E1306C', href: 'https://instagram.com/' },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="font-oswald font-semibold text-xs uppercase tracking-widest px-4 py-2 rounded-xl border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all">
                    {s.label}
                  </a>
                ))}
              </div>
              <div className="text-center md:text-right">
                <p className="font-bebas text-xl text-gold/60 tracking-widest">Stronger Together.</p>
                <p className="font-bebas text-xl text-gold tracking-widest">Tigers Forever. 🐯</p>
              </div>
            </div>
            <div className="border-t border-white/5 mt-8 pt-6 text-center">
              <p className="font-oswald text-white/20 text-xs tracking-widest uppercase">
                Join Today · Be Part of Something Bigger Than Yourself · 🌐 bwiaa.vercel.app
              </p>
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
              <button onClick={() => setConfirm(null)} disabled={casting} className="flex-1 bg-slate-100 text-slate-700 font-black py-4 rounded-2xl uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50">Go Back</button>
              <button onClick={castBallot} disabled={casting} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
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
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {deadline && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${votingClosed ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                <Activity size={12}/>
                {votingClosed ? 'VOTING CLOSED' : timeLeft}
              </div>
            )}

            {/* ── NEW: Apply for Office button — only shows when registration is open AND user is approved member ── */}
            {registrationOpen && isApprovedMember && (
              <Link href="/register"
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-md">
                <FileText size={13}/> Apply for Office
              </Link>
            )}

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

      {/* ── NEW: Apply for Office banner — prominent strip below header ── */}
      {registrationOpen && isApprovedMember && (
        <div className="bg-slate-900 text-white px-6 py-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-red-600 rounded-xl p-2.5 shrink-0">
                <FileText size={20} className="text-white"/>
              </div>
              <div>
                <p className="font-black uppercase text-sm">Candidate Registration is Open</p>
                <p className="text-white/50 text-xs font-bold mt-0.5">You are an approved member — submit your candidacy application now.</p>
              </div>
            </div>
            <Link href="/register"
              className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-8 py-3 rounded-2xl text-sm transition-all shrink-0 flex items-center gap-2">
              Apply Now →
            </Link>
          </div>
        </div>
      )}

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
                        ${hasVoted || votingClosed ? 'border-slate-100 cursor-not-allowed bg-slate-50/50 opacity-70' : 'border-slate-100 hover:border-red-600 bg-white active:scale-95 hover:shadow-xl'}`}>
                      <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-slate-100 mb-3 border-2 border-slate-200 shrink-0">
                        {cand.photo_url
                          ? <img src={cand.photo_url} alt={cand.full_name} className="w-full h-full object-cover"/>
                          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                              <span className="text-xl md:text-3xl font-black text-slate-500">{cand.full_name.charAt(0)}</span>
                            </div>}
                      </div>
                      <p className="font-black text-slate-800 text-xs md:text-sm uppercase leading-tight mb-2">{cand.full_name}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xl md:text-3xl font-black text-red-600">{count}</span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold leading-tight text-left">National<br/>Tally</span>
                      </div>
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
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-yellow-200 animate-ping opacity-40"/>
                <div className="absolute inset-2 rounded-full border-4 border-yellow-300 animate-ping opacity-30" style={{ animationDelay: '0.3s' }}/>
                <div className="absolute inset-4 rounded-full bg-yellow-400 flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
              </div>
              <h2 className="text-2xl font-black uppercase italic text-slate-900 mb-3">Ballot Not Ready Yet</h2>
              <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">
                Candidates for the <span className="text-red-600 font-black">{myChapter}</span> chapter have not been finalised yet. Your ballot will appear here once the Election Committee has confirmed all candidates for your chapter.
              </p>
              <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Registration</p>
                <div className="flex justify-between"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Chapter</span><span className="text-xs font-black text-slate-800">{myChapter ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Class Year</span><span className="text-xs font-black text-slate-800">{myClass ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Email</span><span className="text-xs font-black text-slate-800">{user?.email}</span></div>
                <div className="flex justify-between"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Status</span><span className="text-xs font-black text-green-600">✓ Verified Voter</span></div>
              </div>
              {deadline && !votingClosed && (
                <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                  <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mb-1">Election Countdown</p>
                  <p className="text-red-500 font-black text-2xl tabular-nums">{timeLeft}</p>
                </div>
              )}
              <p className="text-xs text-slate-400 font-bold">This page will update automatically when candidates are added. You can check back later or contact your chapter administrator.</p>
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
