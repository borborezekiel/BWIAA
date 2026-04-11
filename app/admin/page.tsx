"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, FileSpreadsheet, Users, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function AdminDashboard() {
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const YOUR_EMAIL = "ezekielborbor17@gmail.com";

  useEffect(() => {
    const checkAccess = async () => {
      // 1. Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      // 2. Check if they are in the Admin Table
      const { data: admin } = await supabase
        .from('election_admins')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (admin) {
        setAdminInfo(admin);
        // 3. If they are an admin, fetch the data
        const { data: vData } = await supabase.from('votes').select('*');
        setVotes(vData || []);
      } else {
        setAuthError(true);
      }
      setLoading(false);
    };

    checkAccess();
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold italic">Checking Security Credentials...</div>;

  if (authError) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-10">
      <Lock size={80} className="text-red-600 mb-6" />
      <h1 className="text-4xl font-black italic">ACCESS DENIED</h1>
      <p className="text-slate-500 mt-4 text-center">This area is restricted to the National Chairperson.</p>
      <button onClick={() => window.location.href = '/'} className="mt-8 bg-white text-black px-8 py-3 rounded-2xl font-bold">Return Home</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <header className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">Admin Dashboard</h1>
          <p className="text-red-600 font-bold text-xs uppercase">Welcome, Chairperson {adminInfo?.branch}</p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-blue-500">
          <p className="text-sm font-bold text-slate-400 uppercase">Total Votes Cast</p>
          <p className="text-5xl font-black text-slate-900">{votes.length}</p>
        </div>
      </div>
      {/* Rest of your dashboard tools go here... */}
    </div>
  );
}
