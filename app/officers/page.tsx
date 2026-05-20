"use client";

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Shield, Star, BookOpen, DollarSign, Users, FileText, Scale, Heart, Crown } from 'lucide-react';
import Link from 'next/link';

interface Officer {
  id: string; position_name: string; member_name: string;
  member_photo_url: string | null; chapter: string;
  election_year: number; term_start: string; term_end: string;
  role_description: string; is_active: boolean; member_id: string | null;
}

const POSITION_CONFIG: Record<string, { icon: ReactNode; color: string; bg: string; order: number }> = {
  'President':                        { icon: <Crown size={24}/>,    color: 'text-yellow-500', bg: 'bg-yellow-500',  order: 1 },
  'Vice President for Administration': { icon: <Shield size={24}/>,   color: 'text-blue-500',   bg: 'bg-blue-500',    order: 2 },
  'Vice President for Operations':     { icon: <Users size={24}/>,    color: 'text-green-500',  bg: 'bg-green-500',   order: 3 },
  'Financial Secretary':               { icon: <DollarSign size={24}/>,color: 'text-emerald-500',bg: 'bg-emerald-500', order: 4 },
  'Secretary General':                 { icon: <FileText size={24}/>, color: 'text-purple-500', bg: 'bg-purple-500',  order: 5 },
  'Parliamentarian':                   { icon: <Scale size={24}/>,    color: 'text-orange-500', bg: 'bg-orange-500',  order: 6 },
  'Treasurer':                         { icon: <BookOpen size={24}/>, color: 'text-red-500',    bg: 'bg-red-500',     order: 7 },
  'Chaplain':                          { icon: <Heart size={24}/>,    color: 'text-pink-500',   bg: 'bg-pink-500',    order: 8 },
};

