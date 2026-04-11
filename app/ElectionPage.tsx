'use client'; // This tells the computer the page is interactive!
import { supabase } from '@/lib/supabase';

export default function ElectionPage() {
  
  async function handleVote(position: string) {
    // 1. Tell the brain who is voting and for what job
    const { error } = await supabase
      .from('votes')
      .insert([{ position_name: position }]);

    if (error) {
      alert("Oh no! You already voted or something went wrong! 🛑");
    } else {
      alert("YAY! Your vote was counted! 🎉");
    }
  }

  // Update your button to look like this:
  // <button onClick={() => handleVote(job)}> Cast Your Vote! </button>
}
