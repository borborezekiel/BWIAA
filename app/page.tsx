"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, Globe, Lock, Loader2 } from 'lucide-react';

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
    
    const liveUpdate = supabase.channel('election').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes()).subscribe();
    
    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const { data } = await supabase.from('voter_profiles')
          .select('home_chapter')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data) setMyChapter(data.home_chapter);
      }
    } catch (err) {
      console.error("Auth error:", err);
    } finally {
      setLoading(false); // ALWAYS stops the loading screen
    }
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
    const { error } = await supabase.from('voter_profiles').insert([{ id: user.id, home_chapter: chapter }]);
    if (!error) {
      setMyChapter(chapter);
      localStorage.removeItem('pending_chapter');
    } else {
      // If error, check if they already had a chapter saved
      checkUser();
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
    if (error) alert("Integrity Check: You have already voted for this position! 🛑");
    else alert(`Vote cast for ${cand}! 🎉`);
  }

  // --- LOADING SCREEN ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="font-bold text-xl animate-pulse">Waking up the brain...</p>
      </div>
    );
  }

  // --- VIEW 1: CHAPTER SELECTION (BALLOT BOXES) ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 md:p-12 flex flex-col items-center">
        <header className="text-center mb-12 max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tighter uppercase">BWIAA 2026</h1>
          <p className="text-blue-400 font-bold text-lg mb-6">Booker Washington Institute Alumni Association</p>
          <div className="h-1 w-24 bg-red-600 mx-auto mb-6"></div>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Select your <span className="text-white font-bold">Chapter Branch</span> to verify your identity and cast your official ballot.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
          {chapters.map(c => (
            <button 
              key={c} 
              onClick={() => pickChapterAndLogin(c)} 
              className="group bg-slate-800/40 hover:bg-red-700 border-2 border-white/5 hover:border-red-500 p-6 rounded-[2rem] transition-all duration-300 flex flex-col items-center gap-4 text-center active:scale-95 shadow-xl"
            >
              <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-white/10 transition-colors">
                <Vote size={32} className="text-red-500 group-hover:text-white" />
              </div>
              <span className="text-white text-lg font-black leading-tight">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- VIEW 2: THE OFFICIAL BALLOT ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-white border-b-2 border-slate-200 p-6 mb-10 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <h1 className="text-2xl font-black text-slate-900">BWIAA ELECTION 2026</h1>
            <div className="flex items-center gap-2 text-xs font-bold text-red-600 uppercase tracking-widest">
              <ShieldCheck size={14} /> {myChapter} Chapter
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-2xl border border-slate-200">
            <User size={18} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-600">{user?.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 space-y-10">
        {positions.map((pos) => (
          <section key={pos.title} className="bg-white p-6 md:p-10 rounded-[3rem] shadow-xl border-t-[8px] border-red-600">
            <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight flex items-center gap-2">
              <div className="w-2 h-8 bg-red-600 rounded-full"></div>
              {pos.title}
            </h2>
            
            <div className="grid gap-4">
              {pos.candidates.map(candidate => {
                const count = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title && v.candidate_name === candidate).length;
                const total = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title).length;
                const percent = total > 0 ? (count / total) * 100 : 0;

                return (
                  <button 
                    key={candidate}
                    onClick={() => castVote(pos.title, candidate)}
                    className="relative w-full text-left p-6 rounded-[2rem] border-2 border-slate-100 hover:border-red-400 transition-all overflow-hidden group bg-slate-50/30"
                  >
                    <div className="relative z-10 flex justify-between items-center">
                      <span className="font-black text-lg md:text-xl group-hover:text-red-700 transition-colors">{candidate}</span>
                      <div className="text-right">
                        <span className="font-black text-2xl text-red-600 block leading-none">{count}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch Votes</span>
                      </div>
                    </div>
                    <div className="absolute left-0 top-0 h-full bg-red-50 -z-10 transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <footer className="max-w-4xl mx-auto mt-20 mx-4 p-8 bg-slate-900 rounded-[2.5rem] text-white">
        <div className="flex justify-between items-center mb-6">
            <h3 className="font-black uppercase text-sm tracking-widest text-slate-400 italic">Audit Log</h3>
            <span className="bg-red-600 px-4 py-1 rounded-full text-xs font-black uppercase">Live Updates</span>
        </div>
        <div className="space-y-2 opacity-60 font-mono text-[10px] md:text-xs">
          {votes.slice(-3).reverse().map((v, i) => (
            <p key={i} className="truncate">• {v.voter_name} verified in {v.chapter} for {v.candidate_name}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