export default function OfficersPage() {
  const [officers, setOfficers]   = useState<Officer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Officer | null>(null);
  const [orgName, setOrgName]     = useState('BWIAA');

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('key,value');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }
      const { data } = await supabase.from('elected_officers')
        .select('*').eq('is_active', true).order('election_year', { ascending: false });
      if (data) setOfficers(data);
      setLoading(false);
    })();
  }, []);

  const sorted = [...officers].sort((a, b) =>
    (POSITION_CONFIG[a.position_name]?.order ?? 99) - (POSITION_CONFIG[b.position_name]?.order ?? 99)
  );

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white font-black uppercase italic text-lg">{orgName} Elected Officers</h1>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
              {sorted[0]?.election_year ?? 2026} — {sorted[0]?.term_end ? new Date(sorted[0].term_end).getFullYear() : 2028} Term · Harbel Chapter
            </p>
          </div>
          <Link href="/" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Home</Link>
        </div>
      </div>

      {/* Officer detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Position badge */}
            <div className={`inline-flex items-center gap-2 ${POSITION_CONFIG[selected.position_name]?.bg ?? 'bg-slate-700'} text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-6`}>
              {POSITION_CONFIG[selected.position_name]?.icon}
              {selected.position_name}
            </div>

            {/* Photo + name */}
            <div className="flex items-center gap-5 mb-6">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-200 shrink-0 border-4 border-slate-100">
                {selected.member_photo_url
                  ? <img src={selected.member_photo_url} className="w-full h-full object-cover" alt={selected.member_name}/>
                  : <div className="w-full h-full flex items-center justify-center bg-red-600">
                      <span className="text-white font-black text-3xl">{selected.member_name.charAt(0)}</span>
                    </div>}
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase italic text-slate-900 leading-tight">{selected.member_name}</h2>
                <p className="text-red-600 font-bold text-xs uppercase tracking-widest mt-1">{selected.chapter}</p>
                <p className="text-slate-400 font-bold text-xs mt-1">
                  Term: {new Date(selected.term_start).toLocaleDateString('en-US',{month:'short',year:'numeric'})} — {new Date(selected.term_end).toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                </p>
              </div>
            </div>

            {/* Role description */}
            <div className="bg-slate-50 rounded-2xl p-5 mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role & Responsibilities</p>
              <p className="text-slate-700 font-bold text-sm leading-relaxed">{selected.role_description}</p>
            </div>

            {/* Duties list */}
            <div className="mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Key Duties</p>
              <div className="space-y-2">
                {getDuties(selected.position_name).map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${POSITION_CONFIG[selected.position_name]?.bg ?? 'bg-slate-400'}`}/>
                    <p className="text-slate-600 font-bold text-xs leading-relaxed">{d}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setSelected(null)}
              className="w-full bg-slate-900 text-white font-black uppercase py-4 rounded-2xl text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pt-8 space-y-8">
        {/* Hero banner */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-8 border border-white/5 text-center">
          <div className="flex justify-center gap-3 mb-4">
            {[...Array(5)].map((_, i) => <Star key={i} size={16} className="text-yellow-500 fill-yellow-500"/>)}
          </div>
          <h2 className="text-white font-black uppercase italic text-3xl md:text-4xl mb-2">
            Your Elected Leaders
          </h2>
          <p className="text-white/50 font-bold text-sm max-w-lg mx-auto leading-relaxed">
            These officers were elected by BWIAA members on {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} 
            and will serve a two-year term ending {sorted[0]?.term_end ? new Date(sorted[0].term_end).toLocaleDateString('en-US',{month:'long',year:'numeric'}) : '2028'}.
          </p>
          <p className="text-white/30 font-bold text-xs uppercase tracking-widest mt-4">
            Stronger Together · Tigers Forever 🐯
          </p>
        </div>

        {/* Officers grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {sorted.map(officer => {
            const cfg = POSITION_CONFIG[officer.position_name];
            return (
              <button key={officer.id} onClick={() => setSelected(officer)}
                className="bg-slate-900 border border-white/5 hover:border-white/20 rounded-[2rem] p-6 text-center transition-all hover:-translate-y-1 hover:shadow-2xl group">
                {/* Photo */}
                <div className="relative w-20 h-20 mx-auto mb-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-700">
                    {officer.member_photo_url
                      ? <img src={officer.member_photo_url} className="w-full h-full object-cover" alt={officer.member_name}/>
                      : <div className="w-full h-full flex items-center justify-center bg-red-600">
                          <span className="text-white font-black text-2xl">{officer.member_name.charAt(0)}</span>
                        </div>}
                  </div>
                  {/* Position icon badge */}
                  <div className={`absolute -bottom-2 -right-2 w-8 h-8 ${cfg?.bg ?? 'bg-slate-600'} rounded-xl flex items-center justify-center shadow-lg`}>
                    <span className="text-white scale-75">{cfg?.icon}</span>
                  </div>
                </div>

                <p className="text-white font-black text-sm uppercase leading-tight mb-1 group-hover:text-red-400 transition-all">
                  {officer.member_name}
                </p>
                <p className={`font-black text-[10px] uppercase tracking-widest ${cfg?.color ?? 'text-slate-400'}`}>
                  {officer.position_name}
                </p>
                <p className="text-white/30 text-[10px] font-bold mt-1">
                  Click for details
                </p>
              </button>
            );
          })}
        </div>

        {/* Term info */}
        <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-white font-black uppercase tracking-widest text-sm">2026 — 2028 BWIAA Executive Council</p>
            <p className="text-white/40 font-bold text-xs mt-1">Harbel Chapter · Elected {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
          </div>
          <div className="flex gap-3">
            <Link href="/history" className="border border-white/20 hover:border-white/40 text-white/60 hover:text-white font-black uppercase text-xs px-5 py-3 rounded-xl transition-all">
              Election History
            </Link>
            <Link href="/members" className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-3 rounded-xl transition-all">
              Member Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDuties(position: string): string[] {
  const duties: Record<string, string[]> = {
    'President': [
      'Preside over all general and executive meetings',
      'Represent BWIAA in all official capacities',
      'Sign official documents and correspondence',
      'Ensure decisions of the association are executed',
      'Appoint committees with approval of the executive council',
    ],
    'Vice President for Administration': [
      'Assist the President in administrative functions',
      'Oversee membership registration and records',
      'Act as President in their absence',
      'Coordinate internal governance and compliance',
      'Manage official correspondence and communications',
    ],
    'Vice President for Operations': [
      'Coordinate all chapter programs and activities',
      'Oversee day-to-day operational functions',
      'Liaise between chapters and the executive council',
      'Manage event planning and execution',
      'Ensure operational efficiency across the association',
    ],
    'Financial Secretary': [
      'Collect all dues, fees and levies from members',
      'Issue receipts for all payments received',
      'Maintain accurate financial records and ledgers',
      'Present financial reports at every meeting',
      'Work closely with the Treasurer on all transactions',
    ],
    'Secretary General': [
      'Record and keep minutes of all meetings',
      'Maintain all official records and documents',
      'Handle official correspondence of the association',
      'Give notice of all meetings to members',
      'Prepare agenda in consultation with the President',
    ],
    'Parliamentarian': [
      'Advise on parliamentary procedure and rules of order',
      'Interpret the BWIAA constitution and bylaws',
      'Ensure meetings are conducted properly',
      'Rule on points of order when raised',
      'Guide the association on constitutional matters',
    ],
    'Treasurer': [
      'Receive and safeguard all funds of the association',
      'Make authorised payments on behalf of BWIAA',
      'Prepare and present the annual budget',
      'Maintain bank accounts and financial records',
      'Provide quarterly financial accountability reports',
    ],
    'Chaplain': [
      'Open and close all meetings with prayer',
      'Provide spiritual guidance and support to members',
      'Lead devotional activities at events',
      'Visit sick or bereaved members on behalf of BWIAA',
      'Foster a spirit of brotherhood and unity',
    ],
  };
  return duties[position] ?? ['Perform duties as assigned by the executive council.'];
}
