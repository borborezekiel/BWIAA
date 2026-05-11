"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User, CreditCard, Activity, LogOut, CheckCircle2, Clock,
  XCircle, Sun, Moon, Monitor, ChevronDown, ChevronUp,
  Settings, Loader2, Receipt, Lock, Key, Calendar, MapPin, Plus,
  Download, Printer, Users, TrendingUp, Upload, X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const PRINT_STYLES = `
  @media print {
    body > * { display: none !important; }
    #member-id-card-wrapper { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
    #member-id-card { margin: 40px auto; }
  }
`;

interface Member {
  id: string; auth_user_id: string; full_name: string; email: string;
  phone: string|null; class_name: string; year_graduated: number;
  sponsor_name: string; principal_name: string; id_number: string;
  chapter: string; chapter_locked: boolean; photo_url: string|null;
  status: string; theme: string; approved_by: string|null;
  approved_at: string|null; created_at: string;
}
interface DuesPayment {
  id: string; amount: number; currency: string; period: string;
  payment_method: string; status: string; created_at: string;
  screenshot_url: string|null; notes: string|null;
  dues_amount: number; maintenance_fee: number;
}
interface ActivityEntry { id: string; action: string; details: string|null; created_at: string; }
interface Event {
  id: string; title: string; description: string|null;
  chapter: string; event_date: string; event_time: string|null;
  location: string|null; created_by: string; created_at: string;
}
interface Attendance {
  id: string; event_id: string; member_id: string;
  status: 'present'|'absent'|'excused'; note: string|null; created_at: string;
}

const STATUS_CFG: Record<string,{label:string;color:string;bg:string;border:string}> = {
  pending:  {label:'Pending Approval',color:'text-yellow-700',bg:'bg-yellow-50',border:'border-yellow-200'},
  approved: {label:'Active Member',   color:'text-green-700', bg:'bg-green-50', border:'border-green-200'},
  rejected: {label:'Not Approved',    color:'text-red-700',   bg:'bg-red-50',   border:'border-red-200'},
};
const DUES_STATUS: Record<string,{label:string;color:string}> = {
  pending:  {label:'Pending',  color:'text-yellow-600'},
  approved: {label:'Approved', color:'text-green-600'},
  rejected: {label:'Rejected', color:'text-red-600'},
};

