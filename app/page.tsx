"use client";

import { useEffect, useState } from 'react'; // 1. New tools to "remember" the score
import { supabase } from '@/lib/supabase';

export default function ElectionPage() {
  const [votes, setVotes] = useState<any[]>([]); // This stores all the votes
  
  const positions = [
    "President", "Vice President (Administration)", "Secretary General", 
    "Financial Secretary", "Treasurer", "Media & Publicity CHAIRMAN", "CHAPLAIN"
  ];

  // 2. This function counts how many votes each job has
  const getVoteCount = (job: string) => {
    return votes.filter(v => v.position_name === job).length;
  };

  // 3. This is the "Scorekeeper" - it asks the brain for the scores
  async function fetchVotes() {
    const { data } = await supabase.from('votes').select('*');
    if (data) setVotes(data);
  }

  useEffect(() => {
    fetchVotes(); // Get scores when the page opens

    // 4. THE MAGIC: This watches for new votes and updates the screen INSTANTLY!
    const channel = supabase
      .channel('live-votes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, 
        () => { fetchVotes(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleVote(jobName: string) {
    const { error } = await supabase.from('votes').insert([{ position_name: jobName }]);
    if (error) alert("Error! 🛑");
    else alert(`Success! Vote for ${jobName} counted! 🎉`);
  }

  return (
    <div className="p-8 bg-blue-50 min-h-screen font-sans">
      <h1 className="text-4xl font-bold text-blue-900 mb-4 text-center">CHAIRMAN ELECTION 2026 🗳️</h1>
      <div className="grid gap-6 max-w-2xl mx-auto">
        {positions.map((job) => (
          <div key={job} className="bg-white p-6 rounded-2xl shadow-lg border-2 border-blue-200 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{job}</h2>
              {/* THIS IS THE COUNTER! */}
              <p className="text-3xl font-black text-blue-600">{getVoteCount(job)} Votes</p> 
            </div>
            <button 
              onClick={() => handleVote(job)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition shadow-md"
            >
              Vote ✨
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
