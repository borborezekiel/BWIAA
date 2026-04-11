"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, FileSpreadsheet, Users, Edit3, Lock, Loader2, Search } from 'lucide-react';

export default function AdminDashboard() {
  const [votes, setVotes] = useState<any[]>([]);
  const [voters, setVoters] = useState<any[]>([]);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const YOUR_EMAIL = "ezekielborbor17@gmail.com";

  useEffect(() => {
    const secureSetup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email === YOUR_EMAIL) {
        // You are the National Lead
        const info = { email: YOUR_EMAIL, branch: 'National' };
        setAdminInfo(info);
        fetchData(info);
      } else if (user) {
        // Check if they are a branch lead
        const { data: admin } = await supabase.from('election_admins').select('*').eq('email', user.email).single();
        if (admin) {
          setAdminInfo(admin);
          fetchData(admin);
        }
      }
      setLoading(false);
    };
    secureSetup();
  }, []);

  async function fetchData(admin: any) {
    let voteQuery = supabase.from('votes').select('*');
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
    const headers = "Voter Email,Class,Branch,Position,Candidate,Timestamp\n";
    const csvContent = "data:text/csv;charset=utf-8," + headers + 
      votes.map(v => `${v.voter_name},${v.class_year},${v.chapter},${v.position_name},${v.candidate_name},${v.created_at}`).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `BWIAA_Report_${adminInfo.branch}.csv`);
    link.click();
  };

  async function updateVoterClass(id: string, currentClass: string) {
    const newYear = prompt(`Correcting Class for voter. Current: ${currentClass}. Enter new 4-digit year:`);
    if (newYear && newYear.length === 4) {
      const { error } = await supabase.from('voter_profiles').update({ class_year: newYear }).eq('id', id);
      if (!error) {
        alert("Success! The voter's class has been corrected.");
        window.location.reload();
      }
    }
  }

  const filteredVoters = voters.filter(v => v.id.toLowerCase().includes(searchTerm.toLowerCase()) || v.class_year?.includes(searchTerm));

  if (loading) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin text-red-600 mb-4" size={48} /><p className="font-black italic">VERIFYING SECURITY CLEARANCE...</p></div>;
  
  if (!adminInfo) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-10"><Lock size={80} className="text-red-600 mb-6" /><h1 className="text-4xl font-black italic">ACCESS DENIED</h1><p className="text-slate-500 mt-4 text-center">This dashboard is restricted to the National Chairperson and Branch Leads.</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-red-600">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Chairperson Dashboard</h1>
          <div className="flex gap-2 items-center mt-1">
            <span className="bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-widest">{adminInfo.branch} LEAD</span>
            <span className="text-slate-400 text-xs font-bold">{adminInfo.email}</span>
          </div>
        </div>
        <button onClick={exportExcel} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95">
          <FileSpreadsheet /> DOWNLOAD AUDIT REPORT (.CSV)
        </button>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* SECTION: VOTER MANAGEMENT */}
        <section className="bg-white p-8 rounded-[3rem] shadow-2xl border-t-8 border-blue-600">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Users className="text-blue-600" /> Voter Database</h2>
            <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                <input type="text" placeholder="Search Voter..." onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-100 rounded-xl text-xs outline-none focus:ring-2 ring-blue-500 w-40 md:w-60" />
            </div>
          </div>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
            {filteredVoters.map((v) => (
              <div key={v.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-200 transition-all">
                <div className="truncate w-2/3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">Voter Identification</p>
                  <p className="font-bold text-slate-700 text-sm truncate">{v.id}</p>
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase mt-2 inline-block">Class of {v.class_year}</span>
                </div>
                <button onClick={() => updateVoterClass(v.id, v.class_year)} className="bg-white p-3 rounded-xl shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white transition-all">
                  <Edit3 size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION: LIVE BALLOT LOG */}
        <section className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-2 italic uppercase tracking-tighter"><ShieldCheck className="text-red-600" /> Branch Audit Log</h2>
            <div className="space-y-4 font-mono text-[10px] h-[520px] overflow-y-auto pr-2 scrollbar-hide">
                {votes.map((v, i) => (
                    <div key={i} className="border-b border-white/5 pb-4 last:border-0 opacity-80">
                        <p className="text-red-500 font-bold mb-1 uppercase tracking-widest italic">Verified Entry</p>
                        <p className="text-slate-300">Voter: <span className="text-white">{v.voter_name}</span></p>
                        <p className="text-slate-300">Choice: <span className="text-blue-400 font-bold">{v.candidate_name}</span> ({v.position_name})</p>
                        <p className="text-slate-500 mt-1 text-[8px]">{new Date(v.created_at).toLocaleString()}</p>
                    </div>
                ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