export default function MemberDashboard() {
  const router = useRouter();
  const [member, setMember]           = useState<Member|null>(null);
  const [dues, setDues]               = useState<DuesPayment[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<'overview'|'dues'|'activity'|'events'|'id-card'|'settings'>('overview');
  const [theme, setTheme]             = useState('system');
  const [isDark, setIsDark]           = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [expandedDues, setExpandedDues] = useState<string|null>(null);
  const [events, setEvents]           = useState<Event[]>([]);
  const [attendance, setAttendance]   = useState<Attendance[]>([]);
  const [chapterAttendance, setChapterAtt] = useState<{member_name:string;event_title:string;event_date:string;status:string}[]>([]);
  const [orgName, setOrgName]         = useState('BWIAA');

  // Password change
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg]                     = useState('');
  const [pwLoading, setPwLoading]             = useState(false);

  // ── Profile edit state ────────────────────────────────────────────────────
  const [profileName, setProfileName]               = useState('');
  const [profilePhone, setProfilePhone]             = useState('');
  const [profileClassName, setProfileClassName]     = useState('');
  const [profileYearGrad, setProfileYearGrad]       = useState('');
  const [profileSponsor, setProfileSponsor]         = useState('');
  const [profilePrincipal, setProfilePrincipal]     = useState('');
  const [profilePhotoFile, setProfilePhotoFile]     = useState<File|null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string|null>(null);
  const [profileMsg, setProfileMsg]                 = useState('');
  const [profileSaving, setProfileSaving]           = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(theme === 'dark' || (theme === 'system' && prefersDark));
  }, [theme]);

  const bg      = isDark ? 'bg-slate-950' : 'bg-slate-50';
  const card    = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const text    = isDark ? 'text-white' : 'text-slate-900';
  const subtext = isDark ? 'text-white/40' : 'text-slate-400';
  const divider = isDark ? 'border-slate-800' : 'border-slate-100';
  const inputCls = isDark
    ? 'bg-slate-800 border-slate-700 text-white placeholder-white/30 focus:border-red-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-red-600';

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/members/login'); return; }

      const { data: settings } = await supabase.from('election_settings').select('*');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }

      // Two-step lookup — auth_user_id first, email fallback
      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (m1) {
        mem = m1;
      } else {
        const { data: m2 } = await supabase.from('members').select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) {
          mem = m2;
          if (!m2.auth_user_id) await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
        }
      }
      if (!mem) { router.push('/members/register'); return; }

      setMember(mem);
      setTheme(mem.theme ?? 'system');
      // ── Initialize profile fields ──────────────────────────────────────────
      setProfileName(mem.full_name ?? '');
      setProfilePhone(mem.phone ?? '');
      setProfileClassName(mem.class_name ?? '');
      setProfileYearGrad(mem.year_graduated ? String(mem.year_graduated) : '');
      setProfileSponsor(mem.sponsor_name ?? '');
      setProfilePrincipal(mem.principal_name ?? '');

      const { data: d } = await supabase.from('dues_payments')
        .select('*').eq('member_id', mem.id).order('created_at', { ascending: false });
      if (d) setDues(d);

      const { data: a } = await supabase.from('activity_log')
        .select('*').eq('member_id', mem.id).order('created_at', { ascending: false }).limit(30);
      if (a) setActivity(a);

      const { data: chAtt } = await supabase.from('attendance')
        .select('status, note, created_at, events(title, event_date, chapter), members(full_name)')
        .eq('events.chapter', mem.chapter).order('created_at', { ascending: false }).limit(100);
      if (chAtt) {
        setChapterAtt(chAtt.map((a: any) => ({
          member_name: a.members?.full_name ?? 'Unknown',
          event_title: a.events?.title ?? 'Unknown Event',
          event_date:  a.events?.event_date ?? '',
          status:      a.status,
        })));
      }

      const { data: evs } = await supabase.from('events')
        .select('*').eq('chapter', mem.chapter).order('event_date', { ascending: false });
      if (evs) setEvents(evs);

      const { data: att } = await supabase.from('attendance').select('*').eq('member_id', mem.id);
      if (att) setAttendance(att);

      setLoading(false);
    })();
  }, []);

  async function saveTheme(t: string) {
    setTheme(t);
    if (!member) return;
    setSavingTheme(true);
    await supabase.from('members').update({ theme: t }).eq('id', member.id);
    setMember(prev => prev ? {...prev, theme: t} : prev);
    setSavingTheme(false);
  }

  // ── Profile photo compress & select ───────────────────────────────────────
  async function handleProfilePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const compressed = await new Promise<File>((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 500; let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b], 'photo.jpg', {type:'image/jpeg'})) : reject(), 'image/jpeg', 0.85);
      }; img.onerror = reject; img.src = url;
    });
    setProfilePhotoFile(compressed);
    setProfilePhotoPreview(URL.createObjectURL(compressed));
  }

  // ── Save profile ──────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!member) return;
    if (!profileName.trim())                                          { setProfileMsg('Name cannot be empty.'); return; }
    if (profileYearGrad && isNaN(parseInt(profileYearGrad)))          { setProfileMsg('Year graduated must be a number.'); return; }
    setProfileSaving(true); setProfileMsg('');
    try {
      let photo_url = member.photo_url;

      if (profilePhotoFile) {
        // ── Delete old photo first to save storage ─────────────────────────
        if (member.photo_url) {
          try {
            // Extract the storage path from the full URL
            const urlParts = member.photo_url.split('/candidate-photos/');
            if (urlParts.length > 1) {
              const oldPath = decodeURIComponent(urlParts[1].split('?')[0]);
              await supabase.storage.from('candidate-photos').remove([oldPath]);
            }
          } catch {} // deletion failure is non-critical — still upload new
        }
        // Upload new photo
        const fileName = `members/${member.id}_${Date.now()}.jpg`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('candidate-photos').upload(fileName, profilePhotoFile, { upsert: true });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(upData.path).data.publicUrl;
      }

      const updates: any = {
        full_name:       profileName.trim(),
        phone:           profilePhone.trim()    || null,
        class_name:      profileClassName.trim()|| null,
        year_graduated:  profileYearGrad        ? parseInt(profileYearGrad) : null,
        sponsor_name:    profileSponsor.trim()  || null,
        principal_name:  profilePrincipal.trim()|| null,
        photo_url,
      };

      const { error } = await supabase.from('members').update(updates).eq('id', member.id);
      if (error) throw new Error(error.message);

      setMember(prev => prev ? { ...prev, ...updates } : prev);
      setProfilePhotoFile(null); setProfilePhotoPreview(null);

      await supabase.from('activity_log').insert([{
        member_id:   member.id,
        member_name: profileName.trim(),
        chapter:     member.chapter,
        action:      'Profile updated',
        details:     'Name, phone, class name, year, sponsor, principal or photo updated by member',
      }]);
      setProfileMsg('✓ Profile updated successfully!');
    } catch (e: any) {
      setProfileMsg(`Failed: ${e.message}`);
    } finally { setProfileSaving(false); }
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) { setPwMsg('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwMsg('Passwords do not match.'); return; }
    setPwLoading(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) { setPwMsg(`Failed: ${error.message}`); return; }
    setPwMsg('✓ Password updated successfully!');
    setNewPassword(''); setConfirmPassword('');
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/members');
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );
  if (!member) return null;

  const statusCfg  = STATUS_CFG[member.status] ?? STATUS_CFG['pending'];
  const totalDues  = dues.filter(d => d.status === 'approved').reduce((s,d) => s + d.amount, 0);
  const pendingDues = dues.filter(d => d.status === 'pending').length;

  return (
    <div className={`min-h-screen ${bg} pb-20 transition-colors duration-300`}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #member-id-card, #member-id-card * { visibility: visible !important; }
          #member-id-card { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); }
        }
      `}</style>
      <style>{PRINT_STYLES}</style>

      {/* Header */}
      <div className={`${card} border-b p-5 sticky top-0 z-30 shadow-sm transition-colors`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
              {member.photo_url
                ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                : <div className="w-full h-full flex items-center justify-center bg-red-600">
                    <span className="text-white font-black text-sm">{member.full_name.charAt(0)}</span>
                  </div>}
            </div>
            <div>
              <p className={`font-black ${text} text-sm uppercase leading-tight`}>{member.full_name}</p>
              <p className={`text-[10px] font-bold ${subtext} uppercase tracking-widest`}>{member.chapter}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden md:inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
              {member.status==='approved'?<CheckCircle2 size={10}/>:member.status==='pending'?<Clock size={10}/>:<XCircle size={10}/>}
              {statusCfg.label}
            </span>
            <Link href="/members" className={`${subtext} hover:text-red-600 text-xs font-black uppercase tracking-widest hidden md:block transition-all`}>Directory</Link>
            <button onClick={signOut} className="bg-red-50 hover:bg-red-100 text-red-500 p-2.5 rounded-xl transition-all border border-red-200">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </div>

      {member.status === 'pending' && (
        <div className="bg-yellow-500 text-yellow-950 text-center py-3 px-6 text-xs font-black uppercase tracking-widest">
          ⏳ Application pending approval by your chapter administrator
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Tabs */}
        <div className={`flex gap-1 ${card} border p-1 rounded-2xl mb-8 overflow-x-auto`}>
          {[
            {id:'overview', label:'Overview', icon:<User size={14}/>},
            {id:'dues',     label:'My Dues',  icon:<CreditCard size={14}/>},
            {id:'events',   label:'Events',   icon:<Calendar size={14}/>},
            {id:'activity', label:'Activity', icon:<Activity size={14}/>},
            {id:'id-card',  label:'ID Card',  icon:<CreditCard size={14}/>},
            {id:'settings', label:'Settings', icon:<Settings size={14}/>},
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-3 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all whitespace-nowrap flex-1 justify-center
                ${activeTab===t.id ? 'bg-red-600 text-white' : `${subtext} hover:text-red-600`}`}>
              {t.icon}<span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab==='overview' && (
          <div className="space-y-6">
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-200 shrink-0 border-2 border-slate-200">
                  {member.photo_url
                    ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                    : <div className="w-full h-full flex items-center justify-center bg-red-600">
                        <span className="text-4xl font-black text-white">{member.full_name.charAt(0)}</span>
                      </div>}
                </div>
                <div className="flex-1">
                  <h2 className={`text-3xl font-black uppercase italic ${text}`}>{member.full_name}</h2>
                  <p className="text-red-600 font-black text-sm uppercase mt-1">{member.chapter}</p>
                  <p className={`${subtext} font-bold text-xs mt-1`}>{member.class_name} · Class of {member.year_graduated}</p>
                  <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full border text-xs font-black uppercase ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
                    {member.status==='approved'?<CheckCircle2 size={12}/>:member.status==='pending'?<Clock size={12}/>:<XCircle size={12}/>}
                    {statusCfg.label}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {label:'Total Paid',    value:`$${totalDues.toLocaleString()}`, color:'bg-green-600'},
                {label:'Pending Dues',  value:String(pendingDues),              color:'bg-yellow-500'},
                {label:'Activities',    value:String(activity.length),          color:'bg-blue-600'},
                {label:'Member Since',  value:new Date(member.created_at).getFullYear().toString(), color:'bg-slate-700'},
              ].map(s => (
                <div key={s.label} className={`${s.color} text-white rounded-3xl p-5 text-center shadow`}>
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h3 className={`font-black ${text} uppercase italic text-lg mb-6`}>Member Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ['Member ID',    member.id.slice(0,8).toUpperCase()],
                  ['Email',        member.email],
                  ['Phone',        member.phone ?? '—'],
                  ['ID Number',    member.id_number],
                  ['Class Sponsor',member.sponsor_name],
                  ['Principal',    member.principal_name],
                  ['Chapter',      member.chapter + (member.chapter_locked ? ' 🔒' : '')],
                  ['Approved By',  member.approved_by ?? 'Pending'],
                ].map(([l,v]) => (
                  <div key={l} className={`${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl p-4`}>
                    <p className={`text-[10px] font-black ${subtext} uppercase tracking-widest mb-1`}>{l}</p>
                    <p className={`font-black ${text} text-sm`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {member.status === 'approved' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {href:'/dues',        label:'Pay Dues',   icon:<CreditCard size={20}/>, color:'bg-green-600'},
                  {href:'/donations',   label:'Donations',  icon:<Plus size={20}/>,       color:'bg-red-600'},
                  {href:'/contributions',label:'Solidarity', icon:<Users size={20}/>,     color:'bg-blue-600'},
                ].map(({href,label,icon,color}) => (
                  <Link key={href} href={href} className={`flex items-center gap-4 ${card} border rounded-3xl p-6 hover:border-red-400 transition-all shadow-sm`}>
                    <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center shrink-0`}>{icon}</div>
                    <div><p className={`font-black ${text} uppercase`}>{label}</p></div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DUES ── */}
        {activeTab==='dues' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className={`font-black ${text} uppercase italic text-xl`}>My Dues History</h3>
              <Link href="/dues" className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-3 rounded-2xl transition-all">+ Submit Payment</Link>
            </div>
            {dues.length === 0 ? (
              <div className={`${card} border rounded-3xl p-16 text-center shadow-sm`}>
                <CreditCard size={48} className={`mx-auto mb-4 ${subtext} opacity-30`}/>
                <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No dues payments yet</p>
              </div>
            ) : dues.map(d => {
              const cfg   = DUES_STATUS[d.status] ?? DUES_STATUS['pending'];
              const isOpen = expandedDues === d.id;
              const duesAmt = d.dues_amount || (d.amount - (d.maintenance_fee || 0));
              const mFee  = d.maintenance_fee || 0;
              return (
                <div key={d.id} className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
                  <button onClick={() => setExpandedDues(isOpen?null:d.id)}
                    className={`w-full flex items-center gap-4 p-5 text-left hover:${isDark?'bg-white/5':'bg-slate-50'} transition-all`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-black ${text}`}>{d.period}</p>
                      <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</p>
                      <p className={`text-[10px] ${subtext} font-bold`}>{new Date(d.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-black text-xl ${text}`}>{d.amount.toLocaleString()} <span className="text-xs font-bold text-slate-400">{d.currency}</span></p>
                      {mFee > 0 && <p className="text-[10px] text-amber-600 font-bold">{duesAmt} dues + {mFee} maint.</p>}
                    </div>
                    {isOpen?<ChevronUp size={14} className={`${subtext} shrink-0`}/>:<ChevronDown size={14} className={`${subtext} shrink-0`}/>}
                  </button>
                  {isOpen && (
                    <div className={`border-t ${divider} p-5 ${isDark?'bg-white/5':'bg-slate-50'} space-y-3`}>
                      <div className={`bg-white border border-slate-100 rounded-2xl p-4 space-y-2`}>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Breakdown</p>
                        <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Dues Amount</span><span className="font-black text-slate-800">{duesAmt.toLocaleString()} {d.currency}</span></div>
                        {mFee > 0 && <div className="flex justify-between text-xs"><span className="text-amber-600 font-bold">Maintenance Fee</span><span className="font-black text-amber-600">{mFee} {d.currency}</span></div>}
                        <div className="flex justify-between text-xs border-t border-slate-100 pt-2"><span className="font-black text-slate-700">Total Paid</span><span className="font-black text-green-700">{d.amount.toLocaleString()} {d.currency}</span></div>
                      </div>
                      <p className={`text-xs font-bold ${subtext}`}>{d.payment_method==='in_person'?'In Person':'Screenshot/Transfer'}</p>
                      {d.notes && <p className={`text-sm font-bold ${text} italic`}>"{d.notes}"</p>}
                      {d.screenshot_url && (
                        <img src={d.screenshot_url} className="rounded-2xl max-h-40 cursor-pointer border border-slate-200"
                          alt="Proof" onClick={()=>window.open(d.screenshot_url!,'_blank')}/>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {activeTab==='activity' && (
          <div className="space-y-6">
            <div>
              <h3 className={`font-black ${text} uppercase italic text-lg mb-3`}>My Activity History</h3>
              {activity.length === 0 ? (
                <div className={`${card} border rounded-3xl p-12 text-center shadow-sm`}>
                  <Activity size={40} className={`mx-auto mb-3 ${subtext} opacity-30`}/>
                  <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No activity yet</p>
                </div>
              ) : (
                <div className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
                  {activity.map((a, i) => (
                    <div key={a.id} className={`flex items-start gap-4 p-4 ${i<activity.length-1?`border-b ${isDark?'border-slate-800':'border-slate-100'}`:''}`}>
                      <div className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0"/>
                      <div className="flex-1">
                        <p className={`font-black ${text} text-sm`}>{a.action}</p>
                        {a.details && <p className={`text-xs ${subtext} font-bold mt-0.5`}>{a.details}</p>}
                      </div>
                      <p className={`text-[10px] ${subtext} font-bold shrink-0`}>{new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className={`font-black ${text} uppercase italic text-lg mb-3 flex items-center gap-2`}>
                <Users size={16} className="text-red-500"/> Chapter Attendance Records
              </h3>
              {chapterAttendance.length === 0 ? (
                <div className={`${card} border rounded-3xl p-12 text-center shadow-sm`}>
                  <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No attendance records yet</p>
                </div>
              ) : (
                <div className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
                  <div className={`grid grid-cols-4 gap-2 px-5 py-3 ${isDark?'bg-white/5':'bg-slate-50'} border-b ${isDark?'border-slate-800':'border-slate-100'}`}>
                    {['Member','Event','Date','Status'].map(h => <p key={h} className={`text-[10px] font-black uppercase tracking-widest ${subtext}`}>{h}</p>)}
                  </div>
                  {chapterAttendance.map((a, i) => {
                    const statusColors: Record<string,string> = { present:'text-green-600', absent:'text-red-500', excused:'text-yellow-600' };
                    return (
                      <div key={i} className={`grid grid-cols-4 gap-2 px-5 py-3 ${i<chapterAttendance.length-1?`border-b ${isDark?'border-slate-800':'border-slate-100'}`:''}`}>
                        <p className={`text-xs font-black ${text} truncate`}>{a.member_name}</p>
                        <p className={`text-xs font-bold ${subtext} truncate`}>{a.event_title}</p>
                        <p className={`text-xs font-bold ${subtext}`}>{a.event_date?new Date(a.event_date).toLocaleDateString():'—'}</p>
                        <p className={`text-xs font-black uppercase ${statusColors[a.status]??subtext}`}>{a.status}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ID CARD ── */}
        {activeTab==='id-card' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className={`font-black ${text} uppercase italic text-xl`}>Your Member ID Card</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl transition-all">
                  <Printer size={14}/> Print Card
                </button>
              </div>
            </div>
            {member.status !== 'approved' && (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">
                <p className="text-yellow-800 font-black text-sm">⏳ ID card available after membership approval.</p>
              </div>
            )}
            <div className="flex justify-center">
              <div id="member-id-card" className="rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-200" style={{width:'380px'}}>
                <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-red-500 font-black text-[10px] uppercase tracking-widest">Official Member ID</p>
                    <p className="text-white font-black uppercase italic">{orgName}</p>
                  </div>
                  <div className={`font-black text-[10px] uppercase px-3 py-1.5 rounded-xl tracking-widest ${member.status==='approved'?'bg-green-500 text-white':'bg-yellow-500 text-yellow-900'}`}>
                    {member.status==='approved'?'✓ ACTIVE':'PENDING'}
                  </div>
                </div>
                <div className="bg-white p-6 flex gap-5 items-start">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
                    {member.photo_url
                      ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                      : <div className="w-full h-full bg-slate-200 flex items-center justify-center"><span className="text-3xl font-black text-slate-400">{member.full_name.charAt(0)}</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 text-base uppercase leading-tight">{member.full_name}</p>
                    <p className="text-red-600 font-bold text-xs uppercase tracking-widest mt-1">{member.chapter}</p>
                    <div className="mt-3 space-y-1.5">
                      {[['Class',member.class_name+' · Class of '+member.year_graduated],['ID No.',member.id_number],['Member',member.id.slice(0,8).toUpperCase()]].map(([l,v])=>(
                        <div key={l} className="flex gap-2"><span className="text-[10px] text-slate-400 font-bold uppercase w-16 shrink-0">{l}</span><span className="text-[10px] text-slate-800 font-black font-mono">{v}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-between items-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Issued {new Date(member.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                  <div className="flex gap-px items-end">
                    {member.id.slice(0,16).split('').map((c:string,i:number)=>(
                      <div key={i} className="bg-slate-700 rounded-sm" style={{width:'2px',height:`${(parseInt(c,16)%3+1)*7}px`}}/>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── EVENTS ── */}
        {activeTab==='events' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className={`font-black ${text} uppercase italic text-xl`}>Chapter Events</h3>
              <span className={`text-xs font-bold ${subtext} uppercase tracking-widest`}>{member.chapter}</span>
            </div>
            {events.length === 0 ? (
              <div className={`${card} border rounded-3xl p-16 text-center shadow-sm`}>
                <Calendar size={48} className={`mx-auto mb-4 ${subtext} opacity-30`}/>
                <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No events scheduled</p>
              </div>
            ) : events.map(ev => {
              const myAtt = attendance.find(a => a.event_id === ev.id);
              const isPast = new Date(ev.event_date) < new Date();
              const STATUS_COLORS: Record<string,string> = { present:'bg-green-100 text-green-700 border-green-200', absent:'bg-red-100 text-red-700 border-red-200', excused:'bg-yellow-100 text-yellow-700 border-yellow-200' };
              return (
                <div key={ev.id} className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isPast?isDark?'bg-white/10 text-white/40':'bg-slate-100 text-slate-400':'bg-red-100 text-red-600'}`}>{isPast?'Past':'Upcoming'}</span>
                          {myAtt && <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_COLORS[myAtt.status]??''}`}>{myAtt.status}</span>}
                        </div>
                        <h4 className={`font-black ${text} text-base uppercase`}>{ev.title}</h4>
                        {ev.description && <p className={`text-xs ${subtext} font-bold mt-1 leading-relaxed`}>{ev.description}</p>}
                        <div className={`flex flex-wrap gap-3 mt-3 text-xs ${subtext} font-bold`}>
                          <span className="flex items-center gap-1"><Calendar size={11}/> {new Date(ev.event_date).toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'long',day:'numeric'})}</span>
                          {ev.event_time && <span>🕐 {ev.event_time}</span>}
                          {ev.location && <span className="flex items-center gap-1"><MapPin size={11}/> {ev.location}</span>}
                        </div>
                      </div>
                    </div>
                    {isPast && (
                      <div className={`mt-4 pt-4 border-t ${isDark?'border-white/10':'border-slate-100'}`}>
                        <p className={`text-[10px] font-black ${subtext} uppercase tracking-widest mb-2`}>Your Attendance</p>
                        {myAtt ? (
                          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase ${STATUS_COLORS[myAtt.status]??''}`}>
                            {myAtt.status==='present'?<CheckCircle2 size={12}/>:myAtt.status==='excused'?<Clock size={12}/>:<XCircle size={12}/>}
                            {myAtt.status==='present'?'You were present':myAtt.status==='excused'?'Excused absence':'Marked absent'}
                          </div>
                        ) : <p className={`text-xs ${subtext} font-bold italic`}>No attendance record — contact your administrator</p>}
                      </div>
                    )}
                    {!isPast && !myAtt && (
                      <div className={`mt-4 pt-4 border-t ${isDark?'border-white/10':'border-slate-100'}`}>
                        <p className={`text-[10px] font-black ${subtext} uppercase tracking-widest mb-2`}>Will you attend?</p>
                        <div className="flex gap-2">
                          {(['present','excused'] as const).map(status => (
                            <button key={status} onClick={async () => {
                              const { data } = await supabase.from('attendance').insert([{ event_id: ev.id, member_id: member.id, status }]).select().single();
                              if (data) {
                                setAttendance(prev => [...prev, data]);
                                await supabase.from('activity_log').insert([{ member_id: member.id, member_name: member.full_name, chapter: member.chapter, action: `RSVP: ${status==='present'?'Attending':'Excused'} — ${ev.title}`, details: ev.event_date }]);
                              }
                            }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${status==='present'?'bg-green-600 hover:bg-green-700 text-white border-green-600':'border-slate-200 hover:border-yellow-400 text-slate-600 hover:text-yellow-700'}`}>
                              {status==='present'?'✓ Attending':'~ Excuse'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab==='settings' && (
          <div className="space-y-6">
            <h3 className={`font-black ${text} uppercase italic text-xl`}>Account Settings</h3>

            {/* ── Edit Profile ── */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-1 flex items-center gap-2`}>
                <User size={16} className="text-red-600"/> Edit Profile
              </h4>
              <p className={`text-xs ${subtext} font-bold mb-5`}>Update your display name, phone number and profile photo.</p>
              <div className="space-y-4">
                {/* Photo */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-3`}>Profile Photo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 shrink-0 border-2 border-slate-200">
                      {profilePhotoPreview
                        ? <img src={profilePhotoPreview} className="w-full h-full object-cover" alt="Preview"/>
                        : member.photo_url
                          ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                          : <div className="w-full h-full flex items-center justify-center bg-red-600">
                              <span className="text-white font-black text-2xl">{member.full_name.charAt(0)}</span>
                            </div>}
                    </div>
                    <label className="flex-1 cursor-pointer flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-4 transition-all">
                      <Upload size={18} className="text-slate-400 shrink-0"/>
                      <span className="text-sm font-bold text-slate-500">{profilePhotoFile ? profilePhotoFile.name : 'Click to change photo'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoSelect}/>
                    </label>
                    {profilePhotoPreview && (
                      <button onClick={() => { setProfilePhotoFile(null); setProfilePhotoPreview(null); }}
                        className="text-red-400 hover:text-red-600 p-1 shrink-0"><X size={16}/></button>
                    )}
                  </div>
                </div>
                {/* Name */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Full Name</label>
                  <input value={profileName} onChange={e => setProfileName(e.target.value)}
                    placeholder="Your full name"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {/* Phone */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Phone Number</label>
                  <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                    placeholder="+231 xxx xxx xxxx"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {/* Class Name */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Class Name</label>
                  <input value={profileClassName} onChange={e => setProfileClassName(e.target.value)}
                    placeholder="e.g. Eagles, Tigers, Lions"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {/* Year Graduated */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Year Graduated</label>
                  <input value={profileYearGrad} onChange={e => setProfileYearGrad(e.target.value)}
                    placeholder="e.g. 2005" type="number" min="1950" max="2099"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {/* Sponsor */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Class Sponsor Name</label>
                  <input value={profileSponsor} onChange={e => setProfileSponsor(e.target.value)}
                    placeholder="Sponsor's full name"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {/* Principal */}
                <div>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Principal Name</label>
                  <input value={profilePrincipal} onChange={e => setProfilePrincipal(e.target.value)}
                    placeholder="Principal's full name"
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
                {profileMsg && (
                  <p className={`text-xs font-bold ${profileMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{profileMsg}</p>
                )}
                <button onClick={saveProfile} disabled={profileSaving}
                  className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all disabled:opacity-50 flex items-center gap-2">
                  {profileSaving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                  Save Profile
                </button>
              </div>
            </div>

            {/* Theme */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-1`}>Display Theme</h4>
              <p className={`text-xs ${subtext} font-bold mb-5`}>Choose how the portal looks for you</p>
              <div className="grid grid-cols-3 gap-3">
                {[{k:'light',l:'Light',i:<Sun size={20}/>},{k:'dark',l:'Dark',i:<Moon size={20}/>},{k:'system',l:'System',i:<Monitor size={20}/>}].map(t => (
                  <button key={t.k} onClick={() => saveTheme(t.k)}
                    className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all ${theme===t.k?'border-red-600 bg-red-50':isDark?'border-slate-700 hover:border-slate-500':'border-slate-200 hover:border-slate-300'}`}>
                    <span className={theme===t.k?'text-red-600':subtext}>{t.i}</span>
                    <span className={`font-black text-xs uppercase tracking-widest ${theme===t.k?'text-red-700':subtext}`}>{t.l}</span>
                    {theme===t.k && <span className="text-[10px] text-red-500 font-black">✓ Active</span>}
                  </button>
                ))}
              </div>
              {savingTheme && <p className={`text-xs ${subtext} font-bold mt-3 text-center`}>Saving...</p>}
            </div>

            {/* Change Password */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-1 flex items-center gap-2`}>
                <Key size={16} className="text-red-600"/> Change Password
              </h4>
              <p className={`text-xs ${subtext} font-bold mb-5`}>Must be at least 8 characters.</p>
              <div className="space-y-4">
                {[
                  {l:'New Password',     v:newPassword,     s:setNewPassword,     ph:'Min 8 characters'},
                  {l:'Confirm Password', v:confirmPassword, s:setConfirmPassword, ph:'Repeat new password'},
                ].map(({l,v,s,ph}) => (
                  <div key={l}>
                    <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>{l}</label>
                    <input type="password" value={v} onChange={e=>s(e.target.value)} placeholder={ph}
                      className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                  </div>
                ))}
                {pwMsg && <p className={`text-xs font-bold ${pwMsg.startsWith('✓')?'text-green-600':'text-red-600'}`}>{pwMsg}</p>}
                <button onClick={changePassword} disabled={pwLoading}
                  className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all disabled:opacity-50 flex items-center gap-2">
                  {pwLoading?<Loader2 size={14} className="animate-spin"/>:<Lock size={14}/>}
                  Update Password
                </button>
              </div>
            </div>

            {/* Chapter */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-2`}>Chapter Assignment</h4>
              <div className={`flex items-center justify-between p-4 ${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl`}>
                <div><p className={`font-black ${text}`}>{member.chapter}</p><p className={`text-xs ${subtext} font-bold mt-0.5`}>Your permanent chapter</p></div>
                <div className={`${isDark?'bg-white/10 text-white/40':'bg-slate-200 text-slate-500'} text-[10px] font-black uppercase px-3 py-1.5 rounded-xl tracking-widest`}>🔒 Locked</div>
              </div>
              <p className={`text-xs ${subtext} font-bold mt-3`}>Contact your chapter administrator to request a transfer.</p>
            </div>

            {/* Sign out */}
            <div className={`${isDark?'bg-red-950/30 border-red-900':'bg-red-50 border-red-200'} border-2 rounded-[2.5rem] p-8`}>
              <h4 className="font-black text-red-600 uppercase tracking-widest text-sm mb-3">Sign Out</h4>
              <button onClick={signOut} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all">
                <LogOut size={14}/> Sign Out of Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
