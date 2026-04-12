"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, Users, Edit3, Loader2, UserPlus,
  Trash2, ArrowLeft, Download, Save, X, RefreshCw,
  CheckCircle2, AlertCircle, PlusCircle, Award
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface VoteRow        { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }
interface VoterProfile   { id: string; home_chapter: string; class_year: string; created_at: string; }
interface Candidate      { id: number; full_name: string; position_name: string; chapter: string; }
interface AdminInfo      { email: string; branch: string; isHead: boolean; }

const HEAD_ADMIN = "ezekielborbor17@gmail.com";
const CHAPTERS   = ["Harbel and RIA","Monrovia","Buchanan","Gbarnga","Kakata","Voinjama","Zwedru","Robertsport","Greenville","Harper","Sanniquellie","Cestos City"];
const POSITIONS  = ["President","Vice President (Administration)","Secretary General","Financial Secretary","Treasurer","Media & Publicity CHAIRMAN","CHAPLAIN"];

export default function AdminDashboard() {
  const [votes, setVotes]                     = useState<VoteRow[]>([]);
  const [voters, setVoters]                   = useState<VoterProfile[]>([]);
  const [roster, setRoster]                   = useState<{ email: string }[]>([]);
  const [candidates, setCandidates]           = useState<Candidate[]>([]);
  const [adminInfo, setAdminInfo]             = useState<AdminInfo | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [newEmail, setNewEmail]               = useState('');
  const [toast, setToast]                     = useState<{ msg: string; ok: boolean } | null>(null);
  const [editingVoter, setEditingVoter]       = useState<VoterProfile | null>(null);
  const [editClass, setEditClass]             = useState('');
  const [filterChapter, setFilterChapter]     = useState('All');
  const [newCandName, setNewCandName]         = useState('');
  const [newCandPosition, setNewCandPosition] = useState(POSITIONS[0]);

  // ── Auth gate ──────────────────────────────────────────────────────────────
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

    // Head sees all candidates; branch admin sees their chapter + national ones
    const cq = supabase.from('candidates').select('*').order('position_name');
    if (!isHead) cq.in('chapter', [branch, 'All']);
    const { data: cData } = await cq;
    setCandidates(cData || []);

    if (isHead) {
      const { data: rData } = await supabase.from('eligible_voters').select('*');
      setRoster(rData || []);
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Candidate management ───────────────────────────────────────────────────
  async function addCandidate() {
    if (!newCandName.trim()) return showToast('Please enter a candidate name.', false);
    if (!adminInfo) return;
    const chapter = adminInfo.isHead ? 'All' : adminInfo.branch;
    const { error } = await supabase.from('candidates').insert([{
      full_name: newCandName.trim(),
      position_name: newCandPosition,
      chapter,
    }]);
    if (error) showToast('Failed to add. Check for duplicates.', false);
    else {
      showToast(`${newCandName.trim()} added to ${newCandPosition}.`, true);
      setNewCandName('');
      fetchData(adminInfo.branch, adminInfo.isHead);
    }
  }

  async function removeCandidate(cand: Candidate) {
    const hasVotes = votes.some(v => v.candidate_name === cand.full_name && v.position_name === cand.position_name);
    if (hasVotes) return showToast(`Cannot remove — votes have already been cast for ${cand.full_name}.`, false);
    if (!confirm(`Remove "${cand.full_name}" from ${cand.position_name}?`)) return;
    await supabase.from('candidates').delete().eq('id', cand.id);
    showToast(`${cand.full_name} removed.`, true);
    fetchData(adminInfo!.branch, adminInfo!.isHead);
  }

  // ── Roster management ──────────────────────────────────────────────────────
  async function addToRoster() {
    if (!newEmail.includes('@')) return showToast('Invalid email address.', false);
    const { error } = await supabase.from('eligible_voters').insert([{ email: newEmail.toLowerCase().trim() }]);
    if (error) showToast('Email already on roster!', false);
    else { setNewEmail(''); showToast('Added to official roster.', true); fetchData('National', true); }
  }

  async function removeFromRoster(email: string) {
    if (!confirm(`Remove ${email} from official roster?`)) return;
    await supabase.from('eligible_voters').delete().eq('email', email);
    showToast(`${email} removed.`, true);
    fetchData('National', true);
  }

  // ── Class year editor ──────────────────────────────────────────────────────
  async function saveClassYear() {
    if (!editingVoter) return;
    if (!editClass || editClass.length < 4) return showToast('Please enter a valid 4-digit year.', false);
    const { error } = await supabase.from('voter_profiles').update({ class_year: editClass }).eq('id', editingVoter.id);
    if (error) showToast('Failed to update. Please try again.', false);
    else {
      showToast(`Class year updated to ${editClass}.`, true);
      setVoters(prev => prev.map(v => v.id === editingVoter.id ? { ...v, class_year: editClass } : v));
      setEditingVoter(null);
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportToCSV() {
    const isHead = adminInfo?.isHead;
    const branch = adminInfo?.branch;
    const filtered = (filterChapter === 'All' && isHead) ? votes : votes.filter(v => v.chapter === (isHead ? filterChapter : branch));
    const headers  = ['ID','Voter Email','Chapter','Class Year','Position','Candidate','Timestamp'];
    const rows     = filtered.map(v => [v.id, v.voter_name, v.chapter, v.class_year, v.position_name, v.candidate_name, new Date(v.created_at).toLocaleString()]);
    const csv      = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `BWIAA_Election_2026_${branch}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-3">
      <Loader2 className="animate-spin text-red-600" size={32}/>
      <span className="font-black uppercase tracking-widest text-sm">Verifying Admin Identity...</span>
    </div>
  );

  if (!adminInfo) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="text-center">
        <AlertCircle size={64} className="text-red-600 mx-auto mb-4"/>
        <h1 className="text-3xl font-black uppercase text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6">You are not authorized to access this page.</p>
        <Link href="/" className="bg-red-600 text-white px-8 py-3 rounded-2xl font-black uppercase">Return to Ballot</Link>
      </div>
    </div>
  );

  const displayVotes  = adminInfo.isHead && filterChapter !== 'All' ? votes.filter(v => v.chapter === filterChapter) : votes;
  const displayVoters = adminInfo.isHead && filterChapter !== 'All' ? voters.filter(v => v.home_chapter === filterChapter) : voters;

  const candByPosition = POSITIONS.reduce((acc, pos) => {
    acc[pos] = candidates.filter(c => c.position_name === pos);
    return acc;
  }, {} as Record<string, Candidate[]>);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center gap-3
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
          {toast.msg}
        </div>
      )}

      {/* Class Year Edit Modal */}
      {editingVoter && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl border-t-8 border-blue-600">
            <h3 className="text-xl font-black uppercase italic mb-2">Edit Class Year</h3>
            <p className="text-slate-400 text-xs font-mono mb-6">{editingVoter.id}</p>
            <input type="number" value={editClass} onChange={e => setEditClass(e.target.value)} placeholder="e.g. 1998"
              className="w-full p-4 rounded-2xl bg-slate-100 font-black text-2xl text-center outline-none focus:ring-2 ring-blue-500 mb-6"/>
            <div className="flex gap-3">
              <button onClick={saveClassYear} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl uppercase flex items-center justify-center gap-2">
                <Save size={16}/> Save
              </button>
              <button onClick={() => setEditingVoter(null)} className="flex-1 bg-slate-100 text-slate-600 font-black py-4 rounded-2xl uppercase flex items-center justify-center gap-2">
                <X size={16}/> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 bg-white p-8 rounded-[2.5rem] shadow-xl border-b-8 border-red-600">
        <div>
          <Link href="/" className="text-slate-400 text-xs font-bold uppercase flex items-center gap-2 mb-2 hover:text-red-600 transition-all">
            <ArrowLeft size={12}/> Voter Page
          </Link>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic">Command Center</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            {adminInfo.isHead ? '🔴 Head Admin — National View' : `Branch Admin — ${adminInfo.branch}`}
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
          <button onClick={() => fetchData(adminInfo.branch, adminInfo.isHead)}
            className="bg-slate-100 p-3 rounded-2xl text-slate-500 hover:text-slate-900 transition-all" title="Refresh">
            <RefreshCw size={18}/>
          </button>
          <button onClick={exportToCSV}
            className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase flex items-center gap-2 hover:bg-green-700 transition-all shadow-lg">
            <Download size={16}/> Export CSV
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto space-y-10">

        {/* Stats */}
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

        {/* ── CANDIDATE MANAGEMENT ──────────────────────────────────────── */}
        <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-orange-500">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic">
            <Award className="text-orange-500"/> Candidate Management
          </h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">
            {adminInfo.isHead
              ? 'Candidates added here are visible to ALL chapters nationwide.'
              : `Candidates added here appear only under the ${adminInfo.branch} chapter.`}
          </p>

          {/* Add form */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Add New Candidate</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Full name of candidate"
                value={newCandName}
                onChange={e => setNewCandName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCandidate()}
                className="flex-1 p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-orange-400 border border-slate-200"
              />
              <select value={newCandPosition} onChange={e => setNewCandPosition(e.target.value)}
                className="p-4 bg-white rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-orange-400 border border-slate-200 min-w-[220px]">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={addCandidate}
                className="bg-orange-500 text-white px-6 py-4 rounded-2xl font-black uppercase text-sm hover:bg-orange-600 transition-all flex items-center gap-2 whitespace-nowrap shadow-lg">
                <PlusCircle size={16}/> Add
              </button>
            </div>
          </div>

          {/* Candidates list by position */}
          <div className="space-y-8">
            {POSITIONS.map(pos => {
              const list = candByPosition[pos] || [];
              return (
                <div key={pos}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-orange-400 pl-3">{pos}</h3>
                    <span className="text-[10px] bg-orange-50 text-orange-500 font-black px-3 py-1 rounded-full uppercase border border-orange-100">
                      {list.length} candidate{list.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-slate-300 text-sm italic px-4 py-3 bg-slate-50 rounded-2xl font-bold">No candidates yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map(c => {
                        const voteCount = votes.filter(v => v.candidate_name === c.full_name && v.position_name === c.position_name).length;
                        const locked = voteCount > 0;
                        return (
                          <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                              <span className="font-black text-slate-800">{c.full_name}</span>
                              {c.chapter !== 'All' && (
                                <span className="text-[10px] bg-blue-100 text-blue-600 font-black px-2 py-0.5 rounded-full uppercase">{c.chapter}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              {voteCount > 0 && (
                                <span className="text-[10px] font-black text-slate-400 uppercase">{voteCount} vote{voteCount !== 1 ? 's' : ''}</span>
                              )}
                              <button
                                onClick={() => removeCandidate(c)}
                                disabled={locked}
                                title={locked ? 'Cannot remove — votes already cast' : 'Remove candidate'}
                                className={`flex items-center gap-1 px-3 py-2 rounded-xl font-black text-xs uppercase transition-all
                                  ${locked ? 'text-slate-200 cursor-not-allowed' : 'text-red-400 hover:text-white hover:bg-red-500'}`}>
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── OFFICIAL ROSTER ───────────────────────────────────────────── */}
        {adminInfo.isHead && (
          <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-blue-600">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2 uppercase italic">
              <UserPlus className="text-blue-600"/> Official Roster
            </h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">
              Only emails on this list can vote. Leave empty to allow all Gmail users (open mode).
            </p>
            <div className="flex gap-3 mb-6">
              <input type="email" placeholder="voter@gmail.com" value={newEmail}
                onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addToRoster()}
                className="flex-1 p-4 bg-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-blue-500"/>
              <button onClick={addToRoster} className="bg-blue-600 text-white px-6 rounded-2xl font-black hover:bg-blue-700 transition-all uppercase text-sm">ADD</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {roster.length === 0 && <p className="text-slate-400 text-sm font-bold text-center py-6">No emails — open election mode active.</p>}
              {roster.map(m => (
                <div key={m.email} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-bold text-slate-700">{m.email}</span>
                  <button onClick={() => removeFromRoster(m.email)} className="text-red-400 hover:text-red-600 transition-all"><Trash2 size={16}/></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── REGISTERED VOTERS ─────────────────────────────────────────── */}
        <section className="bg-white p-8 rounded-[3rem] shadow-xl border-t-8 border-purple-600">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-6 uppercase italic">
            <Users className="text-purple-600"/> Registered Voters
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {['Voter ID (partial)','Chapter','Class Year','Registered','Edit'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayVoters.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-slate-400 font-bold">No voters registered yet.</td></tr>
                )}
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

        {/* ── AUDIT LOG ─────────────────────────────────────────────────── */}
        <section className="bg-slate-900 p-8 rounded-[3rem] shadow-xl text-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <h2 className="text-2xl font-black uppercase italic flex items-center gap-2 text-blue-400">
              <ShieldCheck/> Audit Log
            </h2>
            <span className="bg-blue-600/20 border border-blue-600/30 text-blue-400 px-4 py-2 rounded-full font-black text-sm">
              {displayVotes.length} RECORDS
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  {['Time','Voter','Chapter','Class','Position','Candidate'].map(h => (
                    <th key={h} className="text-left py-3 px-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayVotes.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-500 font-bold">No votes recorded yet.</td></tr>
                )}
                {displayVotes.map((v, i) => (
                  <tr key={v.id ?? i} className="border-b border-white/5 hover:bg-white/5 transition-all">
                    <td className="py-3 px-3 text-slate-500">{new Date(v.created_at).toLocaleString()}</td>
                    <td className="py-3 px-3 text-slate-300 font-bold truncate max-w-[140px]">{v.voter_name}</td>
                    <td className="py-3 px-3 text-slate-400">{v.chapter}</td>
                    <td className="py-3 px-3 text-red-400 font-black">{v.class_year}</td>
                    <td className="py-3 px-3 text-slate-300 italic">{v.position_name}</td>
                    <td className="py-3 px-3 text-white font-black">{v.candidate_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>a"use client";

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Vote, ShieldCheck, LogOut, Loader2, CheckCircle2, AlertCircle, Fingerprint, Activity, Terminal, XCircle } from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candidate { id: number; full_name: string; position_name: string; chapter: string; }
interface VoteRow { id: number; voter_name: string; voter_id: string; position_name: string; candidate_name: string; chapter: string; class_year: string; created_at: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const YOUR_ADMIN_EMAIL = "ezekielborbor17@gmail.com";
const CHAPTERS = ["Harbel and RIA","Monrovia","Buchanan","Gbarnga","Kakata","Voinjama","Zwedru","Robertsport","Greenville","Harper","Sanniquellie","Cestos City"];

export default function BWIAAElection2026() {
  const [user, setUser]           = useState<any>(null);
  const [myChapter, setMyChapter] = useState<string | null>(null);
  const [myClass, setMyClass]     = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [votes, setVotes]         = useState<VoteRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [receipt, setReceipt]     = useState<VoteRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [classInput, setClassInput] = useState('');
  const [pendingChapter, setPendingChapter] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          await loadVoterProfile(user);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    init();
    refreshVotes();
    fetchCandidates();

    // Realtime subscription for live vote tally
    const live = supabase.channel('national-audit')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, (payload) => {
        setVotes(prev => [payload.new as VoteRow, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(live); };
  }, []);

  // ── After OAuth redirect: complete registration ────────────────────────────
  useEffect(() => {
    if (user && !myChapter) {
      const raw = localStorage.getItem('pending_voter_data');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending.chapter) {
        completeRegistration(user, pending.chapter, pending.classYear);
      }
    }
  }, [user]);

  async function loadVoterProfile(u: any) {
    const { data: profile } = await supabase
      .from('voter_profiles')
      .select('home_chapter, class_year')
      .eq('id', u.id)
      .maybeSingle();

    if (profile) {
      setMyChapter(profile.home_chapter);
      setMyClass(profile.class_year);
    }
  }

  async function fetchCandidates() {
    const { data } = await supabase.from('candidates').select('*').order('position_name');
    if (data) setCandidates(data);
  }

  async function refreshVotes() {
    const { data } = await supabase.from('votes').select('*').order('created_at', { ascending: false });
    if (data) setVotes(data);
  }

  async function completeRegistration(u: any, chapter: string, classYear: string) {
    const { error } = await supabase.from('voter_profiles').upsert([{
      id: u.id,
      home_chapter: chapter,
      class_year: classYear,
    }], { onConflict: 'id', ignoreDuplicates: true }); // ignoreDuplicates = never overwrite existing chapter

    if (!error) {
      setMyChapter(chapter);
      setMyClass(classYear);
      localStorage.removeItem('pending_voter_data');
    }
  }

  // ── Login flow ─────────────────────────────────────────────────────────────
  async function handleChapterSelect(chapter: string) {
    if (!classInput || classInput.length < 4) {
      setErrorMessage("Please enter a valid 4-digit Graduating Class Year before selecting your chapter.");
      return;
    }

    // ── WHITELIST CHECK ──
    // Check if email is already in the session; if not, we check after OAuth.
    // We store the intended chapter + class locally before the OAuth redirect.
    localStorage.setItem('pending_voter_data', JSON.stringify({ chapter, classYear: classInput }));
    setPendingChapter(chapter);

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  }

  // Called after OAuth resolves with a known user - checks whitelist
  useEffect(() => {
    if (!user) return;
    checkWhitelist(user.email);
  }, [user]);

  async function checkWhitelist(email: string) {
    const lowerEmail = email.toLowerCase();

    // ── 1. BLACKLIST CHECK — always runs first, no exceptions ──
    const { data: blocked } = await supabase
      .from('blacklisted_voters')
      .select('email, reason')
      .eq('email', lowerEmail)
      .maybeSingle();

    if (blocked) {
      await supabase.auth.signOut();
      localStorage.clear();
      setUser(null);
      setErrorMessage(`ACCESS DENIED: This email has been blocked from participating in this election. Reason: ${blocked.reason}. Contact the Election Committee if you believe this is an error.`);
      return;
    }

    // ── 2. WHITELIST CHECK — only if roster has entries ──
    const { count } = await supabase
      .from('eligible_voters')
      .select('*', { count: 'exact', head: true });

    if (count && count > 0) {
      const { data: found } = await supabase
        .from('eligible_voters')
        .select('email')
        .eq('email', lowerEmail)
        .maybeSingle();

      if (!found) {
        await supabase.auth.signOut();
        localStorage.clear();
        setUser(null);
        setErrorMessage(`ACCESS DENIED: The email ${email} is not on the official BWIAA voter roster. Contact your chapter administrator to be added.`);
      }
    }
  }

  // ── Cast ballot ────────────────────────────────────────────────────────────
  async function castBallot(pos: string, cand: string) {
    if (!user || !myChapter) return;

    // Check if already voted for this position
    const alreadyVoted = votes.some(v => v.voter_id === user.id && v.position_name === pos);
    if (alreadyVoted) {
      setErrorMessage(`INTEGRITY ALERT: Our records show you have already cast a ballot for ${pos}. Each member may only vote once per position.`);
      return;
    }

    const { data, error } = await supabase
      .from('votes')
      .insert([{
        position_name: pos,
        candidate_name: cand,
        voter_name: user.email,
        voter_id: user.id,
        chapter: myChapter,
        class_year: myClass,
      }])
      .select()
      .single();

    if (error) {
      // DB unique constraint fallback
      setErrorMessage(`INTEGRITY ALERT: Our records show you have already cast a ballot for ${pos}.`);
    } else {
      setReceipt(data);
    }
  }

  async function handleSignOut() {
    localStorage.clear();
    await supabase.auth.signOut();
    window.location.href = window.location.origin;
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  // Group candidates by position
  const positionMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    candidates.forEach(c => {
      if (!map[c.position_name]) map[c.position_name] = [];
      map[c.position_name].push(c.full_name);
    });
    return map;
  }, [candidates]);

  // Which positions has this user already voted for?
  const votedPositions = useMemo(() =>
    new Set(votes.filter(v => v.voter_id === user?.id).map(v => v.position_name)),
    [votes, user]
  );

  // Per-chapter tally for display
  const chapterVotes = useMemo(() =>
    votes.filter(v => v.chapter === myChapter),
    [votes, myChapter]
  );

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
      <Loader2 className="animate-spin text-red-600" size={48} />
      <p className="font-black animate-pulse uppercase tracking-widest text-sm">Verifying National Identity...</p>
    </div>
  );

  // ── Landing / Chapter selection ────────────────────────────────────────────
  if (!myChapter) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        {/* Error Modal */}
        {errorMessage && (
          <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
              <XCircle size={64} className="text-red-600 mx-auto mb-6" />
              <h2 className="text-2xl font-black uppercase italic mb-4">Access Denied</h2>
              <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest">
                Understood
              </button>
            </div>
          </div>
        )}

        <h1 className="text-white text-5xl md:text-7xl font-black mb-4 tracking-tighter uppercase italic text-center">
          BWIAA <span className="text-red-600">2026</span>
        </h1>
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-10">National Alumni Election</p>

        {/* Class Year Input */}
        <div className="bg-white p-6 rounded-3xl mb-8 shadow-2xl w-full max-w-sm border-t-8 border-red-600">
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">
            Step 1 — Enter Your Graduating Class Year
          </label>
          <input
            type="number"
            value={classInput}
            onChange={e => setClassInput(e.target.value)}
            placeholder="e.g. 1995"
            className="p-4 rounded-2xl text-slate-900 font-black w-full text-center border-2 border-slate-100 focus:border-red-600 outline-none text-2xl"
          />
        </div>

        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">
          Step 2 — Select Your Chapter
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
          {CHAPTERS.map(c => (
            <button
              key={c}
              onClick={() => handleChapterSelect(c)}
              className="group bg-slate-900 border border-white/5 hover:border-red-600 p-8 rounded-[2.5rem] text-white font-black transition-all flex flex-col items-center gap-4 hover:bg-slate-800"
            >
              <Vote size={28} className="text-red-600" />
              <span className="text-xs uppercase tracking-widest text-center leading-relaxed">{c}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Main Voting Page ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 text-slate-900">

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
            <AlertCircle size={64} className="text-red-600 mx-auto mb-6" />
            <h2 className="text-3xl font-black uppercase italic mb-4">Notice</h2>
            <p className="text-slate-500 mb-8 font-medium leading-relaxed">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest">
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-md w-full text-center shadow-2xl border-t-[12px] border-green-500">
            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black uppercase italic mb-2 text-green-600">Vote Verified</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Your ballot has been recorded</p>
            <div className="bg-slate-50 p-6 rounded-3xl text-left font-mono text-[11px] mb-8 space-y-2 border border-slate-100">
              <p><span className="text-slate-400">CERTIFICATE:</span> {receipt.id}</p>
              <p><span className="text-slate-400">POSITION:</span> {receipt.position_name}</p>
              <p><span className="text-slate-400">VOTED FOR:</span> {receipt.candidate_name}</p>
              <p><span className="text-slate-400">CHAPTER:</span> {receipt.chapter}</p>
              <p><span className="text-slate-400">CLASS OF:</span> {receipt.class_year}</p>
              <p><span className="text-slate-400">TIMESTAMP:</span> {new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <button onClick={() => setReceipt(null)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest">
              Close Receipt
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b-2 border-slate-100 p-5 mb-10 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white p-2 rounded-xl shadow"><ShieldCheck size={18}/></div>
            <div className="font-black text-slate-900 uppercase leading-tight italic text-sm">
              BWIAA Ballot 2026
              <br/>
              <span className="text-[10px] text-red-600 font-bold">{myChapter} • CLASS OF {myClass}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-bold hidden md:block">{user?.email}</span>

            {/* Admin link — visible to: (1) head admin, (2) anyone in election_admins table */}
            <AdminLink userEmail={user?.email} headAdminEmail={YOUR_ADMIN_EMAIL} />

            <button
              onClick={handleSignOut}
              className="bg-slate-100 p-2.5 rounded-xl text-slate-400 hover:text-red-600 transition-all border border-slate-200"
              title="Sign Out"
            >
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </header>

      {/* Voting Sections */}
      <main className="max-w-4xl mx-auto px-4 space-y-12">
        {Object.entries(positionMap).map(([posTitle, candList]) => {
          const hasVoted = votedPositions.has(posTitle);
          return (
            <section key={posTitle} className={`bg-white p-8 md:p-12 rounded-[4rem] shadow-xl border-b-[18px] transition-all ${hasVoted ? 'border-green-400 opacity-80' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-2xl font-black text-slate-800 uppercase italic border-l-8 border-red-600 pl-6">
                  {posTitle}
                </h2>
                {hasVoted && (
                  <span className="flex items-center gap-2 text-green-600 font-black text-xs uppercase tracking-widest bg-green-50 px-4 py-2 rounded-full border border-green-200">
                    <CheckCircle2 size={14}/> Voted
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {candList.map(cand => {
                  const posVotes = chapterVotes.filter(v => v.position_name === posTitle);
                  const count = posVotes.filter(v => v.candidate_name === cand).length;
                  const total = posVotes.length;
                  const percent = total > 0 ? (count / total) * 100 : 0;

                  return (
                    <button
                      key={cand}
                      onClick={() => castBallot(posTitle, cand)}
                      disabled={hasVoted}
                      className={`relative w-full text-left p-8 rounded-[2.5rem] border-2 transition-all overflow-hidden
                        ${hasVoted
                          ? 'border-slate-100 cursor-not-allowed bg-slate-50/30'
                          : 'border-slate-100 hover:border-red-600 bg-slate-50/50 active:scale-95 hover:shadow-lg'
                        }`}
                    >
                      <div className="relative z-10 flex justify-between items-center font-black uppercase">
                        <span className="text-lg tracking-tight text-slate-800">{cand}</span>
                        <div className="text-right">
                          <span className="text-4xl text-red-600 block">{count}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Local Tally</span>
                        </div>
                      </div>
                      {/* Vote bar */}
                      <div
                        className="absolute left-0 top-0 h-full bg-red-100/40 border-r-4 border-red-200/50 -z-10 transition-all duration-1000 ease-out"
                        style={{ width: `${percent}%` }}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {Object.keys(positionMap).length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <Loader2 className="animate-spin mx-auto mb-4" size={32}/>
            <p className="font-bold uppercase tracking-widest text-sm">Loading ballot positions...</p>
          </div>
        )}
      </main>

      {/* Audit Log Footer */}
      <footer className="max-w-4xl mx-auto mt-24 mx-4 p-10 bg-slate-900 rounded-[3.5rem] text-white shadow-3xl relative overflow-hidden">
        <Fingerprint size={200} className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center border-b border-white/10 pb-8 mb-8 gap-4">
            <h3 className="text-xl font-black italic uppercase text-blue-400 tracking-tighter flex items-center gap-2">
              <Activity size={20}/> Audit Intelligence
            </h3>
            <span className="bg-blue-600 px-5 py-2 rounded-full font-black text-lg shadow-xl">
              {votes.length} NATIONAL BALLOTS
            </span>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {votes.map((v, i) => (
              <div key={v.id ?? i} className="flex flex-col md:flex-row md:justify-between items-start md:items-center py-3 border-b border-white/5 last:border-0 gap-1">
                <div>
                  <span className="text-[9px] font-black uppercase text-blue-400 tracking-[0.2em] block">
                    {v.chapter} • {new Date(v.created_at).toLocaleTimeString()}
                  </span>
                  <span className="text-xs font-bold text-slate-300">{v.voter_name}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-lg text-red-400 font-black uppercase tracking-widest">
                    CLASS OF {v.class_year}
                  </span>
                  <span className="text-[10px] bg-slate-800 px-3 py-1 rounded-lg text-slate-300 font-black uppercase">
                    {v.position_name}
                  </span>
                  <span className="text-xs font-black text-white uppercase">→ {v.candidate_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Admin link component: checks election_admins table ────────────────────────
function AdminLink({ userEmail, headAdminEmail }: { userEmail: string; headAdminEmail: string }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    if (userEmail === headAdminEmail) { setIsAdmin(true); return; }
    supabase
      .from('election_admins')
      .select('email')
      .eq('email', userEmail)
      .maybeSingle()
      .then(({ data }) => { if (data) setIsAdmin(true); });
  }, [userEmail]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-red-600 transition-all shadow-xl uppercase border border-white/10"
    >
      <Terminal size={13}/> Command Center
    </Link>
  );
}


      </div>
    </div>
  );
}
