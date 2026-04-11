"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, FileSpreadsheet, Users, Edit3, Lock, Loader2, BarChart3, Fingerprint, ArrowLeft, Globe } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboard() {
  const [votes, setVotes] = useState<any[]>([]);
  const [voters, setVoters] = useState<any[]>([]);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [exportFilter, setExportFilter] = useState("All");

  const YOUR_EMAIL = "ezekielborbor17@gmail.com";

  useEffect(() => {
    const secureSetup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: admin } = await supabase.from('election_admins').select('*').eq('email', user.email).maybeSingle();
        if (admin || user.email === YOUR_EMAIL) {
          const info = admin || { email: YOUR_EMAIL, branch: 'National' };
          setAdminInfo(info);
          fetchData(info);
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

  // --- FIXED: Export now filters strictly by branch ---
  const exportExcel = () => {
    let dataToExport = votes;
    
    // If you are National Lead, you can choose to export only one branch
    if (adminInfo.branch === 'National' && exportFilter !== "All") {
      dataToExport = votes.filter(v => v.chapter === exportFilter);
    }

    const headers = "Voter Identity,Class,Branch,Position,Candidate,Date\n";
    const csvContent = "data:text/csv;charset=utf-8," + headers + 
      dataToExport.map(v => `${v.voter_name},${v.class_year},${v.chapter},${v.position_name},${v.candidate_name},${v.created_at}`).join("\n");
    
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `BWIAA_${exportFilter}_Report.csv`);
    link.click();
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white font-black italic animate-pulse">VERIFYING CHAIRPERSON...</div>;
  if (authError) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-10 text-center"><Lock size={80} className="text-red-600 mb-6" /><h1 className="text-4xl font-black italic">ACCESS DENIED</h1></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-red-600">
        <div className="flex flex-col gap-2">
          {/* BACK TO VOTER PAGE BUTTON */}
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-xs uppercase transition-all mb-2">
            <ArrowLeft size={16}/> Back to Voter Ballot
          </Link>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Command Center</h1>
          <span className="bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest w-fit">{adminInfo.branch} LEAD</span>
        </div>

        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          {/* BRANCH FILTER FOR EXCEL */}
          {adminInfo.branch === 'National' && (
            <select 
              onChange={(e) => setExportFilter(e.target.value)}
              className="bg-slate-100 border-2 border-slate-200 p-3 rounded-2xl font-bold text-xs outline-none focus:border-blue-500"
            >
              <option value="All">All Branches</option>
              <option value="Harbel and RIA">Harbel & RIA</option>
              <option value="Monrovia">Monrovia</option>
              <option value="Buchanan">Buchanan</option>
              {/* Add others as needed */}
            </select>
          )}
          <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95">
            <FileSpreadsheet /> EXPORT {exportFilter.toUpperCase()} REPORT
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* VOTER LIST */}
        <section className="bg-white p-8 rounded-[3rem] shadow-2xl border-t-8 border-blue-600">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-8 italic uppercase"><Users className="text-blue-600" /> Verified Voters</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
            {voters.map((v) => (
              <div key={v.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border-2 border-slate-100 italic">
                <div className="truncate w-2/3">
                  <p className="font-black text-slate-700 text-sm truncate uppercase tracking-tighter">{v.id}</p>
                  <span className="text-red-500 text-[10px] font-black uppercase">Class of {v.class_year}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AUDIT LOG */}
        <section className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-white">
          <Fingerprint size={160} className="absolute -right-10 -bottom-10 opacity-5" />
          <h2 className="text-2xl font-black mb-8 flex items-center gap-2 italic uppercase tracking-tighter"><ShieldCheck className="text-red-600" /> Audit Intelligence</h2>
          <div className="space-y-4 font-mono text-[10px] h-[520px] overflow-y-auto pr-2 scrollbar-hide opacity-80">
            {votes.map((v, i) => (
              <div key={i} className="border-b border-white/5 pb-4">
                <p className="text-red-500 font-bold italic uppercase tracking-widest">Entry Recorded • {v.chapter}</p>
                <p className="text-slate-400 italic">{v.voter_name} • Class of {v.class_year}</p>
                <p className="text-blue-400 font-black">Choice: {v.candidate_name}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
