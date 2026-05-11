"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { XCircle, LogOut, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function RejectedPage() {
  const router  = useRouter();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/members/login'); return; }

      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('id,full_name,email,chapter,status,rejection_reason,created_at')
        .eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; }
      else {
        const { data: m2 } = await supabase.from('members').select('id,full_name,email,chapter,status,rejection_reason,created_at')
          .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) mem = m2;
      }

      if (mem?.status === 'approved') { router.push('/members/dashboard'); return; }
      if (mem?.status === 'pending')  { router.push('/members/pending');   return; }
      if (!mem) { router.push('/members/register'); return; }

      setMember(mem);
      setLoading(false);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/members');
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl border-t-8 border-red-600">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle size={36} className="text-red-600"/>
        </div>
        <h1 className="text-2xl font-black uppercase italic text-slate-900 mb-2">
          Application Not Approved
        </h1>
        <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
          Your membership application was reviewed and could not be approved at this time.
        </p>

        {member && (
          <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Application Details</p>
            {[
              ['Name',    member.full_name],
              ['Chapter', member.chapter],
              ['Status',  'Not Approved'],
              ...(member.rejection_reason ? [['Reason', member.rejection_reason]] : []),
            ].map(([l,v]) => (
              <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                <span className={`text-xs font-black ${l==='Status'?'text-red-600':'text-slate-800'} text-right max-w-[60%]`}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-left">
          <p className="text-red-800 font-black text-xs uppercase tracking-widest mb-2">What you can do</p>
          <p className="text-red-700 text-xs font-bold leading-relaxed">
            Contact your chapter administrator directly to understand the decision and whether you may reapply.
            Ensure your registration details, payment and supporting information are complete and accurate.
          </p>
        </div>

        <button onClick={signOut}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-2xl text-sm transition-all">
          <LogOut size={14}/> Sign Out
        </button>
      </div>
    </div>
  );
}
