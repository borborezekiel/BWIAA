"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Election2026() {
  const [votes, setVotes] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null); // Track the logged-in voter

  // ALL 7 POSITIONS (Add your real candidate names here!)
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
    // Check if voter is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    refreshData();
    const liveUpdate = supabase.channel('election').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'votes' }, () => refreshData()).subscribe();
    return () => { supabase.removeChannel(liveUpdate); };
  }, []);

  async function refreshData() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  // SOCIAL LOGIN HANDLER
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  }

  async function castVote(pos: string, cand: string) {
    if (!user) return alert("Please Sign In with Google first! 🔑");

    const { error } = await supabase.from('votes').insert([
      { 
        position_name: pos, 
        candidate_name: cand, 
        voter_name: user.email, // Securely record their email as their ID
        voter_id: user.id 
      }
    ]);

    if (error) alert("Security Check: You have already voted for this position! 🛑");
    else alert(`Success! You voted for ${cand}! 🎉`);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans text-slate-900">
      
      {/* HEADER & LOGIN SECTION */}
      <header className="max-w-4xl mx-auto text-center mb-16">
        <h1 className="text-6xl font-black text-blue-900 mb-4 tracking-tighter">ELECTION 2026 🗳️</h1>
        <p className="text-xl font-bold text-blue-600 mb-8 uppercase tracking-widest">Harbel and RIA Chapter</p>
        
        {!user ? (
          <button onClick={signInWithGoogle} className="bg-white border-2 border-slate-200 px-8 py-4 rounded-2xl shadow-xl hover:bg-slate-50 transition-all font-bold flex items-center gap-3 mx-auto">
            <img src="https://google.com" className="w-5 h-5" alt="G" />
            Sign in with Google to Vote
          </button>
        ) : (
          <div className="bg-green-100 text-green-700 px-6 py-3 rounded-full inline-block font-black">
            Voter Verified: {user.email} ✅
          </div>
        )}
      </header>

      {/* VOTING CARDS (Now shows all 7!) */}
      <main className="max-w-4xl mx-auto space-y-10">
        {positions.map((pos) => (
          <section key={pos.title} className="bg-white p-10 rounded-[3rem] shadow-2xl border-b-[15px] border-slate-200">
            <h2 className="text-3xl font-black text-slate-800 mb-8 border-l-8 border-blue-600 pl-6">{pos.title}</h2>
            
            <div className="grid gap-6">
              {pos.candidates.map(candidate => {
                const count = votes.filter(v => v.position_name === pos.title && v.candidate_name === candidate).length;
                const totalForPos = votes.filter(v => v.position_name === pos.title).length;
                const percentage = totalForPos > 0 ? (count / totalForPos) * 100 : 0;

                return (
                  <div key={candidate} className="relative">
                    <button 
                      onClick={() => castVote(pos.title, candidate)}
                      className="w-full relative z-10 flex justify-between items-center p-8 bg-transparent border-2 border-slate-100 rounded-[2rem] hover:border-blue-400 transition-all group overflow-hidden"
                    >
                      <span className="text-2xl font-black group-hover:text-blue-600 transition-colors">{candidate}</span>
                      <span className="text-3xl font-black text-blue-600">{count}</span>
                      
                      {/* ANIMATED BACKGROUND BAR */}
                      <div 
                        className="absolute left-0 top-0 h-full bg-blue-50 -z-10 transition-all duration-1000 ease-out" 
                        style={{ width: `${percentage}%` }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* CHAIRPERSON'S SECRET AUDIT VIEW (Visible at bottom) */}
      <footer className="max-w-4xl mx-auto mt-24 pt-12 border-t-2 border-slate-200">
        <h3 className="text-center font-black text-slate-400 mb-8 uppercase tracking-widest">Chairperson Audit Log</h3>
        <div className="bg-slate-900 rounded-3xl p-8 text-slate-300 font-mono text-sm overflow-x-auto shadow-2xl">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-4">Voter Email</th>
                <th className="pb-4">Position</th>
                <th className="pb-4">Choice</th>
              </tr>
            </thead>
            <tbody>
              {votes.slice(-5).map((v, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-4">{v.voter_name}</td>
                  <td className="py-4">{v.position_name}</td>
                  <td className="py-4 font-bold text-blue-400">{v.candidate_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 text-center opacity-50 italic">Showing last 5 verified votes in real-time...</p>
        </div>
      </footer>
    </div>
  );
}
