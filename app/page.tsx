"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, LogOut, Loader2, Award, CheckCircle2, TrendingUp, AlertCircle, Fingerprint, Activity } from 'lucide-react';

export default function BWIAAElection2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [myClass, setMyClass] = useState<string | null>(null);
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

  // --- THE BRAIN: Loading User & Real-Time Setup ---
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          // Directly fetch the profile to stop the "Verifying" loop
          const { data: profile } = await supabase.from('voter_profiles').select('*').eq('id', user.id).maybeSingle();
          if (profile) {
            setMyChapter(profile.home_chapter);
            setMyClass(profile.class_year);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    init();
    refreshVotes();

    // REAL-TIME LISTENER: Makes the tally and audit log jump instantly
    const channel = supabase.channel('national-audit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function refreshVotes() {
    const { data, error } = await supabase.from('votes').select('*').order('created_at', { ascending: false });
    if (data) setVotes(data);
  }

  async function registerAndLogin(chapter: string, classYear: string) {
    if (!classYear || classYear.length < 4) {
      setErrorMessage("Please enter a valid 4-digit Graduating Class Year (e.g. 1995)");
      return;
    }
    localStorage.setItem('pending_voter_data', JSON.stringify({ chapter, classYear }));
    await supabase.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo: window.location.origin } 
    });
  }

  useEffect(() => {
    if (user && !myChapter) {
      const pending = JSON.parse(localStorage.getItem('pending_voter_data') || '{}');
      if (pending.chapter) {
        supabase.from('voter_profiles').upsert([{ 
          id: user.id, 
          home_chapter: pending.chapter, 
          class_year: pending.classYear 
        }]).then(() => {
          setMyChapter(pending.chapter);
          setMyClass(pending.classYear);
          localStorage.removeItem('pending_voter_data');
          refreshVotes();
        });
      }
    }
  }, [user]);

  async function castBallot(pos: string, cand: string) {
    const { data, error } = await supabase.from('votes').insert([{ 
      position_name: pos, 
      candidate_name: cand, 
      voter_name: user.email, 
      voter_id: user.id, 
      chapter: myChapter, 
      class_year: myClass
    }]).select().single();

    if (error) setErrorMessage(`INTEGRITY ALERT: Already voted for ${pos}.`);
    else setReceipt(data);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <Loader2 className="animate-spin text-red-600 mb-4" size={48} />
      <p className="font-black animate-pulse">CONNECTING TO BWIAA NATIONAL DATABASE...</p>
    </div>
  );

  // --- VIEW 1: CHAPTER & CLASS SELECTION ---
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <h1 className="text-white text-5xl md:text-7xl font-black mb-12 tracking-tighter uppercase italic text-center">BWIAA 2026</h1>
        <div className="bg-white p-6 rounded-3xl mb-8 shadow-2xl w-full max-w-sm border-t-8 border-red-600">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center italic">Your Graduating Class Year</label>
            <input 
              id="class-input"
              type="number" 
              placeholder="e.g. 1995" 
              className="p-4 rounded-2xl text-slate-900 font-black w-full text-center border-2 border-slate-100 focus:border-red-600 outline-none text-2xl"
            />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
          {chapters.map(c => (
            <button key={c} onClick={() => {
              const cy = (document.getElementById('class-input') as HTMLInputElement).value;
              registerAndLogin(c, cy);
            }} className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-black transition-all flex flex-col items-center gap-4 active:scale-95">
              <Vote size={32} className="text-red-600" />
              <span className="text-sm uppercase tracking-widest">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* HEADER */}
      <header className="bg-white border-b-2 p-6 mb-10 sticky top-0 z-40 shadow-sm flex justify-between items-center max-w-5xl mx-auto rounded-b-[2.5rem]">
        <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-xl"><ShieldCheck size={20}/></div>
            <div className="font-black text-slate-900 uppercase leading-none">BWIAA<br/><span className="text-[10px] text-red-600 font-bold uppercase">{myChapter} • CLASS OF {myClass || "VERIFIED"}</span></div>
        </div>
        <button onClick={() => { localStorage.clear(); supabase.auth.signOut().then(() => window.location.href = window.location.origin); }} className="bg-slate-100 p-3 rounded-xl text-slate-400 hover:text-red-600 transition-all"><LogOut size={20}/></button>
      </header>

      {/* ERROR MODAL */}
      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <AlertCircle size={64} className="text-red-600 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 uppercase italic mb-4">Access Denied</h2>
            <p className="text-slate-500 mb-8 font-medium">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Understood</button>
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
                <p>STAMP: {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Close Receipt</button>
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
                // FILTER: Only show votes for the CURRENT branch
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
                    <div className="absolute left-0 top-0 h-full bg-red-100/40 border-r-4 border-red-200/50 -z-10 transition-all duration-1000 ease-out shadow-inner" style={{ width: `${percent}%` }} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* NATIONAL AUDIT INTELLIGENCE FOOTER */}
      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-12 bg-slate-900 rounded-[3.5rem] text-white shadow-3xl relative overflow-hidden">
        <Fingerprint size={200} className="absolute -right-10 -bottom-10 opacity-5" />
        <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-center border-b border-white/10 pb-8 mb-10 gap-4">
                <h3 className="text-2xl font-black italic uppercase text-blue-400 tracking-tighter flex items-center gap-2"><Activity /> Audit Log Intelligence</h3>
                <span className="bg-blue-600 px-6 py-2 rounded-full font-black text-2xl shadow-xl">{votes.length} NATIONAL BALLOTS</span>
            </div>
            
            <div className="space-y-4 max-h-80 overflow-y-auto pr-4 scrollbar-hide">
              {votes.map((v, i) => (
                <div key={i} className="flex flex-col md:flex-row md:justify-between items-start md:items-center py-4 border-b border-white/5 last:border-0 gap-2 italic">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase text-blue-400 tracking-[0.2em]">Verified Ballot • {v.chapter}</span>
                    <span className="text-xs font-bold text-slate-300">{v.voter_name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-lg text-red-500 font-black uppercase tracking-widest italic">Class of {v.class_year}</span>
                    <span className="text-xs font-black text-white uppercase tracking-tighter italic">→ Choice: {v.candidate_name}</span>
                  </div>
                </div>
              ))}
            </div>
        </div>
      </footer>
    </div>
  );
}
