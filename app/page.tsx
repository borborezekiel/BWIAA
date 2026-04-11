"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Election2026() {
  const [votes, setVotes] = useState<any[]>([]);
  
  const positions = [
    "President", 
    "Vice President (Administration)", 
    "Secretary General", 
    "Financial Secretary", 
    "Treasurer", 
    "Media & Publicity CHAIRMAN", 
    "CHAPLAIN"
  ];

  // 1. Function to count votes for a specific job
  const getCount = (job: string) => votes.filter(v => v.position_name === job).length;

  // 2. Function to grab the latest votes from the brain
  async function refreshData() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  useEffect(() => {
    refreshData();

    // 3. THE MAGIC: Watch the "votes" table for any new "INSERT"
    const liveUpdate = supabase
      .channel('election-night')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, 
        () => { refreshData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  // 4. Function to send a vote
  async function castVote(job: string) {
    const { error } = await supabase.from('votes').insert([{ position_name: job }]);
    if (error) alert("Error! Please check your connection. 🛑");
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans text-slate-900">
      {/* HEADER SECTION */}
      <header className="max-w-3xl mx-auto text-center mb-12">
        <h1 className="text-5xl font-black mb-2 tracking-tighter text-blue-900">
          ELECTION 2026 🗳️
        </h1>
        <p className="text-blue-600 font-bold uppercase tracking-widest text-sm">
          Harbel and RIA Chapter • Live Results
        </p>
        
        <div className="mt-8 inline-block bg-white p-6 rounded-3xl shadow-2xl border-4 border-blue-500">
          <p className="text-5xl font-black text-slate-800">{votes.length}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Votes Cast</p>
        </div>
      </header>

      {/* VOTING CARDS SECTION */}
      <main className="max-w-3xl mx-auto grid gap-8">
        {positions.map((job) => {
          const count = getCount(job);
          // Calculate percentage for the progress bar (max 50 for testing)
          const barWidth = Math.min((count / 50) * 100, 100);

          return (
            <div key={job} className="bg-white p-8 rounded-[2rem] shadow-xl border-b-[12px] border-slate-200 hover:border-blue-400 transition-all group">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-700 group-hover:text-blue-600 transition-colors">
                    {job}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-black text-blue-600">{count}</span>
                  <span className="text-sm font-bold text-slate-400 block uppercase">Votes</span>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div className="w-full bg-slate-100 rounded-full h-8 mb-8 p-1 border-2 border-slate-50 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out shadow-inner"
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <button 
                onClick={() => castVote(job)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-bold py-5 rounded-2xl shadow-[0_8px_0_rgb(5,150,105)] active:shadow-none active:translate-y-2 transition-all uppercase tracking-widest"
              >
                Submit Vote for {job}
              </button>
            </div>
          );
        })}
      </main>

      <footer className="mt-20 text-center text-slate-400 font-medium pb-10">
        Transparent • Secure • Real-Time Built with Supabase & Vercel
      </footer>
    </div>
  );
}
