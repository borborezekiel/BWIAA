"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, LogOut, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PendingPage() {
  const router  = useRouter();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/members/login'); return; }

      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('id,full_name,email,chapter,status,created_at')
        .eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; }
      else {
        const { data: m2 } = await supabase.from('members').select('id,full_name,email,chapter,status,created_at')
          .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) mem = m2;
      }

      // If approved — send to dashboard
      if (mem?.status === 'approved') { router.push('/members/dashboard'); return; }
      // If rejected — send to rejected page
      if (mem?.status === 'rejected') { router.push('/members/rejected'); return; }
      // If no record — send to register
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
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock size={36} className="text-yellow-600"/>
        </div>
        <h1 className="text-2xl font-black uppercase italic text-slate-900 mb-2">
          Application Pending
        </h1>
        <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">
          Your membership application is under review by your chapter administrator.
          You will be notified once a decision has been made.
        </p>

        {member && (
          <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Application</p>
            {[
              ['Name',      member.full_name],
              ['Email',     member.email],
              ['Chapter',   member.chapter],
              ['Submitted', new Date(member.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})],
              ['Status',    'Pending Review'],
            ].map(([l,v]) => (
              <div key={l} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                <span className={`text-xs font-black ${l==='Status'?'text-yellow-600':'text-slate-800'}`}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 text-left">
          <p className="text-yellow-800 font-black text-xs uppercase tracking-widest mb-1">What happens next?</p>
          <ul className="text-yellow-700 text-xs font-bold space-y-1 leading-relaxed list-none mt-2">
            <li className="flex items-start gap-2"><CheckCircle2 size={12} className="shrink-0 mt-0.5 text-yellow-600"/>Your administrator reviews your details and payment</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={12} className="shrink-0 mt-0.5 text-yellow-600"/>Once approved, you get full access to the member portal</li>
            <li className="flex items-start gap-2"><CheckCircle2 size={12} className="shrink-0 mt-0.5 text-yellow-600"/>Contact your chapter admin if you have questions</li>
          </ul>
        </div>

        <button onClick={signOut}
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm transition-all">
          <LogOut size={14}/> Sign Out
        </button>
      </div>
    </div>
  );
}
