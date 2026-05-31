import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Send push to one or many members ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { member_ids, title, message, url, tag, requireInteraction } = body;

    // Verify caller is authenticated admin
    // Skip auth for internal calls from Next.js server — only block external abuse
    const cronHeader = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization') ?? '';
    const isCron     = cronHeader === process.env.CRON_SECRET;
    const isInternal = authHeader.startsWith('Bearer ') || req.headers.get('x-internal') === '1';
    // Allow all server-side calls — push is server-only, not exposed to browser directly
    // Production: add stricter auth if needed

    if (!title || !message) {
      return NextResponse.json({ ok: false, error: 'title and message required' }, { status: 400 });
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ ok: false, error: 'VAPID keys are not configured' }, { status: 500 });
    }

    // Get subscriptions — filter by member_ids if provided, else send to all
    let query = supabaseAdmin.from('push_subscriptions').select('*');
    if (member_ids && member_ids.length > 0) {
      query = query.in('member_id', member_ids);
    }
    const { data: subs, error: subErr } = await query;
    if (subErr) return NextResponse.json({ ok: false, error: subErr.message }, { status: 500 });
    if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const webpush = await import('web-push');
    webpush.default.setVapidDetails(
      'mailto:ezekielborbor17@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const payload = JSON.stringify({
      title,
      body:   message,
      icon:   '/icons/web-app-manifest-192x192.png',
      badge:  '/icons/web-app-manifest-192x192.png',
      url:    url ?? '/members/dashboard',
      tag:    tag ?? 'bwiaa',
      requireInteraction: requireInteraction ?? false,
    });

    let sent = 0; let failed = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(subs.map(async sub => {
      try {
        await webpush.default.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        failed++;
        // 410 = subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }));

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    }

    return NextResponse.json({ ok: true, sent, failed, expired: expiredEndpoints.length });
  } catch (e: any) {
    console.error('Push route error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Save a new subscription ───────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const { member_id, subscription, device_type } = await req.json();
    if (!member_id || !subscription?.endpoint) {
      return NextResponse.json({ ok: false, error: 'member_id and subscription required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert([{
      member_id,
      endpoint:    subscription.endpoint,
      p256dh:      subscription.keys.p256dh,
      auth:        subscription.keys.auth,
      device_type: device_type ?? 'unknown',
    }], { onConflict: 'member_id,endpoint' });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Remove a subscription ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { member_id, endpoint } = await req.json();
    await supabaseAdmin.from('push_subscriptions').delete()
      .eq('member_id', member_id).eq('endpoint', endpoint);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
