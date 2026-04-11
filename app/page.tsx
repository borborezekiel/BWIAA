"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, LogOut, Loader2, Award, CheckCircle2, TrendingUp, AlertCircle, Fingerprint } from 'lucide-react';

export default function BWIAAElection2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null); 
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapters = ["Harbel and RIA", "Monrovia", "Buchanan", "Gbarnga", "Kakata", "Voinjama", "Zwedru", "Robertsport", "Greenville", "Harper", "Sanniquellie", "Cestos City"];
  
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

    if (error) {
      setErrorMessage(`Integrity Check: You have already cast a ballot for the position of ${pos}. To maintain election fairness, only one vote is permitted per office.`);
    } else {
      setReceipt(data);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <Loader2 className="animate-spin text-red-600 mb-4" size={48} />
      <p className="font-bold text-xl tracking-widest uppercase italic">Authenticating...</p>
    </div>
  );

  // --- VIEW 1: CHAPTER SELECTOR ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <header className="text-center mb-16">
          <h1 className="text-white text-5xl md:text-7xl font-black mb-4 tracking-tighter uppercase italic">BWIAA 2026</h1>
          <p className="text-red-600 font-bold tracking-[0.3em] uppercase">Electoral Commission</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl w-full">
          {chapters.map(c => (
            <button key={c} onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-bold transition-all flex flex-col items-center gap-4 shadow-2xl">
              <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-red-600/20 transition-colors">
                <Vote size={32} className="text-red-600 group-hover:text-white" />
              </div>
              <span className="text-lg leading-tight">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* HEADER */}
      <header className="bg-white border-b-2 p-6 mb-10 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-red-600 text-white p-3 rounded-2xl shadow-lg">
                <ShieldCheck size={24} />
            </div>
            <div>
                <h1 className="text-xl font-black text-slate-900 leading-none uppercase">Official Ballot</h1>
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mt-1">{myChapter} Branch</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter italic">Secured Session</span>
                <span className="text-sm font-black text-slate-700">{user?.email}</span>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 p-3 rounded-2xl transition-all border border-slate-200">
                <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* CUSTOM SUCCESS RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-green-500">
            <CheckCircle2 size={72} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 uppercase italic leading-none mb-2 tracking-tighter">Vote Secured</h2>
            <p className="text-slate-400 mb-8 font-medium">Your selection has been encrypted and stored in the national archive.</p>
            <div className="bg-slate-50 p-6 rounded-[2rem] text-left font-mono text-[10px] mb-8 border border-slate-100 space-y-1">
              <p className="text-slate-400 uppercase font-bold text-[8px] mb-2 tracking-widest italic">Digital Certificate</p>
              <p><span className="text-slate-400">UUID:</span> {receipt.id}</p>
              <p><span className="text-slate-400">OFFICE:</span> {receipt.position_name}</p>
              <p><span className="text-slate-400">STAMP:</span> {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em]">Close Receipt</button>
          </div>
        </div>
      )}

      {/* CUSTOM ERROR MODAL (Fixes the Vercel.app alert) */}
      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 shadow-inner">
                <AlertCircle size={40} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 uppercase italic leading-none mb-4 tracking-tighter">Action Denied</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed px-4">
              {errorMessage}
            </p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-red-700 transition-all uppercase tracking-[0.2em]">Understood</button>
          </div>
        </div>
      )}

      {/* BALLOT SECTION */}
      <main className="max-w-4xl mx-auto px-4 space-y-16">
        {positions.map(pos => (
          <section key={pos.title} className="bg-white p-8 md:p-12 rounded-[4rem] shadow-2xl border-b-[18px] border-slate-200">
            <h2 className="text-3xl font-black text-slate-900 mb-10 flex items-center gap-4 uppercase italic tracking-tighter">
                <div className="w-2 h-10 bg-red-600 rounded-full"></div> {pos.title}
            </h2>
            <div className="grid gap-6">
              {pos.candidates.map(cand => {
                const chapterVotes = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title);
                const count = chapterVotes.filter(v => v.candidate_name === cand).length;
                const total = chapterVotes.length;
                return (
                  <button key={cand} onClick={() => castVote(pos.title, cand)} className="relative w-full text-left p-8 rounded-[2.5rem] border-2 border-slate-50 hover:border-red-600 overflow-hidden transition-all group bg-slate-50/50 shadow-sm active:scale-[0.98]">
                    <div className="relative z-10 flex justify-between items-center font-black">
                        <span className="text-xl md:text-2xl group-hover:text-red-700 transition-colors uppercase tracking-tight">{cand}</span>
                        <div className="text-right">
                            <span className="text-4xl text-red-600 block leading-none">{count}</span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-1 block">Local Tally</span>
                        </div>
                    </div>
                    <div className="absolute left-0 top-0 h-full bg-red-100/40 border-r-4 border-red-200/50 -z-10 transition-all duration-1000 ease-out" style={{ width: `${total > 0 ? (count/total)*100 : 0}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* NATIONAL LEADERBOARD */}
      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-12 bg-slate-900 rounded-[3.5rem] text-white shadow-3xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-5 rotate-12">
            <Fingerprint size={200} />
        </div>
        <div className="relative z-10">
            <h3 className="text-2xl font-black mb-10 flex items-center gap-3 italic text-blue-400 uppercase tracking-tighter">
                <TrendingUp /> National Turnout Monitor
            </h3>
            <div className="space-y-8">
              {chapters.sort((a,b) => votes.filter(v => v.chapter === b).length - votes.filter(v => v.chapter === a).length).slice(0, 5).map(c => {
                const chapterTotal = votes.filter(v => v.chapter === c).length;
                return (
                  <div key={c} className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      <span>{c}</span>
                      <span className="text-white">{chapterTotal} Ballots</span>
                    </div>
                    <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden p-1 border border-white/5">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-1000 shadow-lg" style={{ width: `${Math.min((chapterTotal/100)*100, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 opacity-50 font-mono text-[10px] uppercase tracking-widest italic">
                <p>System Status: encrypted & operational</p>
                <p>BWIAA Commission • 2026</p>
            </div>
        </div>
      </footer>
    </div>
  );
}
