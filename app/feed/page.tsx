"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Heart, MessageCircle, Share2, Image, Send, X,
  Loader2, Pin, Trash2, MoreHorizontal, ThumbsUp,
  ChevronDown, ChevronUp, Lock, Globe
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Member {
  id: string; full_name: string; chapter: string;
  photo_url: string | null; status: string; auth_user_id: string;
}
interface Post {
  id: string; member_id: string; member_name: string;
  member_photo_url: string | null; chapter: string;
  content: string; photo_url: string | null;
  is_pinned: boolean; status: string; created_at: string;
  reactions?: Reaction[]; comments?: Comment[];
}
interface Reaction {
  id: string; post_id: string; member_id: string;
  member_name: string; reaction_type: string;
}
interface Comment {
  id: string; post_id: string; member_id: string;
  member_name: string; member_photo_url: string | null;
  chapter: string; content: string; created_at: string;
}

const REACTIONS = [
  { type: 'like',  emoji: '👍', label: 'Like'  },
  { type: 'love',  emoji: '❤️', label: 'Love'  },
  { type: 'tiger', emoji: '🐯', label: 'Tiger' },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Avatar({ url, name, size = 10 }: { url: string | null; name: string; size?: number }) {
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

export default function FeedPage() {
  const router  = useRouter();
  const [me, setMe]             = useState<Member | null>(null);
  const [posts, setPosts]       = useState<Post[]>([]);
  const [loading, setLoading]   = useState(true);
  const [posting, setPosting]   = useState(false);
  const [content, setContent]   = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText]   = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [orgName, setOrgName]   = useState('BWIAA');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase.from('election_settings').select('key,value');
      if (settings) {
        const get = (k: string) => settings.find((r: any) => r.key === k)?.value;
        if (get('org_name')) setOrgName(get('org_name'));
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      let mem: any = null;
      const { data: m1 } = await supabase.from('members')
        .select('id,full_name,chapter,photo_url,status,auth_user_id')
        .eq('auth_user_id', user.id).maybeSingle();
      if (m1) { mem = m1; }
      else {
        const { data: m2 } = await supabase.from('members')
          .select('id,full_name,chapter,photo_url,status,auth_user_id')
          .eq('email', user.email?.toLowerCase() ?? '').maybeSingle();
        if (m2) {
          mem = m2;
          if (!m2.auth_user_id) await supabase.from('members').update({ auth_user_id: user.id }).eq('id', m2.id);
        }
      }
      if (mem?.status === 'approved') setMe(mem);

      await loadPosts(user.id);
      setLoading(false);
    })();

    // Realtime — new posts and reactions
    const channel = supabase.channel('feed-live')
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadPosts(userId: string) {
    const { data: postsData } = await supabase
      .from('posts').select('*')
      .eq('status', 'approved')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (!postsData) return;

    const postIds = postsData.map(p => p.id);

    const [{ data: reactionsData }, { data: commentsData }] = await Promise.all([
      supabase.from('post_reactions').select('*').in('post_id', postIds),
      supabase.from('post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
    ]);

    const enriched = postsData.map(p => ({
      ...p,
      reactions: (reactionsData ?? []).filter(r => r.post_id === p.id),
      comments:  (commentsData  ?? []).filter(c => c.post_id === p.id),
    }));
    setPosts(enriched);
  }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new window.Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200; let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(new File([b], 'post.jpg', { type: 'image/jpeg' })) : reject(), 'image/jpeg', 0.88);
      }; img.onerror = reject; img.src = url;
    });
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const compressed = await compressImage(file);
    setPhotoFile(compressed); setPhotoPreview(URL.createObjectURL(compressed));
  }

  async function submitPost() {
    if (!me || !content.trim()) return;
    setPosting(true);
    try {
      let photo_url: string | null = null;
      if (photoFile) {
        const fn = `posts/${me.id}_${Date.now()}.jpg`;
        const { data: ud, error: ue } = await supabase.storage.from('candidate-photos').upload(fn, photoFile, { upsert: true });
        if (ue) throw new Error(ue.message);
        photo_url = supabase.storage.from('candidate-photos').getPublicUrl(ud.path).data.publicUrl;
      }
      await supabase.from('posts').insert([{
        member_id: me.id, member_name: me.full_name,
        member_photo_url: me.photo_url, chapter: me.chapter,
        content: content.trim(), photo_url, is_pinned: false, status: 'approved',
      }]);
      setContent(''); setPhotoFile(null); setPhotoPreview(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await loadPosts(user.id);
    } catch (e: any) { alert(e.message); }
    finally { setPosting(false); }
  }

  async function toggleReaction(postId: string, reactionType: string) {
    if (!me) return;
    const post = posts.find(p => p.id === postId);
    const existing = post?.reactions?.find(r => r.member_id === me.id);

    if (existing) {
      if (existing.reaction_type === reactionType) {
        // Remove reaction
        await supabase.from('post_reactions').delete()
          .eq('post_id', postId).eq('member_id', me.id);
      } else {
        // Change reaction
        await supabase.from('post_reactions').delete()
          .eq('post_id', postId).eq('member_id', me.id);
        await supabase.from('post_reactions').insert([{
          post_id: postId, member_id: me.id, member_name: me.full_name, reaction_type: reactionType,
        }]);
      }
    } else {
      await supabase.from('post_reactions').insert([{
        post_id: postId, member_id: me.id, member_name: me.full_name, reaction_type: reactionType,
      }]);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadPosts(user.id);
  }

  async function submitComment(postId: string) {
    if (!me || !commentText[postId]?.trim()) return;
    setSubmittingComment(postId);
    await supabase.from('post_comments').insert([{
      post_id: postId, member_id: me.id, member_name: me.full_name,
      member_photo_url: me.photo_url, chapter: me.chapter,
      content: commentText[postId].trim(),
    }]);
    setCommentText(prev => ({ ...prev, [postId]: '' }));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadPosts(user.id);
    setSubmittingComment(null);
  }

  async function deletePost(postId: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  async function pinPost(postId: string, pinned: boolean) {
    await supabase.from('posts').update({ is_pinned: !pinned }).eq('id', postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: !pinned } : p));
    setOpenMenu(null);
  }

  async function deleteComment(commentId: string, postId: string) {
    await supabase.from('post_comments').delete().eq('id', commentId);
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, comments: p.comments?.filter(c => c.id !== commentId) }
      : p
    ));
  }

  function toggleComments(postId: string) {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }

  function share(postId: string) {
    const url = `${window.location.origin}/feed#${postId}`;
    navigator.clipboard.writeText(url).then(() => alert('Link copied to clipboard!'));
  }

  // Head admin check
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: ha } = await supabase.from('election_settings').select('value').eq('key','head_admins').maybeSingle();
      let heads = ['ezekielborbor17@gmail.com'];
      if (ha?.value) { try { heads = JSON.parse(ha.value); } catch {} }
      if (heads.includes(user.email?.toLowerCase() ?? '')) setIsAdmin(true);
    });
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="animate-spin text-red-600" size={48}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* Header */}
      <div className="bg-slate-900 border-b border-white/5 p-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-xl"><Globe size={18} className="text-white"/></div>
            <div>
              <h1 className="text-white font-black uppercase italic text-sm">{orgName} Community Feed</h1>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Stay connected · Share updates</p>
            </div>
          </div>
          <Link href="/members/dashboard" className="text-white/40 hover:text-white text-xs font-black uppercase tracking-widest">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* New post composer — approved members only */}
        {me ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm">
            <div className="flex gap-3">
              <Avatar url={me.photo_url} name={me.full_name}/>
              <div className="flex-1">
                <textarea
                  value={content} onChange={e => setContent(e.target.value)}
                  placeholder={`What's on your mind, ${me.full_name.split(' ')[0]}?`}
                  rows={3}
                  className="w-full resize-none outline-none text-slate-800 font-bold text-sm placeholder-slate-400 leading-relaxed"/>

                {photoPreview && (
                  <div className="relative mt-3 rounded-2xl overflow-hidden max-h-60">
                    <img src={photoPreview} className="w-full object-cover" alt="Preview"/>
                    <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                      <X size={14}/>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 text-slate-400 hover:text-red-600 font-bold text-xs uppercase tracking-widest transition-all">
                    <Image size={16}/> Photo
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto}/>
                  <button onClick={submitPost} disabled={posting || !content.trim()}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-5 py-2.5 rounded-xl transition-all disabled:opacity-40">
                    {posting ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                    {posting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
              <Lock size={18} className="text-slate-400"/>
            </div>
            <div>
              <p className="font-black text-slate-800 text-sm">Members only</p>
              <p className="text-xs text-slate-400 font-bold">
                <Link href="/members/login" className="text-red-600 hover:underline">Sign in</Link> as an approved member to post and react.
              </p>
            </div>
          </div>
        )}

        {/* Posts */}
        {posts.length === 0 && !loading && (
          <div className="bg-white rounded-3xl p-16 text-center shadow-sm">
            <Globe size={48} className="mx-auto mb-4 text-slate-200"/>
            <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No posts yet</p>
            <p className="text-slate-300 text-xs font-bold mt-2">Be the first to share something with the community</p>
          </div>
        )}

        {posts.map(post => {
          const myReaction = post.reactions?.find(r => r.member_id === me?.id);
          const showComments = expandedComments.has(post.id);
          const commentCount = post.comments?.length ?? 0;
          const isAuthor = me?.id === post.member_id;

          // Group reactions
          const reactionCounts = REACTIONS.map(r => ({
            ...r,
            count: post.reactions?.filter(rx => rx.reaction_type === r.type).length ?? 0,
          })).filter(r => r.count > 0);

          return (
            <div key={post.id} id={post.id} className={`bg-white rounded-3xl shadow-sm overflow-hidden ${post.is_pinned ? 'border-2 border-red-200' : ''}`}>
              {post.is_pinned && (
                <div className="bg-red-50 px-5 py-2 flex items-center gap-2">
                  <Pin size={12} className="text-red-500"/>
                  <p className="text-red-600 font-black text-[10px] uppercase tracking-widest">Pinned Post</p>
                </div>
              )}

              {/* Post header */}
              <div className="flex items-start gap-3 p-5 pb-3">
                <Avatar url={post.member_photo_url} name={post.member_name}/>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 text-sm">{post.member_name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[10px] text-red-600 font-bold uppercase">{post.chapter}</p>
                    <span className="text-slate-200">·</span>
                    <p className="text-[10px] text-slate-400 font-bold">{timeAgo(post.created_at)}</p>
                  </div>
                </div>
                {/* Options menu */}
                {(isAuthor || isAdmin) && (
                  <div className="relative">
                    <button onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)}
                      className="text-slate-300 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-all">
                      <MoreHorizontal size={18}/>
                    </button>
                    {openMenu === post.id && (
                      <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden min-w-[140px]">
                        {isAdmin && (
                          <button onClick={() => pinPost(post.id, post.is_pinned)}
                            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-xs font-black text-slate-700 uppercase tracking-widest">
                            <Pin size={12}/>{post.is_pinned ? 'Unpin' : 'Pin Post'}
                          </button>
                        )}
                        <button onClick={() => { deletePost(post.id); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-50 text-xs font-black text-red-600 uppercase tracking-widest">
                          <Trash2 size={12}/>Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Post content */}
              <div className="px-5 pb-3">
                <p className="text-slate-800 font-medium text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>

              {/* Post photo */}
              {post.photo_url && (
                <div className="px-5 pb-3">
                  <img src={post.photo_url} className="w-full rounded-2xl object-cover max-h-80 cursor-pointer"
                    alt="Post" onClick={() => window.open(post.photo_url!, '_blank')}/>
                </div>
              )}

              {/* Reaction summary */}
              {reactionCounts.length > 0 && (
                <div className="px-5 pb-2 flex items-center gap-2 flex-wrap">
                  {reactionCounts.map(r => (
                    <span key={r.type} className="flex items-center gap-1 bg-slate-50 rounded-full px-2.5 py-1 text-xs font-bold text-slate-600 border border-slate-100">
                      {r.emoji} {r.count}
                    </span>
                  ))}
                  {commentCount > 0 && (
                    <span className="text-[11px] text-slate-400 font-bold ml-auto">{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
              )}

              {/* Action bar */}
              <div className="px-3 py-2 border-t border-slate-50 flex items-center gap-1">
                {REACTIONS.map(r => {
                  const isActive = myReaction?.reaction_type === r.type;
                  return (
                    <button key={r.type}
                      onClick={() => me ? toggleReaction(post.id, r.type) : router.push('/members/login')}
                      className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                        ${isActive ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
                      <span className="text-base">{r.emoji}</span>
                      <span className="hidden sm:inline">{r.label}</span>
                    </button>
                  );
                })}
                <button onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                  <MessageCircle size={15}/>
                  <span className="hidden sm:inline">Comment</span>
                  {commentCount > 0 && <span className="bg-slate-200 text-slate-600 text-[9px] rounded-full px-1.5 py-0.5">{commentCount}</span>}
                </button>
                <button onClick={() => share(post.id)}
                  className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                  <Share2 size={15}/>
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>

              {/* Comments section */}
              {showComments && (
                <div className="border-t border-slate-50 px-5 py-4 space-y-4 bg-slate-50/50">
                  {/* Existing comments */}
                  {(post.comments ?? []).map(c => (
                    <div key={c.id} className="flex gap-3 group">
                      <Avatar url={c.member_photo_url} name={c.member_name} size={8}/>
                      <div className="flex-1">
                        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-black text-slate-800 text-xs">{c.member_name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{timeAgo(c.created_at)}</p>
                          </div>
                          <p className="text-sm text-slate-700 font-medium leading-relaxed">{c.content}</p>
                        </div>
                        {(c.member_id === me?.id || isAdmin) && (
                          <button onClick={() => deleteComment(c.id, post.id)}
                            className="text-[10px] text-slate-300 hover:text-red-500 font-bold mt-1 ml-2 opacity-0 group-hover:opacity-100 transition-all">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {post.comments?.length === 0 && (
                    <p className="text-xs text-slate-400 font-bold text-center py-2">No comments yet — be the first!</p>
                  )}

                  {/* New comment input */}
                  {me ? (
                    <div className="flex gap-3">
                      <Avatar url={me.photo_url} name={me.full_name} size={8}/>
                      <div className="flex-1 flex gap-2">
                        <input
                          value={commentText[post.id] ?? ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(post.id); } }}
                          placeholder="Write a comment..."
                          className="flex-1 bg-white border-2 border-slate-200 focus:border-red-400 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-slate-800 placeholder-slate-400"/>
                        <button onClick={() => submitComment(post.id)}
                          disabled={!commentText[post.id]?.trim() || submittingComment === post.id}
                          className="bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-2xl disabled:opacity-40 transition-all">
                          {submittingComment === post.id ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-bold text-center">
                      <Link href="/members/login" className="text-red-600 hover:underline">Sign in</Link> to comment
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Click away to close menus */}
      {openMenu && <div className="fixed inset-0 z-0" onClick={() => setOpenMenu(null)}/>}
    </div>
  );
}
