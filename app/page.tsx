"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Election2026() {
  const [votes, setVotes] = useState<any[]>([]);
  const [myVoterName, setMyVoterName] = useState(""); // Tracks who is currently at the computer

  const positions = [
    { title: "President", candidates: ["John Doe", "Jane Smith"] },
    { title: "Treasurer", candidates: ["Alice Wong", "Bob Brown"] }
    // Add all your 7 positions here!
  ];

  async function refreshData() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  useEffect(() => {
    refreshData();
    const liveUpdate = supabase.channel('election').on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'votes' }, () => refreshData()).subscribe();
    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  async function castVote(job: string, person: string) {
    if (!myVoterName) return alert("Please enter your Voter Name first! 🏷️");

    const { error } = await supabase.from('votes').insert([
      { position_name: job, candidate_name: person, voter_name: myVoterName }
    ]);

    if (error) alert("You have already voted for this position! 🛑");
    else alert(`Vote cast for ${person}! 🎉`);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-sans">
      {/* NEW: VOTER IDENTIFICATION BOX */}
      <div className="max-w-xl mx-auto mb-10 p-6 bg-blue-600 rounded-3xl text-white shadow-2xl">
        <h2 className="text-xl font-bold mb-2">Identify Yourself 👤</h2>
        <input 
          type="text" 
          placeholder="Enter your Voter Name (e.g. Voter 1)" 
          className="w-full p-4 rounded-xl text-slate-900 font-bold"
          onChange={(e) => setMyVoterName(e.target.value)}
        />
        <p className="mt-2 text-sm opacity-80">Currently voting as: <b>{myVoterName || "Stranger"}</b></p>
      </div>

      <main className="max-w-3xl mx-auto grid gap-8">
        {positions.map((pos) => (
          <div key={pos.title} className="bg-white p-8 rounded-[2rem] shadow-xl border-b-[12px] border-slate-200">
            <h2 className="text-2xl font-black text-slate-700 mb-6">{pos.title}</h2>
            
            <div className="grid gap-4">
              {pos.candidates.map(candidate => (
                <button 
                  key={candidate}
                  onClick={() => castVote(pos.title, candidate)}
                  className="flex justify-between items-center p-6 bg-slate-50 hover:bg-blue-50 border-2 border-slate-100 rounded-2xl transition-all group"
                >
                  <span className="text-xl font-bold group-hover:text-blue-600">{candidate}</span>
                  <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm">
                    {votes.filter(v => v.position_name === pos.title && v.candidate_name === candidate).length} Votes
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
