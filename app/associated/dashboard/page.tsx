"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, Loader2, LogOut, Globe, Bell, Send,
  Image, Share2, MessageCircle, MoreHorizontal,
  Pin, Trash2, X, CheckCircle2, Printer, Crown
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AssocMember {
  id: string; full_name: string; organization_name: string|null;
  email: string; phone: string|null; member_type: string;
  photo_url: string|null; status: string; created_at: string;
  auth_user_id: string|null;
}

const REACTIONS = [
  { type:'like',  emoji:'👍', label:'Like'  },
  { type:'love',  emoji:'❤️', label:'Love'  },
  { type:'tiger', emoji:'🐯', label:'Tiger' },
];

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff/60000);
  if (mins<1) return 'Just now';
  if (mins<60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  if (hrs<24) return `${hrs}h ago`;
  return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function Avatar({url,name,size=10}:{url:string|null;name:string;size?:number}) {
  const sizeClass = size === 8 ? 'w-8 h-8 rounded-xl' : 'w-10 h-10 rounded-2xl';
  return (
    <div className={`${sizeClass} overflow-hidden bg-slate-200 shrink-0`}>
      {url ? <img src={url} className="w-full h-full object-cover" alt={name}/>
      : <div className="w-full h-full flex items-center justify-center bg-blue-600">
          <span className="text-white font-black text-sm">{name.charAt(0)}</span>
        </div>}
    </div>
  );
}

export default function AssociatedDashboard() {
  const router = useRouter();
  const [member, setMember]           = useState<AssocMember|null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<'feed'|'profile'|'id-card'>('feed');
  const [orgName, setOrgName]         = useState('BWIAA');
  const [sessionUid, setSessionUid]   = useState('');

  // Feed
  const [posts, setPosts]             = useState<any[]>([]);
  const [postContent, setPostContent] = useState('');
  const [postPhoto, setPostPhoto]     = useState<File|null>(null);
  const [postPhotoPreview, setPostPhotoPreview] = useState<string|null>(null);
  const [posting, setPosting]         = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string,string>>({});
  const [submittingComment, setSubmittingComment] = useState<string|null>(null);
  const [openMenu, setOpenMenu]       = useState<string|null>(null);
  const [openShare, setOpenShare]     = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/associated/login'); return; }
      setSessionUid(user.id);

      const { data: settings } = await supabase.from('election_settings').select('key,value');
      if (settings) {
        const get = (k:string) => settings.find((r:any)=>r.key===k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }

      const { data: mem } = await supabase.from('associated_members')
        .select('*').eq('email', user.email?.toLowerCase()??'').maybeSingle();

      if (!mem) { router.push('/associated/register'); return; }
      if (mem.status === 'pending') { router.push('/associated/pending'); return; }
      if (mem.status === 'rejected') { router.push('/associated/rejected'); return; }

      // Link auth_user_id if missing
      if (!mem.auth_user_id) {
        await supabase.from('associated_members').update({ auth_user_id: user.id }).eq('id', mem.id);
      }
      setMember(mem);
      await loadPosts(user.id);
      setLoading(false);
    })();
  }, []);

  async function loadPosts(uid: string) {
    const { data: postsData } = await supabase.from('posts').select('*')
      .eq('status','approved').order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).limit(50);
    if (!postsData) return;
    const ids = postsData.map(p=>p.id);
    const [{ data: rxns },{ data: cmts }] = await Promise.all([
      supabase.from('post_reactions').select('*').in('post_id',ids),
      supabase.from('post_comments').select('*').in('post_id',ids).order('created_at',{ascending:true}),
    ]);
    setPosts(postsData.map(p=>({
      ...p,
      reactions:(rxns??[]).filter((r:any)=>r.post_id===p.id),
      comments:(cmts??[]).filter((c:any)=>c.post_id===p.id),
    })));
  }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve,reject)=>{
      const img=new window.Image(); const url=URL.createObjectURL(file);
      img.onload=()=>{
        const MAX=1200; let {width,height}=img;
        if(width>MAX||height>MAX){if(width>height){height=Math.round(height*MAX/width);width=MAX;}else{width=Math.round(width*MAX/height);height=MAX;}}
        const c=document.createElement('canvas'); c.width=width; c.height=height;
        c.getContext('2d')!.drawImage(img,0,0,width,height); URL.revokeObjectURL(url);
        c.toBlob(b=>b?resolve(new File([b],'img.jpg',{type:'image/jpeg'})):reject(),'image/jpeg',0.88);
      }; img.onerror=reject; img.src=url;
    });
  }

  async function submitPost() {
    if (!member||!postContent.trim()) return;
    setPosting(true);
    try {
      let photo_url: string|null = null;
      if (postPhoto) {
        const fn=`posts/${member.id}_${Date.now()}.jpg`;
        const {data:ud,error:ue}=await supabase.storage.from('candidate-photos').upload(fn,postPhoto,{upsert:true});
        if(ue) throw new Error(ue.message);
        photo_url=supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }
      const {data:newPost}=await supabase.from('posts').insert([{
        member_id: member.id, member_name: member.full_name,
        member_photo_url: member.photo_url, chapter: `Associated · ${member.member_type}`,
        content: postContent.trim(), photo_url, is_pinned:false, status:'approved',
      }]).select().single();
      setPostContent(''); setPostPhoto(null); setPostPhotoPreview(null);
      if (newPost) setPosts(prev=>[{...newPost,reactions:[],comments:[]}, ...prev]);
    } catch(e:any) { alert(e.message); }
    finally { setPosting(false); }
  }

  async function toggleReaction(postId: string, reactionType: string) {
    if (!member) return;
    const {data:{user:su}}=await supabase.auth.getUser();
    if (!su) return;
    const post=posts.find(p=>p.id===postId);
    const existing=post?.reactions?.find((r:any)=>r.member_id===su.id);
    setPosts(prev=>prev.map(p=>{
      if(p.id!==postId) return p;
      let reactions=[...(p.reactions??[])];
      reactions=reactions.filter((r:any)=>r.member_id!==su.id);
      if(!existing||existing.reaction_type!==reactionType)
        reactions.push({id:Date.now().toString(),post_id:postId,member_id:su.id,member_name:member.full_name,reaction_type:reactionType});
      return {...p,reactions};
    }));
    if (existing) {
      await supabase.from('post_reactions').delete().eq('post_id',postId).eq('member_id',su.id);
      if (existing.reaction_type!==reactionType)
        await supabase.from('post_reactions').insert([{post_id:postId,member_id:su.id,member_name:member.full_name,reaction_type:reactionType}]);
    } else {
      await supabase.from('post_reactions').insert([{post_id:postId,member_id:su.id,member_name:member.full_name,reaction_type:reactionType}]);
    }
  }

  async function submitComment(postId: string) {
    if (!member||!commentText[postId]?.trim()) return;
    setSubmittingComment(postId);
    const {data:{user:su}}=await supabase.auth.getUser();
    if (!su) { setSubmittingComment(null); return; }
    const txt=commentText[postId].trim();
    setCommentText(prev=>({...prev,[postId]:''}));
    const {data:nc,error}=await supabase.from('post_comments')
      .insert([{post_id:postId,member_id:su.id,member_name:member.full_name,member_photo_url:member.photo_url,chapter:`Associated`,content:txt}])
      .select().single();
    if (nc) setPosts(prev=>prev.map(p=>p.id===postId?{...p,comments:[...(p.comments??[]),nc]}:p));
    setSubmittingComment(null);
  }

  async function signOut() { await supabase.auth.signOut(); router.push('/'); }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={48}/></div>;
  if (!member) return null;

  const TYPE_LABELS: Record<string,string> = { supporting:'Supporting Member', honorary:'Honorary Member', affiliate:'Affiliate Member', corporate:'Corporate Member' };

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <style>{`@media print { body * { visibility:hidden!important; } #assoc-id-card, #assoc-id-card * { visibility:visible!important; } #assoc-id-card { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%); } }`}</style>

      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar url={member.photo_url} name={member.full_name}/>
            <div>
              <p className="text-white font-black text-sm uppercase">{member.full_name}</p>
              <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest">{TYPE_LABELS[member.member_type]??member.member_type}</p>
            </div>
          </div>
          <button onClick={signOut} className="bg-white/10 hover:bg-red-600 text-white/60 hover:text-white p-2.5 rounded-xl transition-all">
            <LogOut size={16}/>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-white p-1 rounded-2xl mb-5 shadow-sm">
          {[
            {id:'feed',    label:'Feed',     icon:<Globe size={13}/>},
            {id:'profile', label:'Profile',  icon:<Users size={13}/>},
            {id:'id-card', label:'ID Card',  icon:<Crown size={13}/>},
          ].map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id as any)}
              className={`flex items-center gap-1 px-3 py-2.5 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex-1 justify-center ${activeTab===t.id?'bg-blue-600 text-white':'text-slate-400 hover:text-blue-600'}`}>
              {t.icon}<span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── FEED TAB ── */}
        {activeTab==='feed' && (
          <div className="space-y-4">
            {/* Composer */}
            <div className="bg-white rounded-3xl p-5 shadow-sm">
              <div className="flex gap-3">
                <Avatar url={member.photo_url} name={member.full_name}/>
                <div className="flex-1">
                  <textarea value={postContent} onChange={e=>setPostContent(e.target.value)}
                    placeholder={`Share with the BWIAA community, ${member.full_name.split(' ')[0]}...`}
                    rows={3} className="w-full resize-none outline-none font-bold text-sm text-slate-800 placeholder-slate-400 leading-relaxed bg-transparent"/>
                  {postPhotoPreview&&<div className="relative mt-3 rounded-2xl overflow-hidden max-h-48"><img src={postPhotoPreview} className="w-full object-cover"/><button onClick={()=>{setPostPhoto(null);setPostPhotoPreview(null);}} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><X size={14}/></button></div>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <button onClick={()=>fileRef.current?.click()} className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-xs uppercase tracking-widest transition-all">
                      <Image size={15}/> Photo
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const c=await compressImage(f);setPostPhoto(c);setPostPhotoPreview(URL.createObjectURL(c));}}/>
                    <button onClick={submitPost} disabled={posting||!postContent.trim()}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs px-5 py-2.5 rounded-xl transition-all disabled:opacity-40">
                      {posting?<Loader2 size={14} className="animate-spin"/>:<Send size={14}/>}
                      {posting?'Posting...':'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Posts */}
            {posts.map(post=>{
              const myReaction=post.reactions?.find((r:any)=>r.member_id===sessionUid);
              const showComments=expandedComments.has(post.id);
              const commentCount=post.comments?.length??0;
              const reactionCounts=REACTIONS.map(r=>({...r,count:post.reactions?.filter((rx:any)=>rx.reaction_type===r.type).length??0})).filter(r=>r.count>0);
              return (
                <div key={post.id} className={`bg-white rounded-3xl shadow-sm overflow-hidden ${post.is_pinned?'border-2 border-blue-200':''}`}>
                  {post.is_pinned&&<div className="bg-blue-50 px-5 py-2 flex items-center gap-2"><Pin size={11} className="text-blue-500"/><p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">Pinned</p></div>}
                  <div className="flex items-start gap-3 p-5 pb-3">
                    <Avatar url={post.member_photo_url} name={post.member_name}/>
                    <div className="flex-1"><p className="font-black text-slate-900 text-sm">{post.member_name}</p><div className="flex items-center gap-2"><p className="text-[10px] text-blue-600 font-bold uppercase">{post.chapter}</p><span className="text-slate-200">·</span><p className="text-[10px] text-slate-400 font-bold">{timeAgo(post.created_at)}</p></div></div>
                  </div>
                  <div className="px-5 pb-3"><p className="text-slate-800 font-medium text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p></div>
                  {post.photo_url&&<div className="px-5 pb-3"><img src={post.photo_url} className="w-full rounded-2xl object-cover max-h-72 cursor-pointer" onClick={()=>window.open(post.photo_url,'_blank')}/></div>}
                  {reactionCounts.length>0&&<div className="px-5 pb-2 flex items-center gap-2 border-b border-slate-50">{reactionCounts.map(r=><span key={r.type} className="flex items-center gap-1 bg-slate-50 rounded-full px-2.5 py-1 text-xs font-bold text-slate-600">{r.emoji} {r.count}</span>)}</div>}
                  <div className="px-3 py-2 flex items-center gap-1">
                    {REACTIONS.map(r=>{
                      const active=myReaction?.reaction_type===r.type;
                      return <button key={r.type} onClick={()=>toggleReaction(post.id,r.type)} className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active?'bg-blue-50 text-blue-600':'text-slate-400 hover:bg-slate-50'}`}><span className="text-base">{r.emoji}</span><span className="hidden sm:inline">{r.label}</span></button>;
                    })}
                    <button onClick={()=>setExpandedComments(prev=>{const n=new Set(prev);n.has(post.id)?n.delete(post.id):n.add(post.id);return n;})} className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"><MessageCircle size={15}/><span className="hidden sm:inline">Comment</span>{commentCount>0&&<span className="bg-slate-200 text-[9px] rounded-full px-1.5 py-0.5">{commentCount}</span>}</button>
                    <div className="relative flex-1">
                      <button onClick={()=>setOpenShare(openShare===post.id?null:post.id)} className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"><Share2 size={15}/><span className="hidden sm:inline">Share</span></button>
                      {openShare===post.id&&<div className="absolute bottom-10 right-0 bg-white border-2 border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden min-w-[160px]">
                        <a href={'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(window.location.origin+'/feed#'+post.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 border-b border-slate-100"><div className="w-6 h-6 bg-[#1877F2] rounded-lg flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></div><span className="text-xs font-black text-slate-700 uppercase">Facebook</span></a>
                        <a href={'https://wa.me/?text='+encodeURIComponent(post.content.slice(0,200)+' - '+window.location.origin+'/feed#'+post.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 border-b border-slate-100"><div className="w-6 h-6 bg-[#25D366] rounded-lg flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.528 5.855L0 24l6.305-1.508A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.366l-.358-.214-3.742.895.953-3.641-.234-.374A9.818 9.818 0 1112 21.818z"/></svg></div><span className="text-xs font-black text-slate-700 uppercase">WhatsApp</span></a>
                        <button onClick={()=>{navigator.clipboard.writeText(window.location.origin+'/feed#'+post.id).then(()=>{setOpenShare(null);alert('Link copied!');});}} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 w-full"><div className="w-6 h-6 bg-slate-200 rounded-lg flex items-center justify-center"><Share2 size={12} className="text-slate-600"/></div><span className="text-xs font-black text-slate-700 uppercase">Copy Link</span></button>
                      </div>}
                    </div>
                  </div>
                  {showComments&&<div className="border-t border-slate-50 px-5 py-4 space-y-3 bg-slate-50/50">
                    {(post.comments??[]).map((c:any)=>(
                      <div key={c.id} className="flex gap-3">
                        <Avatar url={c.member_photo_url} name={c.member_name} size={8}/>
                        <div className="flex-1"><div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm"><div className="flex items-center justify-between mb-1"><p className="font-black text-slate-800 text-xs">{c.member_name}</p><p className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</p></div><p className="text-sm text-slate-700">{c.content}</p></div></div>
                      </div>
                    ))}
                    {post.comments?.length===0&&<p className="text-xs text-slate-400 font-bold text-center">No comments yet.</p>}
                    <div className="flex gap-3">
                      <Avatar url={member.photo_url} name={member.full_name} size={8}/>
                      <div className="flex-1 flex gap-2">
                        <input value={commentText[post.id]??''} onChange={e=>setCommentText(prev=>({...prev,[post.id]:e.target.value}))}
                          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitComment(post.id);}}}
                          placeholder="Write a comment..." className="flex-1 border-2 border-slate-200 focus:border-blue-400 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none"/>
                        <button onClick={()=>submitComment(post.id)} disabled={!commentText[post.id]?.trim()||submittingComment===post.id} className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-2xl disabled:opacity-40 transition-all">
                          {submittingComment===post.id?<Loader2 size={15} className="animate-spin"/>:<Send size={15}/>}
                        </button>
                      </div>
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab==='profile' && (
          <div className="space-y-5">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex items-center gap-5 mb-6">
                <div className="w-24 h-24 rounded-3xl overflow-hidden bg-slate-200 border-4 border-slate-100 shrink-0">
                  {member.photo_url?<img src={member.photo_url} className="w-full h-full object-cover"/>:<div className="w-full h-full flex items-center justify-center bg-blue-600"><span className="text-white font-black text-3xl">{member.full_name.charAt(0)}</span></div>}
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase italic text-slate-900">{member.full_name}</h2>
                  {member.organization_name&&<p className="text-slate-500 font-bold text-sm">{member.organization_name}</p>}
                  <span className="inline-flex items-center gap-1 mt-2 bg-blue-100 border border-blue-200 text-blue-700 text-xs font-black uppercase px-3 py-1 rounded-full">
                    <CheckCircle2 size={11}/> {TYPE_LABELS[member.member_type]??member.member_type}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-5 space-y-2">
                {[
                  ['Email',   member.email],
                  ['Phone',   member.phone??'—'],
                  ['Type',    TYPE_LABELS[member.member_type]??member.member_type],
                  ['Member Since', new Date(member.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})],
                ].map(([l,v])=>(
                  <div key={l} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{l}</span>
                    <span className="text-xs font-black text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ID CARD TAB ── */}
        {activeTab==='id-card' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 uppercase italic text-xl">Associated Member ID</h3>
              <button onClick={()=>window.print()} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl"><Printer size={14}/> Print</button>
            </div>
            <div className="flex justify-center">
              <div id="assoc-id-card" className="rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-200" style={{width:'380px'}}>
                <div className="bg-blue-900 px-6 py-4 flex items-center justify-between">
                  <div><p className="text-blue-300 font-black text-[10px] uppercase tracking-widest">Associated Member ID</p><p className="text-white font-black uppercase italic">{orgName}</p></div>
                  <div className="bg-blue-500 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl tracking-widest">✓ ACTIVE</div>
                </div>
                <div className="bg-white p-6 flex gap-5 items-start">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-slate-200">
                    {member.photo_url?<img src={member.photo_url} className="w-full h-full object-cover"/>:<div className="w-full h-full bg-blue-100 flex items-center justify-center"><span className="text-3xl font-black text-blue-400">{member.full_name.charAt(0)}</span></div>}
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-900 text-base uppercase">{member.full_name}</p>
                    {member.organization_name&&<p className="text-slate-500 font-bold text-xs mt-0.5">{member.organization_name}</p>}
                    <p className="text-blue-600 font-bold text-xs uppercase mt-1">{TYPE_LABELS[member.member_type]}</p>
                    <div className="mt-3 space-y-1.5">
                      {[['Email',member.email],['ID',member.id.slice(0,8).toUpperCase()],['Since',new Date(member.created_at).getFullYear().toString()]].map(([l,v])=>(
                        <div key={l} className="flex gap-2"><span className="text-[10px] text-slate-400 font-bold uppercase w-12 shrink-0">{l}</span><span className="text-[10px] text-slate-800 font-black font-mono">{v}</span></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-between items-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Associated Member · {orgName}</p>
                  <div className="flex gap-px items-end">{member.id.slice(0,16).split('').map((c,i)=><div key={i} className="bg-blue-700 rounded-sm" style={{width:'2px',height:`${(parseInt(c,16)%3+1)*7}px`}}/>)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {openMenu&&<div className="fixed inset-0 z-0" onClick={()=>setOpenMenu(null)}/>}
      {openShare&&<div className="fixed inset-0 z-10" onClick={()=>setOpenShare(null)}/>}
    </div>
  );
}
