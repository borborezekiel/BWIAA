"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, User, LogOut, Loader2, Award, CheckCircle2, TrendingUp, AlertCircle, Fingerprint, FileSpreadsheet, BarChart3 } from 'lucide-react';

export default function BWIAAFinalBallot2026() {
  const [user, setUser] = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [myClass, setMyClass] = useState<string | null>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null); 
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chapters = ["Harbel and RIA", "Monrovia", "Buchanan", "Gbarnga", "Kakata", "Voinjama", "Zwedru", "Robertsport", "Greenville", "Harper", "Sanniquellie", "Cestos City"];
  
  const positions = [
    { title: "President", candidates: ["Candidate 1", "Candidate 2"] },
    { title: "Vice President", candidates: ["Candidate 3", "Candidate 4"] }
  ];

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        const { data: profile } = await supabase.from('voter_profiles').select('home_chapter, class_year').eq('id', user.id).maybeSingle();
        if (profile) {
          setMyChapter(profile.home_chapter);
          setMyClass(profile.class_year);
        }
      }
      setLoading(false);
    };
    init();
    refreshVotes();
    const live = supabase.channel('national-audit').on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refreshVotes()).subscribe();
    return () => { supabase.removeChannel(live); };
  }, []);

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*').order('created_at', { ascending: false });
    if (data) setVotes(data);
  }

  async function registerAndLogin(chapter: string, classYear: string) {
    if (!classYear || classYear.length !== 4) return setErrorMessage("Please enter a valid 4-digit Class Year (e.g., 1998)");
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
        });
      }
    }
  }, [user]);

  async function castBallot(pos: string, cand: string) {
    const { data, error } = await supabase.from('votes').insert([{ 
      position_name: pos, candidate_name: cand, voter_name: user.email, voter_id: user.id, chapter: myChapter, class_year: myClass
    }]).select().single();

    if (error) setErrorMessage(`INTEGRITY ALERT: Already voted for ${pos}.`);
    else setReceipt(data);
  }

  // --- STATISTICS FOR CHAIRPERSON ---
  const getTurnoutByDecade = () => {
    const decades: any = {};
    votes.forEach(v => {
      const decade = v.class_year ? v.class_year.substring(0, 3) + '0s' : 'Unknown';
      decades[decade] = (decades[decade] || 0) + 1;
    });
    return decades;
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-black animate-pulse">VERIFYING BWIAA CREDENTIALS...</div>;

  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <h1 className="text-white text-5xl font-black mb-8 uppercase italic">BWIAA 2026</h1>
        <div className="bg-white p-6 rounded-2xl mb-8 shadow-2xl w-full max-w-sm">
            <label className="block text-xs font-black text-slate-400 uppercase mb-2">Graduating Class Year</label>
            <input 
              id="class-input"
              type="number" 
              placeholder="e.g. 1995" 
              className="p-4 rounded-xl text-slate-900 font-bold w-full text-center border-2 border-slate-200 focus:border-red-600 outline-none transition-all"
            />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
          {chapters.map(c => (
            <button 
              key={c} 
              onClick={() => {
                const classYear = (document.getElementById('class-input') as HTMLInputElement).value;
                registerAndLogin(c, classYear);
              }} 
              className="bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-bold transition-all flex flex-col items-center gap-4 active:scale-95 shadow-xl"
            >
              <Vote size={32} className="text-red-600" />
              <span>{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-white border-b-2 p-6 mb-10 sticky top-0 z-40 shadow-sm flex justify-between items-center max-w-5xl mx-auto rounded-b-3xl">
        <div>
            <span className="text-xl font-black text-slate-900 uppercase">OFFICIAL BALLOT</span>
            <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest">{myChapter} • CLASS OF {myClass}</div>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => { localStorage.clear(); window.location.reload(); })} className="bg-slate-100 p-3 rounded-xl text-slate-400 hover:text-red-600 transition-all"><LogOut size={20}/></button>
      </header>

      {/* ERROR MODAL */}
      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <AlertCircle size={64} className="text-red-600 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-slate-900 uppercase italic mb-4 italic">Action Denied</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl">UNDERSTOOD</button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-green-500">
            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-slate-900 uppercase mb-4 italic text-green-600">Ballot Verified</h2>
            <div className="bg-slate-50 p-6 rounded-3xl text-left font-mono text-[10px] mb-8 space-y-1">
                <p>CERTIFICATE: {receipt.id}</p>
                <p>CLASS: {receipt.class_year}</p>
                <p>STAMP: {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest">Close Receipt</button>
          </div>
        </div>
      )}

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
                  <button key={cand} onClick={() => castBallot(pos.title, cand)} className="relative w-full text-left p-8 rounded-[2.5rem] border-2 border-slate-50 hover:border-red-600 transition-all overflow-hidden bg-slate-50/50 group active:scale-95 shadow-sm">
                    <div className="relative z-10 flex justify-between items-center font-black uppercase">
                        <span className="text-xl group-hover:text-red-700 tracking-tight">{cand}</span>
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

      {/* CHAIRPERSON'S AUDIT DASHBOARD */}
      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-12 bg-slate-900 rounded-[3.5rem] text-white shadow-3xl relative overflow-hidden">
        <Fingerprint size={200} className="absolute -right-10 -bottom-10 opacity-5" />
        <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-center border-b border-white/10 pb-8 mb-10 gap-4">
                <h3 className="text-2xl font-black italic uppercase text-blue-400 tracking-tighter flex items-center gap-2"><BarChart3 /> Chairperson Intelligence</h3>
                <div className="flex gap-4">
                    <div className="bg-blue-600 px-6 py-2 rounded-full font-black text-xl shadow-xl">{votes.length} BALLOTS CAST</div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
                {/* DECADE STATS */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Turnout by Decade</h4>
                    <div className="space-y-3">
                        {Object.entries(getTurnoutByDecade()).map(([decade, count]: any) => (
                            <div key={decade} className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-bold text-blue-200">The {decade}</span>
                                <span className="text-sm font-black text-white">{count} Votes</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* LIVE AUDIT LOG */}
                <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Verified Activity Feed</h4>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                        {votes.slice(0, 5).map((v, i) => (
                            <div key={i} className="text-[10px] border-b border-white/5 pb-2 flex justify-between items-center italic">
                                <span className="text-slate-400 truncate w-32">{v.voter_name}</span>
                                <span className="text-red-500 font-bold">CLASS OF {v.class_year}</span>
                                <span className="text-blue-400 font-black">→ {v.candidate_name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="mt-10 pt-8 border-t border-white/5 text-center">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em]">Official BWIAA Audit System • Secure & Transparent</p>
            </div>
        </div>
      </footer>
    </div>
  );
}
