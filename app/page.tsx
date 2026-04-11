"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, Globe, Lock, Loader2, LogOut } from 'lucide-react';

export default function BWIAAElection2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const chapters = [
    "Harbel and RIA", "Monrovia", "Buchanan", "Gbarnga", 
    "Kakata", "Voinjama", "Zwedru", "Robertsport", 
    "Greenville", "Harper", "Sanniquellie", "Cestos City"
  ];

  const positions = [
    { title: "President", candidates: ["Candidate A", "Candidate B"] },
    { title: "Vice President (Administration)", candidates: ["Candidate C", "Candidate D"] },
    { title: "Secretary General", candidates: ["Candidate E", "Candidate F"] },
    { title: "Financial Secretary", candidates: ["Candidate G", "Candidate H"] },
    { title: "Treasurer", candidates: ["Candidate I", "Candidate J"] },
    { title: "Media & Publicity CHAIRMAN", candidates: ["Candidate K", "Candidate L"] },
    { title: "CHAPLAIN", candidates: ["Candidate M", "Candidate N"] }
  ];

  useEffect(() => {
    checkUser();
    refreshVotes();
    
    // LIVE LISTENER: Updates everything instantly when a vote is cast
    const liveUpdate = supabase.channel('election').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes()).subscribe();
    
    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        // Check if voter already has a locked chapter profile
        const { data } = await supabase.from('voter_profiles')
          .select('home_chapter')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data) setMyChapter(data.home_chapter);
      } else {
        setUser(null);
        setMyChapter(null);
      }
    } catch (err) {
      console.error("Auth error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setMyChapter(null);
    window.location.reload(); // Fresh start
  }

  async function pickChapterAndLogin(chapter: string) {
    localStorage.setItem('pending_chapter', chapter);
    await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }

  useEffect(() => {
    if (user && !myChapter) {
      const pending = localStorage.getItem('pending_chapter');
      if (pending) savePermanentChapter(pending);
    }
  }, [user]);

  async function savePermanentChapter(chapter: string) {
    // SECURITY: Double check they don't have a chapter in the DB already
    const { data: existing } = await supabase.from('voter_profiles').select('*').eq('id', user.id).maybeSingle();
    
    if (existing) {
      setMyChapter(existing.home_chapter);
      localStorage.removeItem('pending_chapter');
      return;
    }

    const { error } = await supabase.from('voter_profiles').insert([{ id: user.id, home_chapter: chapter }]);
    if (!error) {
      setMyChapter(chapter);
      localStorage.removeItem('pending_chapter');
    }
  }

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  async function castVote(pos: string, cand: string) {
    if (!user) return alert("Please Sign In first!");
    const { error } = await supabase.from('votes').insert([{ 
      position_name: pos, 
      candidate_name: cand, 
      voter_name: user.email,
      voter_id: user.id,
      chapter: myChapter
    }]);
    if (error) alert("Integrity Lock: You have already voted for this position! 🛑");
    else alert(`Ballot recorded for ${cand}! 🎉`);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <Loader2 className="animate-spin text-red-600 mb-4" size={48} />
      <p className="font-bold text-xl tracking-widest uppercase italic">Verifying Identity...</p>
    </div>
  );

  // --- VIEW 1: CHAPTER SELECTOR (ONLY IF NOT LOGGED IN) ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 md:p-12 flex flex-col items-center">
        <header className="text-center mb-12 max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tighter uppercase italic italic">BWIAA 2026</h1>
          <p className="text-red-500 font-bold text-lg mb-6 tracking-widest uppercase">Booker Washington Institute Alumni Association</p>
          <div className="h-1 w-24 bg-red-600 mx-auto mb-10"></div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
            Choose your <span className="text-white font-bold">Chapter Branch</span> to access your digital ballot. Your choice is permanent.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
          {chapters.map(c => (
            <button 
              key={c} 
              onClick={() => pickChapterAndLogin(c)} 
              className="group bg-slate-900 border border-white/10 hover:border-red-600 p-6 rounded-3xl transition-all duration-300 flex flex-col items-center gap-4 text-center active:scale-95 shadow-2xl"
            >
              <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-red-600/20 transition-colors">
                <Vote size={32} className="text-red-600 group-hover:text-white" />
              </div>
              <span className="text-white text-lg font-black leading-tight">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- VIEW 2: THE OFFICIAL BRANCH BALLOT ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-white border-b-2 border-slate-200 p-6 mb-10 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-red-600 text-white p-3 rounded-2xl shadow-lg">
                <ShieldCheck size={24} />
            </div>
            <div>
                <h1 className="text-xl font-black text-slate-900 leading-none">BWIAA OFFICIAL BALLOT</h1>
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mt-1">{myChapter} Branch Only</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Voter Identified</span>
                <span className="text-sm font-black text-slate-700">{user?.email}</span>
            </div>
            <button 
              onClick={handleSignOut}
              className="bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 p-3 rounded-2xl transition-all border border-slate-200"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 space-y-12">
        {positions.map((pos) => (
          <section key={pos.title} className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border-b-[16px] border-slate-200">
            <h2 className="text-3xl font-black text-slate-800 mb-10 uppercase tracking-tighter italic flex items-center gap-4">
              <span className="bg-red-600 text-white w-2 h-10 rounded-full"></span>
              {pos.title}
            </h2>
            
            <div className="grid gap-6">
              {pos.candidates.map(candidate => {
                const chapterVotes = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title);
                const count = chapterVotes.filter(v => v.candidate_name === candidate).length;
                const total = chapterVotes.length;
                const percent = total > 0 ? (count / total) * 100 : 0;

                return (
                  <button 
                    key={candidate}
                    onClick={() => castVote(pos.title, candidate)}
                    className="relative w-full text-left p-8 rounded-[2.5rem] border-2 border-slate-100 hover:border-red-600 transition-all overflow-hidden group shadow-sm bg-slate-50/50"
                  >
                    <div className="relative z-10 flex justify-between items-center">
                      <span className="font-black text-xl md:text-2xl group-hover:text-red-700 transition-colors uppercase tracking-tight">{candidate}</span>
                      <div className="text-right">
                        <span className="font-black text-4xl text-red-600 block leading-none">{count}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 block">Local Tally</span>
                      </div>
                    </div>
                    {/* SWEET PROGRESS BAR: Animates smoothly */}
                    <div 
                      className="absolute left-0 top-0 h-full bg-red-100/50 border-r-4 border-red-200 -z-10 transition-all duration-1000 ease-out" 
                      style={{ width: `${percent}%` }} 
                    />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-12 bg-slate-900 rounded-[3rem] text-white shadow-3xl">
        <div className="flex flex-col md:flex-row justify-between items-center border-b border-slate-800 pb-8 mb-8 gap-4">
            <h3 className="font-black uppercase tracking-[0.3em] text-slate-500 text-sm italic">National Audit Intelligence</h3>
            <div className="flex items-center gap-6">
                <div className="text-center">
                    <p className="text-3xl font-black text-white">{votes.length}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Global Votes</p>
                </div>
            </div>
        </div>
        <div className="space-y-4 opacity-50 font-mono text-[10px] md:text-xs">
          {votes.slice(-3).reverse().map((v, i) => (
            <p key={i} className="flex gap-3 truncate">• <span className="text-red-500 font-bold">[{v.chapter.toUpperCase()}]</span> {v.voter_name} verified ballot for {v.candidate_name}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
