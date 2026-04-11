"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, LogOut, Loader2, Award, CheckCircle2, TrendingUp, AlertCircle, Fingerprint } from 'lucide-react';

export default function BWIAAMasterBallot2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null); 
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapters = ["Harbel and RIA", "Monrovia", "Buchanan", "Gbarnga", "Kakata", "Voinjama", "Zwedru", "Robertsport", "Greenville", "Harper", "Sanniquellie", "Cestos City"];
  
  const positions = [
    { title: "President", candidates: ["Candidate 1", "Candidate 2"] },
    { title: "Vice President (Admin)", candidates: ["Candidate 3", "Candidate 4"] },
    { title: "Secretary General", candidates: ["Candidate 5", "Candidate 6"] },
    { title: "Financial Secretary", candidates: ["Candidate 7", "Candidate 8"] },
    { title: "Treasurer", candidates: ["Candidate 9", "Candidate 10"] },
    { title: "Media & Publicity CHAIRMAN", candidates: ["Candidate 11", "Candidate 12"] },
    { title: "CHAPLAIN", candidates: ["Candidate 13", "Candidate 14"] }
  ];

  useEffect(() => {
    const startEngine = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        // Check for permanent branch lock
        const { data } = await supabase.from('voter_profiles').select('home_chapter').eq('id', session.user.id).maybeSingle();
        if (data) setMyChapter(data.home_chapter);
      }
      setLoading(false);
    };
    startEngine();
    refreshVotes();
    const live = supabase.channel('national-election').on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes()).subscribe();
    return () => { supabase.removeChannel(live); };
  }, []);

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  async function enterBranch(chapter: string) {
    localStorage.setItem('target_chapter', chapter);
    await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }

  useEffect(() => {
    if (user && !myChapter) {
      const target = localStorage.getItem('target_chapter');
      if (target) {
        supabase.from('voter_profiles').insert([{ id: user.id, home_chapter: target }])
          .then(() => {
            setMyChapter(target);
            localStorage.removeItem('target_chapter');
          });
      }
    }
  }, [user]);

  async function castBallot(pos: string, cand: string) {
    const { data, error } = await supabase.from('votes').insert([{ 
      position_name: pos, candidate_name: cand, voter_name: user.email, voter_id: user.id, chapter: myChapter
    }]).select().single();

    if (error) setErrorMessage(`INTEGRITY ALERT: Our records show you have already submitted a ballot for ${pos}. Only one vote is allowed per office.`);
    else setReceipt(data);
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-black animate-pulse">CONNECTING TO NATIONAL LEDGER...</div>;

  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <header className="text-center mb-16">
          <h1 className="text-white text-6xl font-black mb-2 tracking-tighter uppercase italic">BWIAA 2026</h1>
          <p className="text-red-600 font-bold tracking-[0.4em] uppercase text-sm">Official Election Portal</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl w-full">
          {chapters.map(c => (
            <button key={c} onClick={() => enterBranch(c)} className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-bold transition-all flex flex-col items-center gap-4 active:scale-95">
              <Vote size={32} className="text-red-600 group-hover:text-white" />
              <span className="text-lg">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* HEADER */}
      <header className="bg-white border-b-2 p-6 mb-10 sticky top-0 z-40 shadow-sm flex justify-between items-center max-w-5xl mx-auto rounded-b-[2rem]">
        <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-xl"><ShieldCheck size={20}/></div>
            <div className="font-black text-slate-900 uppercase leading-none">BWIAA<br/><span className="text-[10px] text-red-600">{myChapter} Branch</span></div>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="bg-slate-100 p-3 rounded-xl text-slate-400 hover:text-red-600 transition-all"><LogOut size={20}/></button>
      </header>

      {/* ERROR MODAL */}
      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <AlertCircle size={64} className="text-red-600 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 uppercase italic mb-4">Ballot Denied</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl">I UNDERSTAND</button>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receipt && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-green-500">
            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 uppercase italic mb-4">Vote Verified</h2>
            <div className="bg-slate-50 p-6 rounded-3xl text-left font-mono text-[10px] mb-8 space-y-1">
                <p>CERTIFICATE: {receipt.id}</p>
                <p>CHAPTER: {receipt.chapter}</p>
                <p>TIMESTAMP: {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl">CONTINUE</button>
          </div>
        </div>
      )}

      {/* BRANCH BALLOT */}
      <main className="max-w-4xl mx-auto px-4 space-y-12">
        {positions.map(pos => (
          <section key={pos.title} className="bg-white p-8 md:p-12 rounded-[4rem] shadow-xl border-b-[18px] border-slate-200">
            <h2 className="text-3xl font-black text-slate-800 mb-10 uppercase italic border-l-8 border-red-600 pl-6">{pos.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pos.candidates.map(cand => {
                const chapterVotes = votes.filter(v => v.chapter === myChapter && v.position_name === pos.title);
                const count = chapterVotes.filter(v => v.candidate_name === cand).length;
                const total = chapterVotes.length;
                const percent = total > 0 ? (count / total) * 100 : 0;
                return (
                  <button key={cand} onClick={() => castBallot(pos.title, cand)} className="relative w-full text-left p-8 rounded-[2.5rem] border-2 border-slate-50 hover:border-red-600 transition-all overflow-hidden bg-slate-50/50 active:scale-95 group">
                    <div className="relative z-10 flex justify-between items-center font-black">
                        <span className="text-xl group-hover:text-red-700 uppercase tracking-tight">{cand}</span>
                        <div className="text-right">
                            <span className="text-4xl text-red-600 block leading-none">{count}</span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest mt-1 block">Local Tally</span>
                        </div>
                    </div>
                    <div className="absolute left-0 top-0 h-full bg-red-100/40 border-r-4 border-red-200/50 -z-10 transition-all duration-1000 ease-out" style={{ width: `${percent}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* NATIONAL TRACKER */}
      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-12 bg-slate-900 rounded-[3.5rem] text-white relative overflow-hidden">
        <Fingerprint size={180} className="absolute -right-10 -bottom-10 opacity-5" />
        <h3 className="text-xl font-black mb-10 flex items-center gap-2 italic uppercase text-blue-400 tracking-tighter">
            <TrendingUp /> National Participation Monitor
        </h3>
        <div className="space-y-8 relative z-10">
          {chapters.sort((a,b) => votes.filter(v => v.chapter === b).length - votes.filter(v => v.chapter === a).length).slice(0, 5).map(c => {
            const total = votes.filter(v => v.chapter === c).length;
            return (
              <div key={c} className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400"><span>{c}</span><span>{total} Ballots</span></div>
                <div className="w-full bg-white/5 h-3 rounded-full overflow-hidden border border-white/5">
                  <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${Math.min((total/100)*100, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
