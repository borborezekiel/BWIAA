"use client";
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, Users, Edit3, Loader2, UserPlus, Trash2, ArrowLeft,
  Download, Save, X, RefreshCw, CheckCircle2, AlertCircle, PlusCircle,
  Award, Ban, Trophy, BarChart2, Settings
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface VoteRow      { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }
interface VoterProfile { id: string; home_chapter: string; class_year: string; created_at: string; }
interface Candidate    { id: number; full_name: string; position_name: string; chapter: string; }
interface AdminRow     { id: number; email: string; branch: string; }
interface AdminInfo    { email: string; branch: string; isHead: boolean; }

const HEAD_ADMIN = "ezekielborbor17@gmail.com";
const CHAPTERS   = ["Harbel and RIA","Monrovia","Buchanan","Gbarnga","Kakata","Voinjama","Zwedru","Robertsport","Greenville","Harper","Sanniquellie","Cestos City"];
const POSITIONS  = ["President","Vice President (Administration)","Secretary General","Financial Secretary","Treasurer","Media & Publicity CHAIRMAN","CHAPLAIN"];

type Tab = 'overview' | 'candidates' | 'voters' | 'roster' | 'admins' | 'results';

export default function AdminDashboard() {
  const [votes, setVotes]                     = useState<VoteRow[]>([]);
  const [voters, setVoters]                   = useState<VoterProfile[]>([]);
  const [roster, setRoster]                   = useState<{ email: string }[]>([]);
  const [blacklist, setBlacklist]             = useState<{ email: string; reason: string }[]>([]);
  const [candidates, setCandidates]           = useState<Candidate[]>([]);
  const [admins, setAdmins]                   = useState<AdminRow[]>([]);
  const [adminInfo, setAdminInfo]             = useState<AdminInfo | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [toast, setToast]                     = useState<{ msg: string; ok: boolean } | null>(null);
  const [editingVoter, setEditingVoter]       = useState<VoterProfile | null>(null);
  const [editClass, setEditClass]             = useState('');
  const [filterChapter, setFilterChapter]     = useState('All');
  const [activeTab, setActiveTab]             = useState<Tab>('overview');

  // Form states
  const [newEmail, setNewEmail]               = useState('');
  const [newCandName, setNewCandName]         = useState('');
  const [newCandPosition, setNewCandPosition] = useState(POSITIONS[0]);
  const [newAdminEmail, setNewAdminEmail]     = useState('');
  const [newAdminBranch, setNewAdminBranch]   = useState(CHAPTERS[0]);
  const [newBlackEmail, setNewBlackEmail]     = useState('');
  const [newBlackReason, setNewBlackReason]   = useState('');

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      if (user.email === HEAD_ADMIN) {
        setAdminInfo({ email: user.email ?? '', branch: 'National', isHead: true });
        await fetchData('National', true);
      } else {
        const { data: adminRow } = await supabase
          .from('election_admins').select('branch').eq('email', user.email).maybeSingle();
        if (adminRow) {
          setAdminInfo({ email: user.email ?? '', branch: adminRow.branch ?? '', isHead: false });
          await fetchData(adminRow.branch ?? '', false);
        }
      }
      setLoading(false);
    };
    setup();
  }, []);

  async function fetchData(branch: string, isHead: boolean) {
    const vq = supabase.from('votes').select('*').order('created_at', { ascending: false });
    if (!isHead) vq.eq('chapter', branch);
    const { data: vData } = await vq;
    setVotes(vData || []);

    const pq = supabase.from('voter_profiles').select('*');
    if (!isHead) pq.eq('home_chapter', branch);
    const { data: pData } = await pq;
    setVoters(pData || []);

    const cq = supabase.from('candidates').select('*').order('position_name');
    if (!isHead) cq.in('chapter', [branch, 'All']);
    const { data: cData } = await cq;
    setCandidates(cData || []);

    if (isHead) {
      const { data: rData } = await supabase.from('eligible_voters').select('*');
      setRoster(rData || []);

      const { data: blData } = await supabase.from('blacklisted_voters').select('*');
      setBlacklist(blData || []);

      const { data: aData } = await supabase.from('election_admins').select('*');
      setAdmins(aData || []);
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Candidate management ───────────────────────────────────────────────────
  async function addCandidate() {
    if (!newCandName.trim()) return showToast('Please enter a candidate name.', false);
    const chapter = adminInfo!.isHead ? 'All' : adminInfo!.branch;
    const { error } = await supabase.from('candidates').insert([{ full_name: newCandName.trim(), position_name: newCandPosition, chapter }]);
    if (error) showToast('Failed to add. Check for duplicates.', false);
    else { showToast(`${newCandName.trim()} added.`, true); setNewCandName(''); fetchData(adminInfo!.branch, adminInfo!.isHead); }
  }

  async function removeCandidate(cand: Candidate) {
    const hasVotes = votes.some(v => v.candidate_name === cand.full_name && v.position_name === cand.position_name);
    if (hasVotes) return showToast(`Cannot remove — votes already cast for ${cand.full_name}.`, false);
    if (!confirm(`Remove "${cand.full_name}"?`)) return;
    await supabase.from('candidates').delete().eq('id', cand.id);
    showToast(`${cand.full_name} removed.`, true);
    fetchData(adminInfo!.branch, adminInfo!.isHead);
  }

  // ── Admin management (head only) ───────────────────────────────────────────
  async function addAdmin() {
    if (!newAdminEmail.includes('@')) return showToast('Invalid email.', false);
    const { error } = await supabase.from('election_admins').insert([{ email: newAdminEmail.toLowerCase().trim(), branch: newAdminBranch }]);
    if (error) showToast('Admin already exists for that email.', false);
    else { showToast(`${newAdminEmail} added as ${newAdminBranch} admin.`, true); setNewAdminEmail(''); fetchData('National', true); }
  }

  async function removeAdmin(id: number, email: string) {
    if (!confirm(`Remove ${email} as branch admin?`)) return;
    await supabase.from('election_admins').delete().eq('id', id);
    showToast(`${email} removed.`, true);
    fetchData('National', true);
  }

  // ── Roster management ──────────────────────────────────────────────────────
  async function addToRoster() {
    if (!newEmail.includes('@')) return showToast('Invalid email.', false);
    const { error } = await supabase.from('eligible_voters').insert([{ email: newEmail.toLowerCase().trim() }]);
    if (error) showToast('Email already on roster!', false);
    else { setNewEmail(''); showToast('Added to roster.', true); fetchData('National', true); }
  }

  async function removeFromRoster(email: string) {
    if (!confirm(`Remove ${email} from roster?`)) return;
    await supabase.from('eligible_voters').delete().eq('email', email);
    showToast(`${email} removed.`, true);
    fetchData('National', true);
  }

  // ── Blacklist management ───────────────────────────────────────────────────
  async function addToBlacklist() {
    if (!newBlackEmail.includes('@')) return showToast('Invalid email.', false);
    const { error } = await supabase.from('blacklisted_voters').insert([{
      email: newBlackEmail.toLowerCase().trim(),
      reason: newBlackReason.trim() || 'No reason provided'
    }]);
    if (error) showToast('Email already blacklisted.', false);
    else { setNewBlackEmail(''); setNewBlackReason(''); showToast('Email blacklisted.', true); fetchData('National', true); }
  }

  async function removeFromBlacklist(email: string) {
    if (!confirm(`Remove ${email} from blacklist?`)) return;
    await supabase.from('blacklisted_voters').delete().eq('email', email);
    showToast(`${email} removed from blacklist.`, true);
    fetchData('National', true);
  }

  // ── Class year editor ──────────────────────────────────────────────────────
  async function saveClassYear() {
    if (!editingVoter || !editClass || editClass.length < 4) return showToast('Enter a valid 4-digit year.', false);
    const { error } = await supabase.from('voter_profiles').update({ class_year: editClass }).eq('id', editingVoter.id);
    if (error) showToast('Update failed.', false);
    else {
      showToast(`Updated to ${editClass}.`, true);
      setVoters(prev => prev.map(v => v.id === editingVoter.id ? { ...v, class_year: editClass } : v));
      setEditingVoter(null);
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportToCSV() {
    const filtered = (filterChapter === 'All' && adminInfo?.isHead) ? votes : votes.filter(v => v.chapter === (adminInfo?.isHead ? filterChapter : adminInfo?.branch));
    const headers  = ['ID','Voter Email','Chapter','Class Year','Position','Candidate','Timestamp'];
    const rows     = filtered.map(v => [v.id, v.voter_name, v.chapter, v.class_year, v.position_name, v.candidate_name, new Date(v.created_at).toLocaleString()]);
    const csv      = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a'); a.href = url;
    a.download     = `BWIAA_2026_${adminInfo?.branch}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const displayVotes  = adminInfo?.isHead && filterChapter !== 'All' ? votes.filter(v => v.chapter === filterChapter) : votes;
  const displayVoters = adminInfo?.isHead && filterChapter !== 'All' ? voters.filter(v => v.home_chapter === filterChapter) : voters;

  const candByPosition = useMemo(() => POSITIONS.reduce((acc, pos) => {
    acc[pos] = candidates.filter(c => c.position_name === pos);
    return acc;
  }, {} as Record<string, Candidate[]>), [candidates]);

  // Results: tally per candidate per position, filtered by chapter selection
  const resultsByPosition = useMemo(() => {
    const scope = filterChapter === 'All' ? votes : votes.filter(v => v.chapter === filterChapter);
    return POSITIONS.map(pos => {
      const posVotes = scope.filter(v => v.position_name === pos);
      const candList = candidates.filter(c => c.position_name === pos);
      const tally = candList.map(c => ({
        name: c.full_name,
        count: posVotes.filter(v => v.candidate_name === c.full_name).length,
        chapter: c.chapter,
      })).sort((a, b) => b.count - a.count);
      return { position: pos, tally, total: posVotes.length };
    });
  }, [votes, candidates, filterChapter]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-3">
      <Loader2 className="animate-spin text-red-600" size={32}/>
      <span className="font-black uppercase tracking-widest text-sm">Verifying Admin Identity...</span>
    </div>
  );
  if (!adminInfo) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
      <div>
        <AlertCircle size={64} className="text-red-600 mx-auto mb-4"/>
        <h1 className="text-3xl font-black uppercase mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6">You are not authorized to access this page.</p>
        <Link href="/" className="bg-red-600 text-white px-8 py-3 rounded-2xl font-black uppercase">Return to Ballot</Link>
      </div>
    </div>
  );

  const TABS: { id: Tab; label: string; icon: any; headOnly?: boolean }[] = [
    { id: 'overview',   label: 'Overview',   icon: BarChart2  },
    { id: 'results',    label: 'Results',    icon: Trophy     },
    { id: 'candidates', label: 'Candidates', icon: Award      },
    { id: 'voters',     label: 'Voters',     icon: Users      },
    { id: 'roster',     label: 'Roster',     icon: UserPlus,  headOnly: true },
    { id: 'admins',     label: 'Admins',     icon: Settings,  headOnly: true },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center gap-3
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
          {toast.msg}
        </div>
      )}

      {/* Class Year Modal */}
      {editingVoter && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl border-t-8 border-blue-600">
            <h3 className="text-xl font-black uppercase italic mb-2">Edit Class Year</h3>
            <p className="text-slate-400 text-xs font-mono mb-6 truncate">{editingVoter.id}</p>
            <input type="number" value={editClass} onChange={e => setEditClass(e.target.value)} placeholder="e.g. 1998"
              className="w-full p-4 rounded-2xl bg-slate-100 font-black text-2xl text-center outline-none focus:ring-2 ring-blue-500 mb-6"/>
            <div className="flex gap-3">
              <button onClick={saveClassYear} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl uppercase flex items-center justify-center gap-2"><Save size={16}/> Save</button>
              <button onClick={() => setEditingVoter(null)} className="flex-1 bg-slate-100 text-slate-600 font-black py-4 rounded-2xl uppercase flex items-center justify-center gap-2"><X size={16}/> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link href="/" className="text-slate-400 text-xs font-bold uppercase flex items-center gap-2 mb-1 hover:text-red-600 transition-all"><ArrowLeft size={12}/> Voter Page</Link>
            <h1 className="text-2xl font-black text-slate-900 uppercase italic">Command Center</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              {adminInfo.isHead ? '🔴 Head Admin — National' : `Branch Admin — ${adminInfo.branch}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {adminInfo.isHead && (
              <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)}
                className="bg-slate-100 text-slate-700 font-black text-sm px-4 py-3 rounded-2xl outline-none focus:ring-2 ring-red-500">
                <option>All</option>
                {CHAPTERS.map(c => <option key={c}>{c}</option>)}
              </select>
            )}
            <button onClick={() => fetchData(adminInfo.branch, adminInfo.isHead)} className="bg-slate-100 p-3 rounded-2xl text-slate-500 hover:text-slate-900 transition-all" title="Refresh"><RefreshCw size={18}/></button>
            <button onClick={exportToCSV} className="bg-green-600 text-white px-5 py-3 rounded-2xl font-black text-sm uppercase flex items-center gap-2 hover:bg-green-700 transition-all shadow-lg"><Download size={16}/> Export CSV</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0">
          {TABS.filter(t => !t.headOnly || adminInfo.isHead).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 font-black text-xs uppercase tracking-widest whitespace-nowrap border-b-4 transition-all
                ${activeTab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <t.icon size={14}/> {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Votes',       value: displayVotes.length,  color: 'text-red-500'    },
                { label: 'Voters Registered', value: displayVoters.length, color: 'text-blue-500'   },
                { label: 'Roster Size',       value: roster.length,        color: 'text-purple-500' },
                { label: 'Turnout', value: displayVoters.length > 0 ? `${Math.round((new Set(displayVotes.map(v=>v.voter_id)).size / displayVoters.length)*100)}%` : '—', color: 'text-green-500' },
              ].map(s => (
                <div key={s.label} className="bg-white p-6 rounded-[2rem] shadow-md border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                  <p className={`text-4xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Audit Log */}
            <section className="bg-slate-900 p-8 rounded-[3rem] shadow-xl text-white">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black uppercase italic flex items-center gap-2 text-blue-400"><ShieldCheck size={20}/> Audit Log</h2>
                <span className="bg-blue-600/20 border border-blue-600/30 text-blue-400 px-4 py-2 rounded-full font-black text-sm">{displayVotes.length} RECORDS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-white/10">
                    {['Time','Voter','Chapter','Class','Position','Candidate'].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {displayVotes.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-500 font-bold">No votes yet.</td></tr>}
                    {displayVotes.map((v, i) => (
                      <tr key={v.id ?? i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-3 text-slate-500">{new Date(v.created_at).toLocaleString()}</td>
                        <td className="py-3 px-3 text-slate-300 font-bold truncate max-w-[130px]">{v.voter_name}</td>
                        <td className="py-3 px-3 text-slate-400">{v.chapter}</td>
                        <td className="py-3 px-3 text-red-400 font-black">{v.class_year}</td>
                        <td className="py-3 px-3 text-slate-300 italic">{v.position_name}</td>
                        <td className="py-3 px-3 text-white font-black">{v.candidate_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ── RESULTS TAB ───────────────────────────────────────────────── */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 rounded-[3rem] text-white text-center shadow-2xl">
              <Trophy size={48} className="text-yellow-400 mx-auto mb-3"/>
              <h2 className="text-3xl font-black uppercase italic tracking-tight">Election Results</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">
                {filterChapter === 'All' ? 'National Aggregate' : `${filterChapter} Chapter`} • Live Count
              </p>
              <p className="text-slate-500 text-xs mt-1 font-bold">{displayVotes.length} total ballots cast</p>
            </div>

            {resultsByPosition.map(({ position, tally, total }) => {
              const winner = tally[0];
              return (
                <div key={position} className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
                  <div className="bg-slate-900 px-8 py-5 flex justify-between items-center">
                    <h3 className="text-white font-black uppercase italic text-sm tracking-widest">{position}</h3>
                    <span className="text-slate-400 text-xs font-bold uppercase">{total} votes cast</span>
                  </div>
                  <div className="p-6 space-y-4">
                    {tally.length === 0 && <p className="text-slate-300 font-bold text-sm text-center py-4">No candidates added yet.</p>}
                    {tally.map((c, idx) => {
                      const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                      const isLeading = idx === 0 && c.count > 0;
                      return (
                        <div key={c.name}>
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                              {isLeading && <Trophy size={16} className="text-yellow-500"/>}
                              <span className={`font-black text-sm ${isLeading ? 'text-slate-900' : 'text-slate-500'}`}>{c.name}</span>
                              {isLeading && <span className="text-[9px] bg-yellow-100 text-yellow-700 font-black px-2 py-0.5 rounded-full uppercase">Leading</span>}
                            </div>
                            <div className="text-right">
                              <span className={`text-2xl font-black ${isLeading ? 'text-red-600' : 'text-slate-400'}`}>{c.count}</span>
                              <span className="text-slate-400 text-xs font-bold ml-2">{pct}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-3 rounded-full transition-all duration-1000 ${isLeading ? 'bg-red-600' : 'bg-slate-300'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CANDIDATES TAB ────────────────────────────────────────────── */}
        {activeTab === 'candidates' && (
          <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-orange-500">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic"><Award className="text-orange-500"/> Candidate Management</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">
              {adminInfo.isHead ? 'Candidates added here are visible to ALL chapters.' : `Candidates added here appear under ${adminInfo.branch} only.`}
            </p>
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Add New Candidate</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="Full name" value={newCandName} onChange={e => setNewCandName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCandidate()}
                  className="flex-1 p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-orange-400 border border-slate-200"/>
                <select value={newCandPosition} onChange={e => setNewCandPosition(e.target.value)}
                  className="p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-orange-400 border border-slate-200 min-w-[200px]">
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={addCandidate} className="bg-orange-500 text-white px-6 py-4 rounded-2xl font-black uppercase text-sm hover:bg-orange-600 transition-all flex items-center gap-2 shadow-lg whitespace-nowrap">
                  <PlusCircle size={16}/> Add
                </button>
              </div>
            </div>
            <div className="space-y-8">
              {POSITIONS.map(pos => {
                const list = candByPosition[pos] || [];
                return (
                  <div key={pos}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-orange-400 pl-3">{pos}</h3>
                      <span className="text-[10px] bg-orange-50 text-orange-500 font-black px-3 py-1 rounded-full border border-orange-100">{list.length} candidate{list.length !== 1 ? 's' : ''}</span>
                    </div>
                    {list.length === 0
                      ? <p className="text-slate-300 text-sm italic px-4 py-3 bg-slate-50 rounded-2xl font-bold">No candidates yet.</p>
                      : <div className="space-y-2">
                          {list.map(c => {
                            const voteCount = votes.filter(v => v.candidate_name === c.full_name && v.position_name === c.position_name).length;
                            return (
                              <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-slate-800">{c.full_name}</span>
                                  {c.chapter !== 'All' && <span className="text-[10px] bg-blue-100 text-blue-600 font-black px-2 py-0.5 rounded-full uppercase">{c.chapter}</span>}
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-black text-slate-400">{voteCount} vote{voteCount !== 1 ? 's' : ''}</span>
                                  <button onClick={() => removeCandidate(c)} disabled={voteCount > 0}
                                    className={`flex items-center gap-1 px-3 py-2 rounded-xl font-black text-xs uppercase transition-all ${voteCount > 0 ? 'text-slate-200 cursor-not-allowed' : 'text-red-400 hover:text-white hover:bg-red-500'}`}>
                                    <Trash2 size={14}/>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                    }
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── VOTERS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'voters' && (
          <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-purple-600">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-6 uppercase italic"><Users className="text-purple-600"/> Registered Voters</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-slate-100">
                  {['Voter ID','Chapter','Class Year','Registered','Edit'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {displayVoters.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400 font-bold">No voters yet.</td></tr>}
                  {displayVoters.map(v => (
                    <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                      <td className="py-3 px-4 font-mono text-slate-500 text-xs">{v.id.slice(0,12)}…</td>
                      <td className="py-3 px-4 font-bold text-slate-700">{v.home_chapter}</td>
                      <td className="py-3 px-4 font-black text-slate-900">{v.class_year}</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">{new Date(v.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        <button onClick={() => { setEditingVoter(v); setEditClass(v.class_year); }}
                          className="bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-xl font-black text-xs uppercase transition-all flex items-center gap-1">
                          <Edit3 size={12}/> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── ROSTER + BLACKLIST TAB (head only) ────────────────────────── */}
        {activeTab === 'roster' && adminInfo.isHead && (
          <div className="space-y-8">
            {/* Whitelist */}
            <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-blue-600">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic"><UserPlus className="text-blue-600"/> Official Roster (Whitelist)</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Only these emails can vote. Empty = open election mode.</p>
              <div className="flex gap-3 mb-6">
                <input type="email" placeholder="voter@gmail.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addToRoster()}
                  className="flex-1 p-4 bg-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-blue-500"/>
                <button onClick={addToRoster} className="bg-blue-600 text-white px-6 rounded-2xl font-black hover:bg-blue-700 transition-all uppercase text-sm">ADD</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {roster.length === 0 && <p className="text-slate-400 text-sm font-bold text-center py-6">No emails — open election mode active.</p>}
                {roster.map(m => (
                  <div key={m.email} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-sm font-bold text-slate-700">{m.email}</span>
                    <button onClick={() => removeFromRoster(m.email)} className="text-red-400 hover:text-red-600 transition-all"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
            </section>

            {/* Blacklist */}
            <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-red-600">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic"><Ban className="text-red-600"/> Blacklist</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Blocked emails can never vote, even if they are on the roster.</p>
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input type="email" placeholder="email@gmail.com" value={newBlackEmail} onChange={e => setNewBlackEmail(e.target.value)}
                  className="flex-1 p-4 bg-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-red-500"/>
                <input type="text" placeholder="Reason (optional)" value={newBlackReason} onChange={e => setNewBlackReason(e.target.value)}
                  className="flex-1 p-4 bg-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-red-500"/>
                <button onClick={addToBlacklist} className="bg-red-600 text-white px-6 rounded-2xl font-black hover:bg-red-700 transition-all uppercase text-sm whitespace-nowrap">BLOCK</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {blacklist.length === 0 && <p className="text-slate-400 text-sm font-bold text-center py-6">No blocked emails.</p>}
                {blacklist.map(m => (
                  <div key={m.email} className="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-100">
                    <div>
                      <span className="text-sm font-black text-slate-700">{m.email}</span>
                      {m.reason && <span className="ml-3 text-xs text-red-500 font-bold italic">{m.reason}</span>}
                    </div>
                    <button onClick={() => removeFromBlacklist(m.email)} className="text-slate-400 hover:text-slate-700 transition-all"><X size={16}/></button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── ADMINS TAB (head only) ─────────────────────────────────────── */}
        {activeTab === 'admins' && adminInfo.isHead && (
          <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-slate-700">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic"><Settings className="text-slate-700"/> Branch Admins</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Each branch admin can manage their chapter's candidates, voters, and view local audit logs.</p>

            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Add Branch Admin</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="email" placeholder="chairperson@gmail.com" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAdmin()}
                  className="flex-1 p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-slate-400 border border-slate-200"/>
                <select value={newAdminBranch} onChange={e => setNewAdminBranch(e.target.value)}
                  className="p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-slate-400 border border-slate-200 min-w-[180px]">
                  {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={addAdmin} className="bg-slate-800 text-white px-6 py-4 rounded-2xl font-black uppercase text-sm hover:bg-slate-900 transition-all flex items-center gap-2 whitespace-nowrap shadow-lg">
                  <PlusCircle size={16}/> Add Admin
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {admins.length === 0 && <p className="text-slate-400 text-sm font-bold text-center py-8">No branch admins yet.</p>}
              {admins.map(a => (
                <div key={a.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <span className="font-black text-slate-800">{a.email}</span>
                    <span className="ml-3 text-xs bg-slate-200 text-slate-600 font-black px-3 py-1 rounded-full uppercase">{a.branch}</span>
                  </div>
                  <button onClick={() => removeAdmin(a.id, a.email)} className="text-red-400 hover:text-red-600 transition-all flex items-center gap-1 text-xs font-black uppercase px-3 py-2 rounded-xl hover:bg-red-50">
                    <Trash2 size={14}/> Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
