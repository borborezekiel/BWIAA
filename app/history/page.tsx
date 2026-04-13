"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface HistoryRecord {
  id: string; election_year: number; election_name: string;
  chapter: string; position_name: string; winner_name: string;
  winner_photo_url?: string; total_votes: number; winner_votes: number;
  archived_at: string;
}

const POSITION_ORDER = [
  "President", "Vice President for Administration", "Vice President for Operations",
  "Secretary General", "Financial Secretary", "Treasurer", "Parliamentarian", "Chaplain",
];

export default function HistoryPage() {
  const [records, setRecords]     = useState<HistoryRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [openYear, setOpenYear]   = useState<number | null>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('election_history').select('*').order('election_year', { ascending: false })
      .order('chapter').then(({ data }) => {
        if (data) setRecords(data);
        setLoading(false);
      });
  }, []);

  // Group: year → chapter → position
  const byYear = records.reduce<Record<number, Record<string, HistoryRecord[]>>>((acc, r) => {
    if (!acc[r.election_year]) acc[r.election_year] = {};
    if (!acc[r.election_year][r.chapter]) acc[r.election_year][r.chapter] = [];
    acc[r.election_year][r.chapter].push(r);
    return acc;
  }, {});

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-6 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Trophy size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">BWIAA Election History</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Official Record of All Past Elections</p>
            </div>
          </div>
          <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all">← Home</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-10 space-y-6">
        {years.length === 0 && (
          <div className="text-center py-24 text-white/30">
            <Trophy size={64} className="mx-auto mb-6 opacity-20"/>
            <p className="font-black uppercase tracking-widest text-lg">No election history yet.</p>
            <p className="text-sm font-bold mt-2 opacity-60">Results will appear here after each election is archived.</p>
          </div>
        )}

        {years.map(year => {
          const isYearOpen = openYear === year;
          const chapters = Object.keys(byYear[year]).sort();
          const totalWinners = Object.values(byYear[year]).flat().length;

          return (
            <div key={year} className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden">
              {/* Year header */}
              <button onClick={() => { setOpenYear(isYearOpen ? null : year); setOpenChapter(null); }}
                className="w-full flex items-center justify-between p-8 text-left hover:bg-white/5 transition-all">
                <div className="flex items-center gap-5">
                  <div className="bg-red-600 rounded-2xl p-4">
                    <Trophy size={28} className="text-white"/>
                  </div>
                  <div>
                    <h2 className="text-white text-3xl font-black uppercase italic">{year} Election</h2>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
                      {chapters.length} chapters • {totalWinners} winners recorded
                    </p>
                  </div>
                </div>
                {isYearOpen ? <ChevronUp size={24} className="text-white/40"/> : <ChevronDown size={24} className="text-white/40"/>}
              </button>

              {isYearOpen && (
                <div className="border-t border-white/10 p-6 space-y-4">
                  {chapters.map(chapter => {
                    const isChOpen = openChapter === `${year}-${chapter}`;
                    const chRecords = byYear[year][chapter].sort((a, b) =>
                      POSITION_ORDER.indexOf(a.position_name) - POSITION_ORDER.indexOf(b.position_name));

                    return (
                      <div key={chapter} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <button onClick={() => setOpenChapter(isChOpen ? null : `${year}-${chapter}`)}
                          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-all">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-red-500 rounded-full"/>
                            <p className="text-white font-black uppercase text-sm">{chapter}</p>
                            <span className="text-white/30 text-xs font-bold">{chRecords.length} positions</span>
                          </div>
                          {isChOpen ? <ChevronUp size={16} className="text-white/40"/> : <ChevronDown size={16} className="text-white/40"/>}
                        </button>

                        {isChOpen && (
                          <div className="border-t border-white/10 p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {chRecords.map(r => {
                                const pct = r.total_votes > 0 ? Math.round((r.winner_votes / r.total_votes) * 100) : 0;
                                return (
                                  <div key={r.id} className="bg-slate-900 rounded-2xl p-4 flex flex-col items-center text-center">
                                    {/* Winner photo */}
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-700 mb-3 border-2 border-yellow-500/30">
                                      {r.winner_photo_url
                                        ? <img src={r.winner_photo_url} alt={r.winner_name} className="w-full h-full object-cover"/>
                                        : <div className="w-full h-full flex items-center justify-center">
                                            <span className="text-2xl font-black text-slate-400">{r.winner_name.charAt(0)}</span>
                                          </div>
                                      }
                                    </div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <Trophy size={10} className="text-yellow-400"/>
                                      <p className="text-yellow-400 font-black text-[10px] uppercase tracking-widest">Winner</p>
                                    </div>
                                    <p className="text-white font-black text-sm uppercase leading-tight">{r.winner_name}</p>
                                    <p className="text-white/40 text-[10px] font-bold uppercase mt-1 leading-tight">{r.position_name}</p>
                                    <div className="mt-3 w-full bg-white/10 rounded-full h-1.5">
                                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }}/>
                                    </div>
                                    <p className="text-white/30 text-[10px] font-bold mt-1">{r.winner_votes} / {r.total_votes} votes ({pct}%)</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center mt-16">
        <p className="text-white/20 text-xs font-bold uppercase tracking-widest">BWIAA Official Election Archive — All Rights Reserved</p>
      </div>
    </div>
  );
}
