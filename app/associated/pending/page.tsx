"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, LogOut, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AssociatedPending() {
  const router = useRouter();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/associated/register'); return; }
      const { data } = await supabase.from('associated_members').select('*').eq('email', user.email?.toLowerCase()??'').maybeSingle();
      if (data?.status === 'approved') { router.push('/associated/dashboard'); return; }
      if (data?.status === 'rejected') { router.push('/associated/rejected'); return; }
      if (data) setMember(data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={48}/></div>;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6"><Clock size={36} className="text-yellow-600"/></div>
        <h1 className="text-2xl font-black uppercase italic text-slate-900 mb-2">Application Pending</h1>
        <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">Your associated membership application is under review. You will be contacted once a decision has been made.</p>
        {member && (
          <div className="bg-slate-50 rounded-2xl p-5 mb-6 text-left space-y-2">
            {([
              ['Name', member.full_name],
              ['Email', member.email],
              ['Type', member.member_type],
              ['Status', 'Pending Review'],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                <span className="text-xs font-black text-slate-800">{v}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={async()=>{await supabase.auth.signOut();router.push('/');}}
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase py-4 rounded-2xl text-sm transition-all">
          <LogOut size={14}/> Sign Out
        </button>
      </div>
    </div>
  );
}
