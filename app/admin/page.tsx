"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, FileSpreadsheet, Users, Edit3, Lock, Loader2, BarChart3, Fingerprint } from 'lucide-react';

export default function AdminDashboard() {
  const [votes, setVotes] = useState<any[]>([]);
  const [voters, setVoters] = useState<any[]>([]);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const YOUR_EMAIL = "ezekielborbor17@gmail.com";

  useEffect(() => {
    const secureSetup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: admin } = await supabase.from('election_admins').select('*').eq('email', user.email).maybeSingle();
        if (admin) {
          setAdminInfo(admin);
          fetchData(admin);
        } else {
          setAuthError(true);
        }
      } else {
        setAuthError(true);
      }
      setLoading(false);
    };
    secureSetup();
  }, []);

  async function fetchData(admin: any) {
    let voteQuery = supabase.from('votes').select('*').order('created_at', { ascending: false });
    let voterQuery = supabase.from('voter_profiles').select('*');

    if (admin.branch !== 'National') {
      voteQuery = voteQuery.eq('chapter', admin.branch);
      voterQuery = voterQuery.eq('home_chapter', admin.branch);
    }

    const { data: vData } = await voteQuery;
    const { data: pData } = await voterQuery;
    setVotes(vData || []);
    setVoters(pData || []);
  }

  const exportExcel = () => {
    const headers = "Voter,Class,Branch,Position,Candidate,Time\n";
    const csvContent = "data:text/csv;charset=utf-8," + headers + 
      votes.map(v => `${v.voter_name},${v.class_year},${v.chapter},${v.position_name},${v.candidate_name},${v.created_at}`).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `BWIAA_AUDIT_REPORT.csv`);
    link.click();
  };

  async function updateVoterClass(id: string, current: string) {
    const newYear = prompt(`Correcting Class. Current: ${current}. Enter new 4-digit year:`);
    if (newYear && newYear.length === 4) {
      await supabase.from('voter_profiles').update({ class_year: newYear }).eq('id', id);
      await supabase.from('votes').update({ class_year: newYear }).eq('voter_id', id);
      window.location.reload();
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin text-red-600 mb-4" size={48} /><p className="font-black italic">VERIFYING CHAIRPERSON IDENTITY...</p></div>;
  if (authError) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-10 text-center"><Lock size={80} className="text-red-600 mb-6" /><h1 className="text-4xl font-black italic uppercase">Access Denied</h1><p className="text-slate-500 mt-4 max-w-sm">This intelligence dashboard is restricted to the National Chairperson.</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic">Chairperson Command</h1>
          <div className="flex gap-2 items-center mt-1">
            <span className="bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest">{adminInfo.branch} LEAD</span>
            <span className="text-slate-400 text-xs font-bold">{adminInfo.email}</span>
          </div>
        </div>
        <button onClick={exportExcel} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95">
          <FileSpreadsheet /> EXPORT CERTIFIED REPORT (.CSV)
        </button>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-blue-500 flex flex-col justify-center">
            <Users className="text-blue-500 mb-2" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Ballots</p>
            <p className="text-5xl font-black text-slate-900">{votes.length}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-red-500 flex flex-col justify-center">
            <BarChart3 className="text-red-500 mb-2" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Chapters</p>
            <p className="text-5xl font-black text-slate-900">{new Set(votes.map(v => v.chapter)).size}</p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* VOTER MANAGEMENT TABLE */}
        <section className="bg-white p-8 rounded-[3rem] shadow-2xl border-t-8 border-blue-600">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-8 uppercase italic"><Users className="text-blue-600" /> Voter Database</h2>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
            {voters.map((v) => (
              <div key={v.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                <div className="truncate w-2/3">
                  <p className="font-black text-slate-800 text-sm truncate uppercase tracking-tighter">{v.id}</p>
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase mt-2 inline-block italic">Class of {v.class_year}</span>
                </div>
                <button onClick={() => updateVoterClass(v.id, v.class_year)} className="bg-white p-3 rounded-xl shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-all">
                  <Edit3 size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* NATIONAL BALLOT LOG */}
        <section className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
          <Fingerprint size={160} className="absolute -right-10 -bottom-10 opacity-5 text-white" />
          <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-2 italic uppercase tracking-tighter"><ShieldCheck className="text-red-600" /> Audit Intelligence</h2>
          <div className="space-y-4 font-mono text-[10px] h-[520px] overflow-y-auto pr-2 scrollbar-hide opacity-80">
            {votes.map((v, i) => (
              <div key={i} className="border-b border-white/5 pb-4 last:border-0">
                <p className="text-red-500 font-bold mb-1 uppercase tracking-widest italic">Verified Entry</p>
                <p className="text-slate-300 italic">Voter: <span className="text-white">{v.voter_name}</span> • <span className="text-blue-400 font-bold">Class of {v.class_year}</span></p>
                <p className="text-slate-300">Choice: <span className="text-blue-400 font-black">{v.candidate_name}</span> ({v.position_name})</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
