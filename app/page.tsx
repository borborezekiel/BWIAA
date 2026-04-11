"use client"; // 1. This tells the computer the buttons are interactive!

import { supabase } from '@/lib/supabase';

export default function ElectionPage() {
  const positions = [
    "President", 
    "Vice President (Administration)", 
    "Secretary General", 
    "Financial Secretary", 
    "Treasurer", 
    "Media & Publicity CHAIRMAN", 
    "CHAPLAIN"
  ];

  // 2. This is the "Wiring" that sends the vote to the Brain
  async function handleVote(jobName: string) {
    const { error } = await supabase
      .from('votes')
      .insert([
        { position_name: jobName }
      ]);

    if (error) {
      console.error(error);
      alert("Oh no! Check if you are logged in or have already voted. 🛑");
    } else {
      alert(`Success! Your vote for ${jobName} was counted! 🎉`);
    }
  }

  return (
    <div className="p-8 bg-blue-50 min-h-screen font-sans">
      <h1 className="text-4xl font-bold text-blue-900 mb-4">CHAIRMAN ELECTION 2026 🗳️</h1>
      <p className="text-xl mb-8">Chapter: Harbel and RIA</p>
      
      <div className="grid gap-6">
        {positions.map((job) => (
          <div key={job} className="bg-white p-6 rounded-2xl shadow-lg border-2 border-blue-200">
            <h2 className="text-2xl font-bold text-gray-800">{job}</h2>
            {/* 3. We tell the button to run our handleVote "Wiring" when clicked */}
            <button 
              onClick={() => handleVote(job)}
              className="mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full transition"
            >
              Cast Your Vote! ✨
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
