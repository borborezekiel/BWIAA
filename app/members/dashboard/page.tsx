"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User, CreditCard, Activity, LogOut, CheckCircle2, Clock,
  XCircle, Sun, Moon, Monitor, ChevronDown, ChevronUp,
  Settings, Loader2, Lock, Key, Calendar, MapPin, Plus,
  Printer, Users, Upload, X, Globe, Bell, Send,
  Image, Share2, MessageCircle, MoreHorizontal, Pin, Trash2, Heart, Terminal, Crown, DollarSign, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Member {
  id: string; auth_user_id: string; full_name: string; email: string;
  phone: string|null; class_name: string; year_graduated: number;
  sponsor_name: string; principal_name: string; id_number: string;
  department: string | null;
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
interface Post {
  id: string; member_id: string; member_name: string;
  member_photo_url: string|null; chapter: string;
  content: string; photo_url: string|null;
  is_pinned: boolean; status: string; created_at: string;
  reactions?: Reaction[]; comments?: Comment[];
}
interface Reaction {
  id: string; post_id: string; member_id: string;
  member_name: string; reaction_type: string;
}
interface Comment {
  id: string; post_id: string; member_id: string; member_name: string;
  member_photo_url: string|null; chapter: string; content: string; created_at: string;
}
interface Notification {
  id: string; type: string; title: string;
  message: string|null; link: string|null;
  is_read: boolean; created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REACTIONS = [
  { type: 'like',  emoji: '👍', label: 'Like'  },
  { type: 'love',  emoji: '❤️', label: 'Love'  },
  { type: 'tiger', emoji: '🐯', label: 'Tiger' },
];

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function Avatar({ url, name, size=10 }: { url: string|null; name: string; size?: number }) {
  const sz = `w-${size} h-${size}`;
  return (
    <div className={`${sz} rounded-2xl overflow-hidden bg-slate-200 shrink-0`}>
      {url
        ? <img src={url} className="w-full h-full object-cover" alt={name}/>
        : <div className="w-full h-full flex items-center justify-center bg-red-600">
            <span className="text-white font-black text-sm">{name.charAt(0)}</span>
          </div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MemberDashboard() {
  const router = useRouter();
  const [member, setMember]           = useState<Member|null>(null);
  const [dues, setDues]               = useState<DuesPayment[]>([]);
  const [activity, setActivity]       = useState<ActivityEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<'feed'|'overview'|'dues'|'events'|'activity'|'id-card'|'people'|'settings'>('feed');
  const [theme, setTheme]             = useState('system');
  const [isDark, setIsDark]           = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [expandedDues, setExpandedDues] = useState<string|null>(null);
  const [events, setEvents]           = useState<Event[]>([]);
  const [attendance, setAttendance]   = useState<Attendance[]>([]);
  const [chapterAttendance, setChapterAtt] = useState<any[]>([]);
  const [orgName, setOrgName]         = useState('BWIAA');
  const [isAdmin, setIsAdmin]         = useState(false);

  // Feed state
  const [posts, setPosts]             = useState<Post[]>([]);
  const [postContent, setPostContent] = useState('');
  const [postPhoto, setPostPhoto]     = useState<File|null>(null);
  const [postPhotoPreview, setPostPhotoPreview] = useState<string|null>(null);
  const [posting, setPosting]         = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string,string>>({});
  const [submittingComment, setSubmittingComment] = useState<string|null>(null);
  const [openMenu, setOpenMenu]         = useState<string|null>(null);
  const [openShare, setOpenShare]       = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Session auth UID (for RLS-safe reactions/comments)
  const [sessionUid, setSessionUid] = useState('');
  // Portal locked
  const [portalLocked, setPortalLocked] = useState(false);
  const [lockedMessage, setLockedMessage] = useState('');
  // Officer role — any election_admins entry gets command center access
  const [officerRole, setOfficerRole] = useState('');

  // Feed settings (from admin)
  const [feedAllowPhotos,   setFeedAllowPhotos]   = useState(true);
  const [feedAllowVideos,   setFeedAllowVideos]   = useState(false);
  const [feedMaxPhotoMb,    setFeedMaxPhotoMb]    = useState(2);
  const [feedMaxVideoMb,    setFeedMaxVideoMb]    = useState(10);
  const [feedMaxPostLength, setFeedMaxPostLength] = useState(500);
  const [feedRequireApproval, setFeedRequireApproval] = useState(false);

  // People search
  const [allMembers,      setAllMembers]      = useState<{id:string;full_name:string;chapter:string;photo_url:string|null;phone:string|null;class_name:string;year_graduated:number|null;sponsor_name:string|null;principal_name:string|null;id_number:string|null;created_at:string}[]>([]);
  const [memberSearch,    setMemberSearch]    = useState('');
  const [selectedPerson,  setSelectedPerson]  = useState<typeof allMembers[0]|null>(null);

  // Notifications
  const [notifications, setNotifications]   = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs]         = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Password change
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg]                   = useState('');
  const [pwLoading, setPwLoading]           = useState(false);

  // Profile edit
  const [profileName, setProfileName]       = useState('');
  const [profilePhone, setProfilePhone]     = useState('');
  const [profileClassName, setProfileClassName] = useState('');
  const [profileYearGrad, setProfileYearGrad]   = useState('');
  const [profileSponsor, setProfileSponsor]     = useState('');
  const [profilePrincipal, setProfilePrincipal] = useState('');
  const [profileDepartment, setProfileDepartment] = useState('');
  const [profilePhotoFile, setProfilePhotoFile] = useState<File|null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string|null>(null);
  const [profileMsg, setProfileMsg]         = useState('');
  const [profileSaving, setProfileSaving]   = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(theme === 'dark' || (theme === 'system' && prefersDark));
  }, [theme]);

  const bg      = isDark ? 'bg-slate-950' : 'bg-slate-100';
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
        setPortalLocked(get('portal_locked') === 'true');
        if (get('portal_locked_message')) setLockedMessage(get('portal_locked_message'));
        const heads = get('head_admins');
        let headList = ['ezekielborbor17@gmail.com'];
        if (heads) { try { headList = JSON.parse(heads); } catch {} }
        if (headList.includes(user.email?.toLowerCase() ?? '')) setIsAdmin(true);
      }

      // Member lookup
      setSessionUid(user.id); // store for RLS-safe DB writes
      // Check if user is an officer/admin
      const { data: adminRec } = await supabase.from('election_admins').select('role').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
      if (adminRec?.role) setOfficerRole(adminRec.role);
      let mem: any = null;
      const { data: m1 } = await supabase.from('members').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; }
      else {
        const { data: m2 } = await supabase.from('members').select('*').eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) { mem = m2; if (!m2.auth_user_id) await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id); }
      }
      if (!mem) { router.push('/members/register'); return; }
      if (mem.status === 'pending')  { router.push('/members/pending');   return; }
      if (mem.status === 'rejected') { router.push('/members/rejected');  return; }

      setMember(mem); setTheme(mem.theme ?? 'system');
      setProfileName(mem.full_name ?? ''); setProfilePhone(mem.phone ?? '');
      setProfileClassName(mem.class_name ?? ''); setProfileYearGrad(mem.year_graduated ? String(mem.year_graduated) : '');
      setProfileSponsor(mem.sponsor_name ?? ''); setProfilePrincipal(mem.principal_name ?? ''); setProfileDepartment(mem.department ?? '');

      // Parallel data load
      const [
        { data: d }, { data: a },
        { data: chAtt }, { data: evs }, { data: att },
        { data: notifs }, { data: feedSettings }, { data: mems },
      ] = await Promise.all([
        supabase.from('dues_payments').select('*').eq('member_id', mem.id).order('created_at',{ascending:false}),
        supabase.from('activity_log').select('*').eq('member_id', mem.id).order('created_at',{ascending:false}).limit(30),
        supabase.from('attendance').select('status,note,created_at,events(title,event_date,chapter),members(full_name)').eq('events.chapter', mem.chapter).order('created_at',{ascending:false}).limit(100),
        supabase.from('events').select('*').eq('chapter', mem.chapter).order('event_date',{ascending:false}),
        supabase.from('attendance').select('*').eq('member_id', mem.id),
        supabase.from('notifications').select('*').eq('member_id', mem.id).order('created_at',{ascending:false}).limit(30),
        supabase.from('election_settings').select('key,value').in('key',['feed_allow_photos','feed_allow_videos','feed_max_photo_mb','feed_max_video_mb','feed_max_post_length','feed_require_approval']),
        supabase.from('members').select('id,full_name,chapter,photo_url,phone,class_name,year_graduated,sponsor_name,principal_name,id_number,department,created_at').eq('status','approved').order('full_name'),
      ]);
      if (d) setDues(d);
      if (a) setActivity(a);
      if (chAtt) setChapterAtt(chAtt.map((a: any) => ({ member_name: a.members?.full_name ?? 'Unknown', event_title: a.events?.title ?? 'Unknown', event_date: a.events?.event_date ?? '', status: a.status })));
      if (evs) setEvents(evs);
      if (att) setAttendance(att);
      if (notifs) setNotifications(notifs);
      if (feedSettings) {
        const get = (k: string) => feedSettings.find((r: any) => r.key === k)?.value;
        if (get('feed_allow_photos') !== undefined)    setFeedAllowPhotos(get('feed_allow_photos') !== 'false');
        if (get('feed_allow_videos') !== undefined)    setFeedAllowVideos(get('feed_allow_videos') === 'true');
        if (get('feed_max_photo_mb'))  setFeedMaxPhotoMb(Number(get('feed_max_photo_mb')));
        if (get('feed_max_video_mb'))  setFeedMaxVideoMb(Number(get('feed_max_video_mb')));
        if (get('feed_max_post_length')) setFeedMaxPostLength(Number(get('feed_max_post_length')));
        if (get('feed_require_approval') !== undefined) setFeedRequireApproval(get('feed_require_approval') === 'true');
      }
      if (mems) setAllMembers(mems);

      await loadPosts(user.id);
      setLoading(false);
    })();

    // Realtime feed
    const channel = supabase.channel('dashboard-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        supabase.auth.getUser().then(({ data: { user } }) => { if (user) loadPosts(user.id); });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_reactions' }, () => {
        supabase.auth.getUser().then(({ data: { user } }) => { if (user) loadPosts(user.id); });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'post_reactions' }, () => {
        supabase.auth.getUser().then(({ data: { user } }) => { if (user) loadPosts(user.id); });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, () => {
        supabase.auth.getUser().then(({ data: { user } }) => { if (user) loadPosts(user.id); });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadPosts(userId: string) {
    const { data: postsData } = await supabase.from('posts').select('*')
      .eq('status','approved').order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).limit(50);
    if (!postsData) return;
    const ids = postsData.map(p => p.id);
    const [{ data: rxns }, { data: cmts }] = await Promise.all([
      supabase.from('post_reactions').select('*').in('post_id', ids),
      supabase.from('post_comments').select('*').in('post_id', ids).order('created_at',{ascending:true}),
    ]);
    setPosts(postsData.map(p => ({
      ...p,
      reactions: (rxns ?? []).filter((r: any) => r.post_id === p.id),
      comments:  (cmts  ?? []).filter((c: any) => c.post_id === p.id),
    })));
  }

  async function compressImage(file: File, maxPx=1200): Promise<File> {
    return new Promise((resolve,reject) => {
      const img = new window.Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        let {width,height} = img;
        if (width>maxPx||height>maxPx) { if(width>height){height=Math.round(height*maxPx/width);width=maxPx;}else{width=Math.round(width*maxPx/height);height=maxPx;} }
        const c=document.createElement('canvas'); c.width=width; c.height=height;
        c.getContext('2d')!.drawImage(img,0,0,width,height); URL.revokeObjectURL(url);
        c.toBlob(b=>b?resolve(new File([b],'img.jpg',{type:'image/jpeg'})):reject(),'image/jpeg',0.88);
      }; img.onerror=reject; img.src=url;
    });
  }

  // ── Feed actions ─────────────────────────────────────────────────────────────
  const [postVideo, setPostVideo]               = useState<File|null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string|null>(null);
  const [postError, setPostError]               = useState('');
  const videoRef = useRef<HTMLInputElement>(null);

  async function submitPost() {
    if (!member || !postContent.trim()) return;
    if (postContent.length > feedMaxPostLength) { setPostError(`Post too long — max ${feedMaxPostLength} characters.`); return; }
    if (postPhoto && postPhoto.size > feedMaxPhotoMb * 1024 * 1024) { setPostError(`Photo too large — max ${feedMaxPhotoMb}MB.`); return; }
    if (postVideo && postVideo.size > feedMaxVideoMb * 1024 * 1024) { setPostError(`Video too large — max ${feedMaxVideoMb}MB.`); return; }
    setPosting(true); setPostError('');
    try {
      let photo_url: string|null = null;
      let video_url: string|null = null;

      if (postPhoto) {
        const fn = `posts/${member.id}_${Date.now()}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('candidate-photos').upload(fn, postPhoto, {upsert:true});
        if (ue) throw new Error(ue.message);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }
      if (postVideo) {
        const ext = postVideo.name.split('.').pop() ?? 'mp4';
        const fn = `posts/videos/${member.id}_${Date.now()}.${ext}`;
        const { data: ud, error: ue } = await supabase.storage.from('candidate-photos').upload(fn, postVideo, {upsert:true});
        if (ue) throw new Error(ue.message);
        video_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }

      const postStatus = feedRequireApproval ? 'pending' : 'approved';
      const { data: newPost } = await supabase.from('posts')
        .insert([{ member_id: member.id, member_name: member.full_name, member_photo_url: member.photo_url, chapter: member.chapter, content: postContent.trim(), photo_url, video_url, is_pinned: false, status: postStatus }])
        .select().single();

      setPostContent(''); setPostPhoto(null); setPostPhotoPreview(null); setPostVideo(null); setPostVideoPreview(null);

      if (newPost && postStatus === 'approved') {
        setPosts(prev => [{ ...newPost, reactions: [], comments: [] }, ...prev]);
      } else if (postStatus === 'pending') {
        setPostError('Post submitted — pending admin approval before it goes live.');
      }
    } catch (e: any) { setPostError(e.message); }
    finally { setPosting(false); }
  }

  async function toggleReaction(postId: string, reactionType: string) {
    if (!member) return;

    // Always get live session UID — never rely on stored member.id or auth_user_id
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (!sessionUser) return;
    const authId = sessionUser.id;

    const post = posts.find(p => p.id === postId);
    const existing = post?.reactions?.find(r => r.member_id === authId);

    // ── Optimistic local update ───────────────────────────────────────────────
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      let reactions = [...(p.reactions ?? [])];
      reactions = reactions.filter(r => r.member_id !== authId);
      if (!existing || existing.reaction_type !== reactionType) {
        reactions.push({ id: Date.now().toString(), post_id: postId, member_id: authId, member_name: member.full_name, reaction_type: reactionType });
      }
      return { ...p, reactions };
    }));

    // ── Persist to DB ─────────────────────────────────────────────────────────
    if (existing) {
      await supabase.from('post_reactions').delete().eq('post_id', postId).eq('member_id', authId);
      if (existing.reaction_type !== reactionType) {
        const { error } = await supabase.from('post_reactions')
          .insert([{ post_id: postId, member_id: authId, member_name: member.full_name, reaction_type: reactionType }]);
        if (error) { console.error('Reaction error:', error.message, error.code); await loadPosts(authId); }
      }
    } else {
      const { error } = await supabase.from('post_reactions')
        .insert([{ post_id: postId, member_id: authId, member_name: member.full_name, reaction_type: reactionType }]);
      if (error) { console.error('Reaction error:', error.message, error.code); await loadPosts(authId); }
    }
  }


  async function submitComment(postId: string) {
    if (!member || !commentText[postId]?.trim()) return;
    setSubmittingComment(postId);
    const commentContent = commentText[postId].trim();
    setCommentText(prev => ({...prev, [postId]: ''}));

    // Always get live session UID
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    if (!sessionUser) { setSubmittingComment(null); return; }

    const { data: newComment, error } = await supabase.from('post_comments')
      .insert([{ post_id: postId, member_id: sessionUser.id, member_name: member.full_name, member_photo_url: member.photo_url, chapter: member.chapter, content: commentContent }])
      .select().single();

    if (error) {
      console.error('Comment error:', error.message, error.code);
      // Restore comment text so user can retry
      setCommentText(prev => ({...prev, [postId]: commentContent}));
      setSubmittingComment(null);
      return;
    }

    if (newComment) {
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, comments: [...(p.comments ?? []), newComment] }
        : p
      ));
    }
    setSubmittingComment(null);
  }

  async function deletePost(postId: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  async function pinPost(postId: string, pinned: boolean) {
    await supabase.from('posts').update({ is_pinned: !pinned }).eq('id', postId);
    setPosts(prev => prev.map(p => p.id === postId ? {...p, is_pinned: !pinned} : p));
    setOpenMenu(null);
  }

  async function deleteComment(commentId: string, postId: string) {
    await supabase.from('post_comments').delete().eq('id', commentId);
    setPosts(prev => prev.map(p => p.id === postId ? {...p, comments: p.comments?.filter(c => c.id !== commentId)} : p));
  }

  async function markAllRead() {
    if (!member) return;
    await supabase.from('notifications').update({ is_read: true }).eq('member_id', member.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({...n, is_read: true})));
  }

  // ── Push Notifications ───────────────────────────────────────────────────────
  const [pushEnabled, setPushEnabled]   = useState(false);
  const [pushLoading, setPushLoading]   = useState(false);

  useEffect(() => {
    // Check if already subscribed
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setPushEnabled(!!sub);
      });
    });
  }, []);

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      console.error('SW registration failed:', e);
      return null;
    }
  }

  async function togglePushNotifications() {
    if (!member) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        // Unsubscribe
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: member.id, endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        // Subscribe
        const reg = await registerServiceWorker();
        if (!reg) throw new Error('Service worker not supported');

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notification permission denied');

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });

        const ua = navigator.userAgent;
        const deviceType = /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : 'Desktop';

        const res = await fetch('/api/push', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: member.id, subscription: sub.toJSON(), device_type: deviceType }),
        });
        if (!res.ok) throw new Error('Failed to save subscription');
        setPushEnabled(true);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPushLoading(false);
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // ── Profile actions ───────────────────────────────────────────────────────────
  async function handleProfilePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const c = await compressImage(file, 500);
    setProfilePhotoFile(c); setProfilePhotoPreview(URL.createObjectURL(c));
  }

  async function saveProfile() {
    if (!member || !profileName.trim()) { setProfileMsg('Name cannot be empty.'); return; }
    if (profileYearGrad && isNaN(parseInt(profileYearGrad))) { setProfileMsg('Year must be a number.'); return; }
    setProfileSaving(true); setProfileMsg('');
    try {
      let photo_url = member.photo_url;
      if (profilePhotoFile) {
        if (member.photo_url) {
          try { const p = decodeURIComponent(member.photo_url.split('/candidate-photos/')[1]?.split('?')[0]); await supabase.storage.from('candidate-photos').remove([p]); } catch {}
        }
        const fn = `members/${member.id}_${Date.now()}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('candidate-photos').upload(fn, profilePhotoFile, {upsert:true});
        if (ue) throw new Error(ue.message);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }
      const updates: any = { full_name: profileName.trim(), phone: profilePhone.trim()||null, class_name: profileClassName.trim()||null, year_graduated: profileYearGrad?parseInt(profileYearGrad):null, sponsor_name: profileSponsor.trim()||null, principal_name: profilePrincipal.trim()||null, department: profileDepartment||null, photo_url };
      const { error } = await supabase.from('members').update(updates).eq('id', member.id);
      if (error) throw new Error(error.message);
      setMember(prev => prev ? {...prev, ...updates} : prev);
      setProfilePhotoFile(null); setProfilePhotoPreview(null);
      await supabase.from('activity_log').insert([{ member_id: member.id, member_name: profileName.trim(), chapter: member.chapter, action: 'Profile updated', details: 'Name, phone, class, year, sponsor, principal or photo updated' }]);
      setProfileMsg('✓ Profile updated successfully!');
    } catch (e: any) { setProfileMsg(`Failed: ${e.message}`); }
    finally { setProfileSaving(false); }
  }

  async function saveTheme(t: string) {
    setTheme(t);
    if (!member) return;
    setSavingTheme(true);
    await supabase.from('members').update({ theme: t }).eq('id', member.id);
    setMember(prev => prev ? {...prev, theme: t} : prev);
    setSavingTheme(false);
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 8) { setPwMsg('Min 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwMsg('Passwords do not match.'); return; }
    setPwLoading(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) { setPwMsg(`Failed: ${error.message}`); return; }
    setPwMsg('✓ Password updated!'); setNewPassword(''); setConfirmPassword('');
  }

  async function signOut() { await supabase.auth.signOut(); router.push('/members'); }

  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );
  if (!member) return null;

  const statusCfg   = STATUS_CFG[member.status] ?? STATUS_CFG['pending'];
  const totalDues   = dues.filter(d => d.status === 'approved').reduce((s,d) => s+d.amount, 0);
  const pendingDues = dues.filter(d => d.status === 'pending').length;

  return (
    <div className={`min-h-screen ${bg} pb-20 transition-colors duration-300`}>
      <style>{`@media print { body * { visibility: hidden !important; } #member-id-card, #member-id-card * { visibility: visible !important; } #member-id-card { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); } }`}</style>

      {/* Header */}
      <div className={`${card} border-b p-4 sticky top-0 z-30 shadow-sm`}>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
              {member.photo_url
                ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/>
                : <div className="w-full h-full flex items-center justify-center bg-red-600"><span className="text-white font-black text-sm">{member.full_name.charAt(0)}</span></div>}
            </div>
            <div>
              <p className={`font-black ${text} text-sm uppercase leading-tight`}>{member.full_name}</p>
              <p className={`text-[10px] font-bold ${subtext} uppercase tracking-widest`}>{member.chapter}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Admin command center — visible to ALL officers and admins */}
            {(isAdmin || officerRole) && (
              <a href="/admin"
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${isDark?'bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white':'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200'}`}>
                <Terminal size={13}/>
                <span className="hidden sm:inline">{officerRole ? officerRole.replace(/_/g,' ') : 'Command'}</span>
              </a>
            )}

            {/* Directory button — always visible */}
            <button onClick={() => setActiveTab('people')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab==='people' ? 'bg-red-600 text-white' : isDark?'bg-white/10 text-white/60 hover:bg-white/20':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              <Users size={15}/>
              <span className="hidden sm:inline">Directory</span>
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button onClick={() => setShowNotifs(!showNotifs)}
                className={`relative p-2.5 rounded-xl transition-all ${showNotifs ? 'bg-red-600 text-white' : `${isDark?'bg-white/10 text-white/60 hover:bg-white/20':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}`}>
                <Bell size={18}/>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifs && (
                <div className={`absolute right-0 top-12 w-80 ${isDark?'bg-slate-900 border-slate-700':'bg-white border-slate-200'} border-2 rounded-3xl shadow-2xl z-50 overflow-hidden`}>
                  <div className={`flex items-center justify-between px-5 py-4 border-b ${divider}`}>
                    <p className={`font-black ${text} text-sm uppercase tracking-widest`}>Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-red-600 font-bold text-xs uppercase tracking-widest hover:underline">Mark all read</button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell size={32} className={`mx-auto mb-3 ${subtext} opacity-30`}/>
                        <p className={`font-bold ${subtext} text-xs uppercase tracking-widest`}>No notifications yet</p>
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} onClick={() => { if (n.link) router.push(n.link); setShowNotifs(false); }}
                        className={`flex items-start gap-3 px-5 py-4 border-b ${divider} cursor-pointer hover:${isDark?'bg-white/5':'bg-slate-50'} transition-all ${!n.is_read ? isDark?'bg-red-950/20':'bg-red-50/60' : ''}`}>
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-red-600'}`}/>
                        <div className="flex-1 min-w-0">
                          <p className={`font-black ${text} text-xs`}>{n.title}</p>
                          {n.message && <p className={`${subtext} text-xs font-bold mt-0.5 leading-relaxed`}>{n.message}</p>}
                          <p className={`${subtext} text-[10px] font-bold mt-1`}>{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={signOut} className={`p-2.5 rounded-xl ${isDark?'bg-white/10 text-white/60 hover:bg-red-600 hover:text-white':'bg-slate-100 text-slate-400 hover:text-red-600'} transition-all`}>
              <LogOut size={18}/>
            </button>
          </div>
        </div>
      </div>

      {/* Portal locked notice for non-admins */}
      {portalLocked && !isAdmin && (
        <div className="bg-amber-500 text-amber-950 px-6 py-3 text-center">
          <p className="font-black text-xs uppercase tracking-widest">⏸ {lockedMessage || 'The election portal is currently closed.'}</p>
        </div>
      )}
      {/* Portal locked notice for admins */}
      {portalLocked && isAdmin && (
        <div className="bg-slate-700 text-white px-6 py-2 text-center flex items-center justify-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest opacity-60">🔒 Portal is locked — members see a closed notice</span>
          <a href="/admin" className="text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-widest">Manage in Admin →</a>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Tabs */}
        <div className={`flex gap-1 ${card} border p-1 rounded-2xl mb-6 overflow-x-auto`}>
          {[
            {id:'feed',     label:'Feed',     icon:<Globe size={13}/>},
            {id:'overview', label:'Overview', icon:<User size={13}/>},
            {id:'dues',     label:'Dues',     icon:<CreditCard size={13}/>},
            {id:'events',   label:'Events',   icon:<Calendar size={13}/>},
            {id:'activity', label:'Activity', icon:<Activity size={13}/>},
            {id:'id-card',  label:'ID Card',  icon:<CreditCard size={13}/>},
            {id:'people',   label:'People',   icon:<Users size={13}/>},
            {id:'settings', label:'Settings', icon:<Settings size={13}/>},
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1 px-3 py-2.5 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all whitespace-nowrap flex-1 justify-center
                ${activeTab===t.id ? 'bg-red-600 text-white' : `${subtext} hover:text-red-600`}`}>
              {t.icon}<span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── FEED TAB ── */}
        {activeTab === 'feed' && (
          <div className="space-y-4">
            {/* Post composer */}
            <div className={`${card} border rounded-3xl p-5 shadow-sm`}>
              <div className="flex gap-3">
                <Avatar url={member.photo_url} name={member.full_name}/>
                <div className="flex-1">
                  <textarea value={postContent} onChange={e => { setPostContent(e.target.value); setPostError(''); }}
                    placeholder={`What's on your mind, ${member.full_name.split(' ')[0]}?`}
                    rows={3} maxLength={feedMaxPostLength}
                    className={`w-full resize-none outline-none font-bold text-sm placeholder-slate-400 leading-relaxed bg-transparent ${text}`}/>

                  {/* Character count */}
                  {postContent.length > feedMaxPostLength * 0.8 && (
                    <p className={`text-[10px] font-bold text-right mt-1 ${postContent.length >= feedMaxPostLength ? 'text-red-500' : 'text-slate-400'}`}>
                      {postContent.length}/{feedMaxPostLength}
                    </p>
                  )}

                  {/* Photo preview */}
                  {postPhotoPreview && (
                    <div className="relative mt-3 rounded-2xl overflow-hidden max-h-48">
                      <img src={postPhotoPreview} className="w-full object-cover" alt="Preview"/>
                      <button onClick={() => { setPostPhoto(null); setPostPhotoPreview(null); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><X size={14}/></button>
                    </div>
                  )}

                  {/* Video preview */}
                  {postVideoPreview && (
                    <div className="relative mt-3 rounded-2xl overflow-hidden">
                      <video src={postVideoPreview} controls className="w-full rounded-2xl max-h-48"/>
                      <button onClick={() => { setPostVideo(null); setPostVideoPreview(null); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><X size={14}/></button>
                    </div>
                  )}

                  {/* Error */}
                  {postError && <p className="text-xs text-red-500 font-bold mt-2">{postError}</p>}

                  <div className={`flex items-center justify-between mt-3 pt-3 border-t ${divider}`}>
                    <div className="flex items-center gap-3">
                      {feedAllowPhotos && (
                        <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 ${subtext} hover:text-red-600 font-bold text-xs uppercase tracking-widest transition-all`}>
                          <Image size={15}/> <span className="hidden sm:inline">Photo</span>
                        </button>
                      )}
                      {feedAllowVideos && (
                        <button onClick={() => videoRef.current?.click()} className={`flex items-center gap-1.5 ${subtext} hover:text-red-600 font-bold text-xs uppercase tracking-widest transition-all`}>
                          <span className="text-sm">🎬</span> <span className="hidden sm:inline">Video</span>
                        </button>
                      )}
                      {!feedAllowPhotos && !feedAllowVideos && (
                        <p className={`text-[10px] ${subtext} font-bold italic`}>Media uploads disabled by admin</p>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const c = await compressImage(file); setPostPhoto(c); setPostPhotoPreview(URL.createObjectURL(c));
                    }}/>
                    <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setPostVideo(file); setPostVideoPreview(URL.createObjectURL(file));
                    }}/>
                    <button onClick={submitPost} disabled={posting || !postContent.trim()}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-2.5 rounded-xl transition-all disabled:opacity-40">
                      {posting ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                      {posting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Posts */}
            {posts.length === 0 && (
              <div className={`${card} border rounded-3xl p-16 text-center shadow-sm`}>
                <Globe size={48} className={`mx-auto mb-4 ${subtext} opacity-20`}/>
                <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No posts yet</p>
                <p className={`text-xs font-bold mt-2 ${subtext} opacity-60`}>Be the first to share with the community</p>
              </div>
            )}

            {posts.map(post => {
              const myReaction = post.reactions?.find(r => r.member_id === sessionUid);
              const showComments = expandedComments.has(post.id);
              const commentCount = post.comments?.length ?? 0;
              const isAuthor = member.id === post.member_id;
              const reactionCounts = REACTIONS.map(r => ({...r, count: post.reactions?.filter(rx => rx.reaction_type === r.type).length ?? 0})).filter(r => r.count > 0);

              return (
                <div key={post.id} id={post.id} className={`${card} border rounded-3xl shadow-sm overflow-hidden ${post.is_pinned ? 'border-red-300' : ''}`}>
                  {post.is_pinned && (
                    <div className="bg-red-50 px-5 py-2 flex items-center gap-2">
                      <Pin size={11} className="text-red-500"/><p className="text-red-600 font-black text-[10px] uppercase tracking-widest">Pinned Post</p>
                    </div>
                  )}
                  {/* Header */}
                  <div className="flex items-start gap-3 p-5 pb-3">
                    <Avatar url={post.member_photo_url} name={post.member_name}/>
                    <div className="flex-1">
                      <p className={`font-black ${text} text-sm`}>{post.member_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-red-600 font-bold uppercase">{post.chapter}</p>
                        <span className={`${subtext}`}>·</span>
                        <p className={`text-[10px] ${subtext} font-bold`}>{timeAgo(post.created_at)}</p>
                      </div>
                    </div>
                    {(isAuthor || isAdmin) && (
                      <div className="relative">
                        <button onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)} className={`${subtext} hover:text-slate-600 p-1 rounded-lg transition-all`}><MoreHorizontal size={18}/></button>
                        {openMenu === post.id && (
                          <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden min-w-[140px]">
                            {isAdmin && <button onClick={() => pinPost(post.id, post.is_pinned)} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-xs font-black text-slate-700 uppercase tracking-widest"><Pin size={12}/>{post.is_pinned?'Unpin':'Pin Post'}</button>}
                            <button onClick={() => { deletePost(post.id); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-50 text-xs font-black text-red-600 uppercase tracking-widest"><Trash2 size={12}/>Delete</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="px-5 pb-3"><p className={`${text} font-medium text-sm leading-relaxed whitespace-pre-wrap`}>{post.content}</p></div>
                  {post.photo_url && <div className="px-5 pb-3"><img src={post.photo_url} className="w-full rounded-2xl object-cover max-h-72 cursor-pointer" alt="Post" onClick={() => window.open(post.photo_url!,'_blank')}/></div>}
                  {(post as any).video_url && <div className="px-5 pb-3"><video src={(post as any).video_url} controls className="w-full rounded-2xl max-h-72" preload="metadata"/></div>}
                  {/* Reaction summary */}
                  {(reactionCounts.length > 0 || commentCount > 0) && (
                    <div className={`px-5 pb-2 flex items-center gap-2 flex-wrap border-b ${divider}`}>
                      {reactionCounts.map(r => <span key={r.type} className={`flex items-center gap-1 ${isDark?'bg-white/10':'bg-slate-50'} rounded-full px-2.5 py-1 text-xs font-bold ${subtext} border ${isDark?'border-white/10':'border-slate-100'}`}>{r.emoji} {r.count}</span>)}
                      {commentCount > 0 && <button onClick={() => setExpandedComments(prev => { const n=new Set(prev); n.has(post.id)?n.delete(post.id):n.add(post.id); return n; })} className={`text-[11px] ${subtext} font-bold ml-auto hover:text-red-600 transition-all`}>{commentCount} comment{commentCount!==1?'s':''}</button>}
                    </div>
                  )}
                  {/* Actions */}
                  <div className="px-3 py-2 flex items-center gap-1">
                    {REACTIONS.map(r => {
                      const active = myReaction?.reaction_type === r.type;
                      return <button key={r.type} onClick={() => toggleReaction(post.id, r.type)} className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-red-50 text-red-600' : `${subtext} hover:${isDark?'bg-white/10':'bg-slate-50'}`}`}><span className="text-base">{r.emoji}</span><span className="hidden sm:inline">{r.label}</span></button>;
                    })}
                    <button onClick={() => setExpandedComments(prev => { const n=new Set(prev); n.has(post.id)?n.delete(post.id):n.add(post.id); return n; })} className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest ${subtext} hover:${isDark?'bg-white/10':'bg-slate-50'} transition-all`}><MessageCircle size={15}/><span className="hidden sm:inline">Comment</span>{commentCount > 0 && <span className={`${isDark?'bg-white/10':'bg-slate-200'} ${subtext} text-[9px] rounded-full px-1.5 py-0.5`}>{commentCount}</span>}</button>
                    <div className="relative flex-1">
                      <button onClick={() => setOpenShare(openShare === post.id ? null : post.id)}
                        className={`flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest ${subtext} hover:${isDark?'bg-white/10':'bg-slate-50'} transition-all`}>
                        <Share2 size={15}/><span className="hidden sm:inline">Share</span>
                      </button>
                      {openShare === post.id && (
                        <div className={`absolute bottom-10 right-0 ${isDark?'bg-slate-800 border-slate-700':'bg-white border-slate-200'} border-2 rounded-2xl shadow-xl z-20 overflow-hidden min-w-[160px]`}>
                          {/* Facebook */}
                          <a href={'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(window.location.origin+'/feed#'+post.id)+'&quote='+encodeURIComponent(post.content.slice(0,200))}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-all border-b border-slate-100 w-full">
                            <div className="w-6 h-6 bg-[#1877F2] rounded-lg flex items-center justify-center shrink-0">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            </div>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Facebook</span>
                          </a>
                          {/* WhatsApp */}
                          <a href={'https://wa.me/?text='+encodeURIComponent(post.content.slice(0,200)+' - '+window.location.origin+'/feed#'+post.id)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-all border-b border-slate-100 w-full">
                            <div className="w-6 h-6 bg-[#25D366] rounded-lg flex items-center justify-center shrink-0">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.855L0 24l6.305-1.508A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.366l-.358-.214-3.742.895.953-3.641-.234-.374A9.818 9.818 0 1112 21.818z"/></svg>
                            </div>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">WhatsApp</span>
                          </a>
                          {/* Copy link */}
                          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/feed#${post.id}`).then(()=>{ setOpenShare(null); alert('Link copied!'); }); }}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-all w-full">
                            <div className={`w-6 h-6 ${isDark?'bg-white/20':'bg-slate-200'} rounded-lg flex items-center justify-center shrink-0`}>
                              <Share2 size={12} className="text-slate-600"/>
                            </div>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Copy Link</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Comments */}
                  {showComments && (
                    <div className={`border-t ${divider} px-5 py-4 space-y-3 ${isDark?'bg-white/5':'bg-slate-50/50'}`}>
                      {(post.comments ?? []).map(c => (
                        <div key={c.id} className="flex gap-3 group">
                          <Avatar url={c.member_photo_url} name={c.member_name} size={8}/>
                          <div className="flex-1">
                            <div className={`${isDark?'bg-slate-800':'bg-white'} rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm`}>
                              <div className="flex items-center justify-between mb-1">
                                <p className={`font-black ${text} text-xs`}>{c.member_name}</p>
                                <p className={`text-[10px] ${subtext} font-bold`}>{timeAgo(c.created_at)}</p>
                              </div>
                              <p className={`text-sm ${text} font-medium leading-relaxed`}>{c.content}</p>
                            </div>
                            {(c.member_id === sessionUid || isAdmin) && <button onClick={() => deleteComment(c.id, post.id)} className="text-[10px] text-slate-300 hover:text-red-500 font-bold mt-1 ml-2 opacity-0 group-hover:opacity-100 transition-all">Delete</button>}
                          </div>
                        </div>
                      ))}
                      {post.comments?.length === 0 && <p className={`text-xs ${subtext} font-bold text-center py-2`}>No comments yet — be the first!</p>}
                      <div className="flex gap-3">
                        <Avatar url={member.photo_url} name={member.full_name} size={8}/>
                        <div className="flex-1 flex gap-2">
                          <input value={commentText[post.id] ?? ''} onChange={e => setCommentText(prev => ({...prev, [post.id]: e.target.value}))}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(post.id); } }}
                            placeholder="Write a comment..."
                            className={`flex-1 border-2 ${isDark?'bg-slate-800 border-slate-700 text-white placeholder-white/30':'bg-white border-slate-200 text-slate-800 placeholder-slate-400'} focus:border-red-400 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none`}/>
                          <button onClick={() => submitComment(post.id)} disabled={!commentText[post.id]?.trim() || submittingComment === post.id} className="bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-2xl disabled:opacity-40 transition-all">
                            {submittingComment === post.id ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-28 h-28 rounded-3xl overflow-hidden bg-slate-200 shrink-0 border-2 border-slate-200">
                  {member.photo_url ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/> : <div className="w-full h-full flex items-center justify-center bg-red-600"><span className="text-4xl font-black text-white">{member.full_name.charAt(0)}</span></div>}
                </div>
                <div className="flex-1">
                  <h2 className={`text-3xl font-black uppercase italic ${text}`}>{member.full_name}</h2>
                  <p className="text-red-600 font-black text-sm uppercase mt-1">{member.chapter}</p>
                  <p className={`${subtext} font-bold text-xs mt-1`}>{member.class_name} · Class of {member.year_graduated}</p>
                  <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full border text-xs font-black uppercase ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
                    <CheckCircle2 size={12}/>{statusCfg.label}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {label:'Total Paid',   value:`$${totalDues.toLocaleString()}`, color:'bg-green-600'},
                {label:'Pending Dues', value:String(pendingDues),              color:'bg-yellow-500'},
                {label:'Activities',   value:String(activity.length),          color:'bg-blue-600'},
                {label:'Since',        value:new Date(member.created_at).getFullYear().toString(), color:'bg-slate-700'},
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
                {[['Member ID',member.id.slice(0,8).toUpperCase()],['Email',member.email],['Phone',member.phone??'—'],['ID Number',member.id_number],['Department',(member as any).department??'—'],['Class Sponsor',member.sponsor_name],['Principal',member.principal_name],['Chapter',member.chapter+(member.chapter_locked?' 🔒':'')],['Approved By',member.approved_by??'Pending']].map(([l,v]) => (
                  <div key={l} className={`${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl p-4`}>
                    <p className={`text-[10px] font-black ${subtext} uppercase tracking-widest mb-1`}>{l}</p>
                    <p className={`font-black ${text} text-sm`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {href:'/officers',      label:'Our Officers',   icon:<Crown size={20}/>,       color:'bg-yellow-500'},
                {href:'/expenses',      label:'Financials',     icon:<DollarSign size={20}/>,  color:'bg-emerald-600'},
                {href:'/reports',       label:'Mtg Reports',    icon:<FileText size={20}/>,    color:'bg-purple-600'},
                {href:'/dues',          label:'Pay Dues',       icon:<CreditCard size={20}/>,  color:'bg-green-600'},
                {href:'/donations',     label:'Donations',      icon:<Plus size={20}/>,        color:'bg-red-600'},
                {href:'/contributions', label:'Solidarity',     icon:<Users size={20}/>,       color:'bg-blue-600'},
              ].map(({href,label,icon,color}) => (
                <Link key={href} href={href} className={`flex flex-col items-center gap-3 ${card} border rounded-3xl p-5 hover:border-red-400 transition-all shadow-sm text-center`}>
                  <div className={`w-10 h-10 ${color} rounded-2xl flex items-center justify-center shrink-0 text-white`}>{icon}</div>
                  <p className={`font-black ${text} uppercase text-xs tracking-widest`}>{label}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── DUES TAB ── */}
        {activeTab === 'dues' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className={`font-black ${text} uppercase italic text-xl`}>My Dues History</h3>
              <Link href="/dues" className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-3 rounded-2xl transition-all">+ Submit Payment</Link>
            </div>
            {dues.length === 0 ? (
              <div className={`${card} border rounded-3xl p-16 text-center shadow-sm`}><CreditCard size={48} className={`mx-auto mb-4 ${subtext} opacity-30`}/><p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No dues payments yet</p></div>
            ) : dues.map(d => {
              const cfg = DUES_STATUS[d.status] ?? DUES_STATUS['pending'];
              const isOpen = expandedDues === d.id;
              const duesAmt = d.dues_amount || (d.amount - (d.maintenance_fee||0));
              const mFee = d.maintenance_fee || 0;
              return (
                <div key={d.id} className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
                  <button onClick={() => setExpandedDues(isOpen?null:d.id)} className={`w-full flex items-center gap-4 p-5 text-left hover:${isDark?'bg-white/5':'bg-slate-50'} transition-all`}>
                    <div className="flex-1">
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
                      <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Breakdown</p>
                        <div className="flex justify-between text-xs"><span className="text-slate-500 font-bold">Dues Amount</span><span className="font-black text-slate-800">{duesAmt.toLocaleString()} {d.currency}</span></div>
                        {mFee > 0 && <div className="flex justify-between text-xs"><span className="text-amber-600 font-bold">Maintenance Fee</span><span className="font-black text-amber-600">{mFee} {d.currency}</span></div>}
                        <div className="flex justify-between text-xs border-t border-slate-100 pt-2"><span className="font-black text-slate-700">Total Paid</span><span className="font-black text-green-700">{d.amount.toLocaleString()} {d.currency}</span></div>
                      </div>
                      {d.notes && <p className={`text-sm font-bold ${text} italic`}>"{d.notes}"</p>}
                      {d.screenshot_url && <img src={d.screenshot_url} className="rounded-2xl max-h-40 cursor-pointer border border-slate-200" alt="Proof" onClick={() => window.open(d.screenshot_url!,'_blank')}/>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── EVENTS TAB ── */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <h3 className={`font-black ${text} uppercase italic text-xl`}>Chapter Events — {member.chapter}</h3>
            {events.length === 0 ? (
              <div className={`${card} border rounded-3xl p-16 text-center`}><Calendar size={48} className={`mx-auto mb-4 ${subtext} opacity-30`}/><p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No events scheduled</p></div>
            ) : events.map(ev => {
              const myAtt = attendance.find(a => a.event_id === ev.id);
              const isPast = new Date(ev.event_date) < new Date();
              const STATUS_COLORS: Record<string,string> = { present:'bg-green-100 text-green-700 border-green-200', absent:'bg-red-100 text-red-700 border-red-200', excused:'bg-yellow-100 text-yellow-700 border-yellow-200' };
              return (
                <div key={ev.id} className={`${card} border rounded-3xl p-6 shadow-sm`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isPast?isDark?'bg-white/10 text-white/40':'bg-slate-100 text-slate-400':'bg-red-100 text-red-600'}`}>{isPast?'Past':'Upcoming'}</span>
                        {myAtt && <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${STATUS_COLORS[myAtt.status]}`}>{myAtt.status}</span>}
                      </div>
                      <h4 className={`font-black ${text} text-base uppercase`}>{ev.title}</h4>
                      {ev.description && <p className={`text-xs ${subtext} font-bold mt-1`}>{ev.description}</p>}
                      <div className={`flex flex-wrap gap-3 mt-2 text-xs ${subtext} font-bold`}>
                        <span>📅 {new Date(ev.event_date).toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'})}</span>
                        {ev.event_time && <span>🕐 {ev.event_time}</span>}
                        {ev.location && <span>📍 {ev.location}</span>}
                      </div>
                    </div>
                  </div>
                  {isPast && myAtt && (
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase ${STATUS_COLORS[myAtt.status]}`}>
                      {myAtt.status==='present'?<CheckCircle2 size={12}/>:<Clock size={12}/>}
                      {myAtt.status==='present'?'You were present':myAtt.status==='excused'?'Excused':'Marked absent'}
                    </div>
                  )}
                  {!isPast && !myAtt && (
                    <div className="flex gap-2 mt-2">
                      {(['present','excused'] as const).map(status => (
                        <button key={status} onClick={async () => {
                          const { data } = await supabase.from('attendance').insert([{ event_id: ev.id, member_id: member.id, status }]).select().single();
                          if (data) { setAttendance(prev => [...prev, data]); await supabase.from('activity_log').insert([{ member_id: member.id, member_name: member.full_name, chapter: member.chapter, action: `RSVP: ${status==='present'?'Attending':'Excused'} — ${ev.title}`, details: ev.event_date }]); }
                        }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase border transition-all ${status==='present'?'bg-green-600 text-white border-green-600':'border-slate-200 text-slate-600 hover:border-yellow-400'}`}>
                          {status==='present'?'✓ Attending':'~ Excuse'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <h3 className={`font-black ${text} uppercase italic text-xl`}>Activity History</h3>
            <div className={`${card} border rounded-3xl overflow-hidden shadow-sm`}>
              {activity.length === 0 ? (
                <div className="p-12 text-center"><Activity size={40} className={`mx-auto mb-3 ${subtext} opacity-30`}/><p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No activity yet</p></div>
              ) : activity.map((a, i) => (
                <div key={a.id} className={`flex items-start gap-4 p-4 ${i < activity.length-1 ? `border-b ${divider}` : ''}`}>
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2 shrink-0"/>
                  <div className="flex-1">
                    <p className={`font-black ${text} text-sm`}>{a.action}</p>
                    {a.details && <p className={`text-xs ${subtext} font-bold mt-0.5`}>{a.details}</p>}
                  </div>
                  <p className={`text-[10px] ${subtext} font-bold shrink-0`}>{new Date(a.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ID CARD TAB ── */}
        {activeTab === 'id-card' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className={`font-black ${text} uppercase italic text-xl`}>Member ID Card</h3>
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl transition-all"><Printer size={14}/> Print</button>
            </div>
            <div className="flex justify-center">
              <div id="member-id-card" className="rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-200" style={{width:'380px'}}>
                <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                  <div><p className="text-red-500 font-black text-[10px] uppercase tracking-widest">Official Member ID</p><p className="text-white font-black uppercase italic">{orgName}</p></div>
                  <div className={`font-black text-[10px] uppercase px-3 py-1.5 rounded-xl tracking-widest ${member.status==='approved'?'bg-green-500 text-white':'bg-yellow-500 text-yellow-900'}`}>{member.status==='approved'?'✓ ACTIVE':'PENDING'}</div>
                </div>
                <div className="bg-white p-6 flex gap-5 items-start">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
                    {member.photo_url ? <img src={member.photo_url} className="w-full h-full object-cover" alt={member.full_name}/> : <div className="w-full h-full bg-slate-200 flex items-center justify-center"><span className="text-3xl font-black text-slate-400">{member.full_name.charAt(0)}</span></div>}
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-900 text-base uppercase">{member.full_name}</p>
                    <p className="text-red-600 font-bold text-xs uppercase mt-1">{member.chapter}</p>
                    <div className="mt-3 space-y-1.5">
                      {[['Class',`${member.class_name} · ${member.year_graduated}`],['ID No.',member.id_number],['Member',member.id.slice(0,8).toUpperCase()]].map(([l,v]) => (
                        <div key={l} className="flex gap-2"><span className="text-[10px] text-slate-400 font-bold uppercase w-16 shrink-0">{l}</span><span className="text-[10px] text-slate-800 font-black font-mono">{v}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-between items-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Issued {new Date(member.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
                  <div className="flex gap-px items-end">{member.id.slice(0,16).split('').map((c,i) => <div key={i} className="bg-slate-700 rounded-sm" style={{width:'2px',height:`${(parseInt(c,16)%3+1)*7}px`}}/>)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PEOPLE TAB ── */}
        {activeTab === 'people' && (
          <div className="space-y-4">
            <div className={`${card} border rounded-3xl p-4 shadow-sm`}>
              <div className="relative">
                <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search members by name or chapter..."
                  className={`w-full border-2 rounded-2xl px-5 py-4 pl-12 font-bold outline-none ${inputCls}`}/>
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                {memberSearch && <button onClick={() => setMemberSearch('')} className={`absolute right-4 top-1/2 -translate-y-1/2 ${subtext}`}><X size={14}/></button>}
              </div>
            </div>

            {/* Stats */}
            <div className={`${card} border rounded-2xl px-5 py-3 flex items-center justify-between`}>
              <p className={`text-xs font-bold ${subtext} uppercase tracking-widest`}>{allMembers.length} approved members</p>
              <p className={`text-xs font-bold ${subtext}`}>{[...new Set(allMembers.map(m => m.chapter))].length} chapters</p>
            </div>

            {/* Member detail modal */}
            {selectedPerson && (
              <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedPerson(null)}>
                <div className={`${card} border rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                        {selectedPerson.photo_url
                          ? <img src={selectedPerson.photo_url} className="w-full h-full object-cover" alt={selectedPerson.full_name}/>
                          : <div className="w-full h-full flex items-center justify-center bg-red-600"><span className="text-white font-black text-2xl">{selectedPerson.full_name.charAt(0)}</span></div>}
                      </div>
                      <div>
                        <p className={`font-black ${text} text-base uppercase leading-tight`}>{selectedPerson.full_name}</p>
                        <p className="text-red-600 font-bold text-xs uppercase mt-1">{selectedPerson.chapter}</p>
                        {selectedPerson.id === member.id && <span className="text-[9px] bg-green-100 text-green-700 font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-block">You</span>}
                      </div>
                    </div>
                    <button onClick={() => setSelectedPerson(null)} className={`${subtext} hover:text-red-600 p-1`}><X size={18}/></button>
                  </div>
                  <div className={`${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl p-5 space-y-2`}>
                    {[
                      ['Class',      selectedPerson.class_name ?? '—'],
                      ['Year',       selectedPerson.year_graduated ? String(selectedPerson.year_graduated) : '—'],
                      ['Department', (selectedPerson as any).department ?? '—'],
                      ['Sponsor',    selectedPerson.sponsor_name  ?? '—'],
                      ['Principal',  selectedPerson.principal_name ?? '—'],
                      ['Phone',      selectedPerson.phone          ?? 'Not provided'],
                      ['Member Since', new Date(selectedPerson.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long'})],
                    ].map(([l,v]) => (
                      <div key={l} className={`flex justify-between py-1.5 border-b ${isDark?'border-white/10':'border-slate-100'} last:border-0`}>
                        <span className={`text-xs font-black ${subtext} uppercase tracking-widest`}>{l}</span>
                        <span className={`text-xs font-black ${text} text-right max-w-[55%]`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Member grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allMembers
                .filter(m => !memberSearch || m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) || m.chapter.toLowerCase().includes(memberSearch.toLowerCase()))
                .map(m => (
                  <button key={m.id} onClick={() => setSelectedPerson(m)}
                    className={`${card} border rounded-3xl p-4 flex items-center gap-4 shadow-sm text-left hover:border-red-400 transition-all w-full`}>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                      {m.photo_url
                        ? <img src={m.photo_url} className="w-full h-full object-cover" alt={m.full_name}/>
                        : <div className="w-full h-full flex items-center justify-center bg-red-600"><span className="text-white font-black text-lg">{m.full_name.charAt(0)}</span></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-black ${text} text-sm truncate`}>{m.full_name}</p>
                      <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest truncate">{m.chapter}</p>
                      <p className={`text-[10px] ${subtext} font-bold mt-0.5`}>{m.class_name ?? ''}{m.year_graduated ? ` · ${m.year_graduated}` : ''}{(m as any).department ? ` · ${(m as any).department}` : ''}</p>
                      {m.id === member.id && <span className="text-[9px] bg-green-100 text-green-700 font-black uppercase px-2 py-0.5 rounded-full">You</span>}
                    </div>
                    <span className={`text-[10px] ${subtext} font-bold shrink-0`}>View →</span>
                  </button>
                ))}
              {allMembers.filter(m => !memberSearch || m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) || m.chapter.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                <div className={`col-span-2 ${card} border rounded-3xl p-12 text-center`}>
                  <p className={`font-black ${subtext} uppercase tracking-widest text-sm`}>No members found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h3 className={`font-black ${text} uppercase italic text-xl`}>Account Settings</h3>

            {/* Edit Profile */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm space-y-4`}>
              <div><h4 className={`font-black ${text} uppercase tracking-widest text-sm flex items-center gap-2`}><User size={16} className="text-red-600"/>Edit Profile</h4><p className={`text-xs ${subtext} font-bold mt-1`}>Update your name, photo and personal details.</p></div>
              {/* Photo */}
              <div>
                <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-3`}>Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 shrink-0 border-2 border-slate-200">
                    {profilePhotoPreview ? <img src={profilePhotoPreview} className="w-full h-full object-cover"/> : member.photo_url ? <img src={member.photo_url} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center bg-red-600"><span className="text-white font-black text-2xl">{member.full_name.charAt(0)}</span></div>}
                  </div>
                  <label className="flex-1 cursor-pointer flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl px-5 py-4 transition-all">
                    <Upload size={18} className="text-slate-400 shrink-0"/>
                    <span className="text-sm font-bold text-slate-500">{profilePhotoFile ? profilePhotoFile.name : 'Click to change photo'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoSelect}/>
                  </label>
                  {profilePhotoPreview && <button onClick={() => { setProfilePhotoFile(null); setProfilePhotoPreview(null); }} className="text-red-400 hover:text-red-600 p-1 shrink-0"><X size={16}/></button>}
                </div>
              </div>
              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {l:'Full Name',      v:profileName,      s:setProfileName},
                  {l:'Phone Number',   v:profilePhone,     s:setProfilePhone},
                  {l:'Class Name',     v:profileClassName, s:setProfileClassName},
                  {l:'Year Graduated', v:profileYearGrad,  s:setProfileYearGrad, type:'number'},
                  {l:'Class Sponsor',  v:profileSponsor,   s:setProfileSponsor},
                  {l:'Principal Name', v:profilePrincipal, s:setProfilePrincipal},
                ].map(({l,v,s,type}) => (
                  <div key={l}>
                    <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>{l}</label>
                    <input value={v} onChange={e => s(e.target.value)} type={type ?? 'text'}
                      className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                  </div>
                ))}
                {/* Department */}
                <div className="sm:col-span-2">
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>Department / Trade</label>
                  <select value={profileDepartment} onChange={e=>setProfileDepartment(e.target.value)}
                    className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}>
                    <option value="">— Select Department —</option>
                    {['Electronics','Electrical','Secretarial Science','Accounting','Automotive','Domestic Science','Machinery','Agriculture','Building Trade (Carpentry, Masoning, Plumbing, Drafting)','Others'].map(d=>(
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              {profileMsg && <p className={`text-xs font-bold ${profileMsg.startsWith('✓')?'text-green-600':'text-red-600'}`}>{profileMsg}</p>}
              <button onClick={saveProfile} disabled={profileSaving} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm flex items-center gap-2 disabled:opacity-50 transition-all">
                {profileSaving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>} Save Profile
              </button>
            </div>

            {/* Push Notifications */}
            {'Notification' in window && 'serviceWorker' in navigator && (
              <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
                <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-1 flex items-center gap-2`}>
                  <Bell size={16} className="text-red-600"/> Push Notifications
                </h4>
                <p className={`text-xs ${subtext} font-bold mb-5`}>
                  Get notified when dues are approved, events are scheduled or voting opens — even when the app is closed.
                </p>
                <div className={`flex items-center justify-between p-4 ${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl mb-4`}>
                  <div>
                    <p className={`font-black ${text} text-sm`}>{pushEnabled ? '🔔 Notifications ON' : '🔕 Notifications OFF'}</p>
                    <p className={`text-xs ${subtext} font-bold mt-0.5`}>{pushEnabled ? 'You will receive push notifications on this device' : 'Enable to receive alerts on this device'}</p>
                  </div>
                  <button onClick={togglePushNotifications} disabled={pushLoading}
                    className={`relative w-14 h-7 rounded-full transition-all disabled:opacity-50 ${pushEnabled ? 'bg-green-500' : isDark?'bg-white/20':'bg-slate-300'}`}>
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${pushEnabled ? 'left-8' : 'left-1'}`}/>
                    {pushLoading && <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-white"/>}
                  </button>
                </div>
                {pushEnabled && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-600 shrink-0"/>
                    <p className="text-xs text-green-700 font-bold">This device will receive BWIAA push notifications.</p>
                  </div>
                )}
              </div>
            )}

            {/* Theme */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-5`}>Display Theme</h4>
              <div className="grid grid-cols-3 gap-3">
                {[{k:'light',l:'Light',i:<Sun size={20}/>},{k:'dark',l:'Dark',i:<Moon size={20}/>},{k:'system',l:'System',i:<Monitor size={20}/>}].map(t => (
                  <button key={t.k} onClick={() => saveTheme(t.k)} className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all ${theme===t.k?'border-red-600 bg-red-50':isDark?'border-slate-700 hover:border-slate-500':'border-slate-200 hover:border-slate-300'}`}>
                    <span className={theme===t.k?'text-red-600':subtext}>{t.i}</span>
                    <span className={`font-black text-xs uppercase tracking-widest ${theme===t.k?'text-red-700':subtext}`}>{t.l}</span>
                    {theme===t.k && <span className="text-[10px] text-red-500 font-black">✓ Active</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Password */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm space-y-4`}>
              <div><h4 className={`font-black ${text} uppercase tracking-widest text-sm flex items-center gap-2`}><Key size={16} className="text-red-600"/>Change Password</h4><p className={`text-xs ${subtext} font-bold mt-1`}>Minimum 8 characters.</p></div>
              {[{l:'New Password',v:newPassword,s:setNewPassword},{l:'Confirm Password',v:confirmPassword,s:setConfirmPassword}].map(({l,v,s}) => (
                <div key={l}>
                  <label className={`block text-xs font-black ${subtext} uppercase tracking-widest mb-2`}>{l}</label>
                  <input type="password" value={v} onChange={e=>s(e.target.value)} className={`w-full border-2 rounded-2xl px-5 py-4 font-bold outline-none ${inputCls}`}/>
                </div>
              ))}
              {pwMsg && <p className={`text-xs font-bold ${pwMsg.startsWith('✓')?'text-green-600':'text-red-600'}`}>{pwMsg}</p>}
              <button onClick={changePassword} disabled={pwLoading} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm flex items-center gap-2 disabled:opacity-50 transition-all">
                {pwLoading?<Loader2 size={14} className="animate-spin"/>:<Lock size={14}/>} Update Password
              </button>
            </div>

            {/* Chapter */}
            <div className={`${card} border rounded-[2.5rem] p-8 shadow-sm`}>
              <h4 className={`font-black ${text} uppercase tracking-widest text-sm mb-3`}>Chapter Assignment</h4>
              <div className={`flex items-center justify-between p-4 ${isDark?'bg-white/5':'bg-slate-50'} rounded-2xl`}>
                <div><p className={`font-black ${text}`}>{member.chapter}</p><p className={`text-xs ${subtext} font-bold mt-0.5`}>Your permanent chapter</p></div>
                <div className={`${isDark?'bg-white/10 text-white/40':'bg-slate-200 text-slate-500'} text-[10px] font-black uppercase px-3 py-1.5 rounded-xl`}>🔒 Locked</div>
              </div>
              <p className={`text-xs ${subtext} font-bold mt-3`}>Contact your chapter administrator to request a transfer.</p>
            </div>

            {/* Sign out */}
            <div className={`${isDark?'bg-red-950/30 border-red-900':'bg-red-50 border-red-200'} border-2 rounded-[2.5rem] p-8`}>
              <h4 className="font-black text-red-600 uppercase tracking-widest text-sm mb-3">Sign Out</h4>
              <button onClick={signOut} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase px-6 py-3 rounded-2xl text-sm transition-all">
                <LogOut size={14}/> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {openMenu  && <div className="fixed inset-0 z-0"  onClick={() => setOpenMenu(null)}/>}
      {openShare && <div className="fixed inset-0 z-10" onClick={() => setOpenShare(null)}/>}
      {showNotifs && <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)}/>}
    </div>
  );
}
