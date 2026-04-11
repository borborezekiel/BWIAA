"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, LogOut, Loader2, Award, CheckCircle2, TrendingUp } from 'lucide-react';

export default function BWIAAElection2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null); // For the Voter Receipt popup

  const chapters = ["Harbel and RIA", "Monrovia", "Buchanan", "Gbarnga", "Kakata", "Voinjama", "Zwedru", "Robertsport", "Greenville", "Harper", "Sanniquellie", "Cestos City"];
  
  const positions = [
    { title: "President", candidates: ["Candidate A", "Candidate B"] },
    { title: "Vice President (Admin)", candidates: ["Candidate C", "Candidate D"] },
    { title: "Secretary General", candidates: ["Candidate E", "Candidate F"] },
    { title: "Treasurer", candidates: ["Candidate G", "Candidate H"] }
    // (You can add the other 3 positions back here)
  ];

  useEffect(() => {
    checkUser();
    refreshVotes();
    const liveUpdate = supabase.channel('election').on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes()).subscribe();
    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const { data } = await supabase.from('voter_profiles').select('home_chapter').eq('id', session.user.id).maybeSingle();
        if (data) setMyChapter(data.home_chapter);
      }
    } finally { setLoading(false); }
  }

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  async function castVote(pos: string, cand: string) {
    const { data, error } = await supabase.from('votes').insert([{ 
      position_name: pos, candidate_name: cand, voter_name: user.email, voter_id: user.id, chapter: myChapter
    }]).select().single();

    if (error) alert("Integrity Check: Already voted for this job! 🛑");
    else setReceipt(data); // Shows the digital receipt
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-black animate-pulse">VERIFYING BWIAA ID...</div>;

  // --- VIEW 1: CHAPTER SELECTOR ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <h1 className="text-white text-5xl font-black mb-10 text-center italic tracking-tighter">SELECT YOUR BRANCH 🗳️</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl w-full">
          {chapters.map(c => (
            <button key={c} onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="bg-slate-900 border border-white/10 hover:border-red-600 p-8 rounded-3xl text-white font-bold transition-all flex flex-col items-center gap-3">
              <Vote size={32} className="text-red-600" /> {c}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* HEADER */}
      <header className="bg-white border-b-2 p-6 mb-10 sticky top-0 z-40 shadow-sm flex justify-between items-center max-w-5xl mx-auto rounded-b-3xl">
        <div className="font-black text-xl text-slate-900">BWIAA 2026</div>
        <div className="flex gap-4 items-center">
            <span className="text-xs font-bold bg-red-100 text-red-600 px-4 py-1 rounded-full uppercase">{myChapter}</span>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())}><LogOut size={20} className="text-slate-400" /></button>
        </div>
      </header>

      {/* VOTER RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[3rem] max-w-md w-full text-center shadow-2xl border-t-8 border-green-500">
            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-slate-800">BALLOT SECURED!</h2>
            <p className="text-slate-500 mb-6 text-sm">Your vote has been recorded in the national ledger.</p>
            <div className="bg-slate-50 p-4 rounded-2xl text-left font-mono text-xs mb-6 border border-slate-200">
              <p>Receipt ID: {receipt.id}</p>
              <p>Position: {receipt.position_name}</p>
              <p>Chapter: {receipt.chapter}</p>
              <p>Timestamp: {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl">Close Receipt</button>
          </div>
        </div>
      )}

      {/* MAIN BALLOT */}
      <main className="max-w-4xl mx-auto px-4 space-y-12 mb-20">
        {positions.map(pos => (
          <section key={pos.title} className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-red-600">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-3 italic">
                <Award className="text-red-600" /> {pos.title}
            </h2>
            <div className="grid gap-4">
              {pos.candidates.map(cand => {
                const count = votes.filter(v => v.chapter === myChapter && v.candidate_name === cand).length;
                const total = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title).length;
                return (
                  <button key={cand} onClick={() => castVote(pos.title, cand)} className="relative w-full text-left p-8 rounded-[2rem] border-2 border-slate-100 hover:border-red-600 overflow-hidden transition-all group">
                    <div className="relative z-10 flex justify-between font-black">
                        <span>{cand}</span>
                        <span className="text-red-600 text-2xl">{count}</span>
                    </div>
                    <div className="absolute left-0 top-0 h-full bg-red-50 -z-10 transition-all duration-1000" style={{ width: `${total > 0 ? (count/total)*100 : 0}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* CHAPTER PROGRESS TRACKER (LEADERBOARD) */}
      <footer className="max-w-4xl mx-auto bg-slate-900 rounded-[3rem] p-10 text-white shadow-3xl mx-4">
        <h3 className="text-xl font-black mb-8 flex items-center gap-2">
            <TrendingUp className="text-blue-400" /> CHAPTER TURNOUT PROGRESS
        </h3>
        <div className="space-y-6">
          {chapters.sort((a,b) => votes.filter(v => v.chapter === b).length - votes.filter(v => v.chapter === a).length).slice(0, 5).map(c => {
            const chapterTotal = votes.filter(v => v.chapter === c).length;
            return (
              <div key={c} className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>{c}</span>
                  <span>{chapterTotal} Votes Cast</span>
                </div>
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-white/5">
                  <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${Math.min((chapterTotal/100)*100, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Official BWIAA Audit System 2026</p>
      </footer>
    </div>
  );
}
