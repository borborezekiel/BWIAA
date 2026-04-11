"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, Globe, Lock } from 'lucide-react';

export default function Election2026() {
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
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
      const { data } = await supabase.from('voter_profiles').select('home_chapter').eq('id', session.user.id).single();
      if (data) setMyChapter(data.home_chapter);
    }
    setLoading(false);
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
      if (pending) {
        savePermanentChapter(pending);
      }
    }
  }, [user]);

  async function savePermanentChapter(chapter: string) {
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
    if (!user) return alert("Please Sign In first! 🔑");
    const { error } = await supabase.from('votes').insert([{ 
      position_name: pos, 
      candidate_name: cand, 
      voter_name: user.email,
      voter_id: user.id,
      chapter: myChapter
    }]);
    if (error) alert("You have already voted for this position! 🛑");
    else alert(`Vote cast for ${cand}! 🎉`);
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold italic">Waking up the brain...</div>;

  // --- VIEW 1: THE BALLOT BOX CHAPTER WALL ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 md:p-12 flex flex-col items-center">
        <header className="text-center mb-12 max-w-2xl">
          <div className="bg-blue-600/20 text-blue-400 p-3 rounded-2xl inline-block mb-4">
            <Globe size={32} />
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tighter uppercase">National Election 2026</h1>
          <p className="text-slate-400 font-medium text-lg leading-relaxed">
            Welcome, Voter. Please select your <span className="text-blue-400 font-bold underline decoration-2 underline-offset-4">Chapter Branch</span> to begin the secure login process.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-w-6xl">
          {chapters.map(c => (
            <button 
              key={c} 
              onClick={() => pickChapterAndLogin(c)} 
              className="group bg-slate-800/40 hover:bg-blue-600 border-2 border-white/5 hover:border-blue-400 p-8 rounded-[2rem] transition-all duration-300 flex flex-col items-center gap-4 text-center active:scale-95"
            >
              <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-white/10 transition-colors">
                <Vote size={40} className="text-blue-400 group-hover:text-white" />
              </div>
              <span className="text-white text-xl font-black">{c}</span>
            </button>
          ))}
        </div>
        <p className="mt-12 text-slate-500 font-bold text-xs uppercase tracking-[0.2em] flex items-center gap-2">
          <Lock size={14} /> Permanent Choice • Secure Audit System
        </p>
      </div>
    );
  }

  // --- VIEW 2: THE VOTING PAGE ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <header className="max-w-4xl mx-auto text-center mb-12">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-8">
          <div className="bg-blue-600 text-white px-6 py-2 rounded-full font-black flex items-center gap-2 text-sm shadow-xl">
            <ShieldCheck size={18} /> {myChapter.toUpperCase()} CHAPTER 🔒
          </div>
          <div className="bg-white border-2 border-slate-200 px-6 py-2 rounded-full font-bold text-slate-500 flex items-center gap-2 text-sm">
            <User size={18} /> {user?.email}
          </div>
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter uppercase mb-4 italic">Official Ballot</h1>
      </header>

      <main className="max-w-4xl mx-auto space-y-12">
        {positions.map((pos) => (
          <section key={pos.title} className="bg-white p-6 md:p-10 rounded-[3rem] shadow-2xl border-t-[10px] border-blue-600">
            <h2 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-3">
              <span className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-lg">!</span>
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
                    className="relative w-full text-left p-6 md:p-8 rounded-[2rem] border-2 border-slate-100 hover:border-blue-400 transition-all overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div className="relative z-10 flex justify-between items-center">
                      <span className="font-black text-xl md:text-2xl group-hover:text-blue-700 transition-colors uppercase tracking-tight">{candidate}</span>
                      <div className="text-right">
                        <span className="font-black text-3xl text-blue-600 block leading-none">{count}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Votes in Branch</span>
                      </div>
                    </div>
                    <div className="absolute left-0 top-0 h-full bg-blue-50/80 -z-10 transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <footer className="max-w-4xl mx-auto mt-20 p-10 bg-slate-900 rounded-[3rem] text-white shadow-3xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-6">
            <h3 className="font-black uppercase tracking-widest text-blue-400">National Live Tally</h3>
            <span className="text-4xl font-black">{votes.length} Total</span>
        </div>
        <div className="space-y-3 opacity-60 font-mono text-[10px] md:text-xs">
          {votes.slice(-3).map((v, i) => (
            <p key={i} className="flex gap-2 truncate text-blue-100">• {v.voter_name} recorded a vote in {v.chapter} chapter for {v.candidate_name}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
