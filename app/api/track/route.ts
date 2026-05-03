import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS for server-side insert
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Parse user agent into device/browser/os
function parseUA(ua: string) {
  // Device type
  const isMobile  = /iPhone|Android|Mobile|BlackBerry|IEMobile/i.test(ua);
  const isTablet  = /iPad|Tablet|PlayBook/i.test(ua);
  const device_type = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';

  // Device brand
  let device_brand = 'Unknown';
  if (/iPhone/i.test(ua))                           device_brand = 'Apple iPhone';
  else if (/iPad/i.test(ua))                        device_brand = 'Apple iPad';
  else if (/Macintosh/i.test(ua))                   device_brand = 'Apple Mac';
  else if (/Samsung|SM-/i.test(ua))                 device_brand = 'Samsung';
  else if (/Huawei/i.test(ua))                      device_brand = 'Huawei';
  else if (/Xiaomi|Redmi/i.test(ua))                device_brand = 'Xiaomi';
  else if (/TECNO/i.test(ua))                       device_brand = 'TECNO';
  else if (/Infinix/i.test(ua))                     device_brand = 'Infinix';
  else if (/itel/i.test(ua))                        device_brand = 'itel';
  else if (/Windows/i.test(ua))                     device_brand = 'Windows PC';
  else if (/Linux/i.test(ua) && !isMobile)          device_brand = 'Linux PC';
  else if (/Android/i.test(ua))                     device_brand = 'Android Device';

  // Browser
  let browser = 'Unknown';
  if (/Edg\//i.test(ua))                            browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua))                 browser = 'Opera';
  else if (/Chrome\/[0-9]/i.test(ua))               browser = 'Chrome';
  else if (/Firefox\/[0-9]/i.test(ua))              browser = 'Firefox';
  else if (/Safari\/[0-9]/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/i.test(ua))                browser = 'Internet Explorer';

  // OS
  let os = 'Unknown';
  if (/Windows NT 10/i.test(ua))      os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua))       os = 'Windows';
  else if (/iPhone OS ([0-9_]+)/i.test(ua)) os = `iOS ${ua.match(/iPhone OS ([0-9_]+)/i)![1].replace(/_/g,'.')}`;
  else if (/iPad.*OS ([0-9_]+)/i.test(ua))  os = `iPadOS ${ua.match(/iPad.*OS ([0-9_]+)/i)![1].replace(/_/g,'.')}`;
  else if (/Mac OS X/i.test(ua))      os = 'macOS';
  else if (/Android ([0-9.]+)/i.test(ua)) os = `Android ${ua.match(/Android ([0-9.]+)/i)![1]}`;
  else if (/Linux/i.test(ua))         os = 'Linux';

  return { device_type, device_brand, browser, os };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { page, referrer, is_member, screen_res, timezone, language } = body;

    // ── Get real IP ──────────────────────────────────────────────────────────
    // Vercel sets x-forwarded-for; first IP in list is the real client IP
    const forwarded = req.headers.get('x-forwarded-for');
    const ip_address = forwarded ? forwarded.split(',')[0].trim() : 
                       req.headers.get('x-real-ip') ?? 'Unknown';

    // ── User agent ───────────────────────────────────────────────────────────
    const user_agent = req.headers.get('user-agent') ?? '';
    const { device_type, device_brand, browser, os } = parseUA(user_agent);

    // ── IP Geolocation (free, no API key needed) ─────────────────────────────
    let country = 'Unknown', city = 'Unknown', region = 'Unknown';
    try {
      if (ip_address !== 'Unknown' && ip_address !== '::1' && !ip_address.startsWith('127.')) {
        const geo = await fetch(`http://ip-api.com/json/${ip_address}?fields=status,country,regionName,city`, {
          signal: AbortSignal.timeout(3000), // 3s timeout — don't slow page load
        });
        if (geo.ok) {
          const geoData = await geo.json();
          if (geoData.status === 'success') {
            country = geoData.country   ?? 'Unknown';
            region  = geoData.regionName ?? 'Unknown';
            city    = geoData.city      ?? 'Unknown';
          }
        }
      }
    } catch {} // geo failure is non-critical

    // ── Insert to Supabase ───────────────────────────────────────────────────
    const { error } = await supabaseAdmin.from('site_visits').insert([{
      page:        page ?? '/',
      referrer:    referrer ?? null,
      is_member:   is_member ?? false,
      ip_address,
      country,
      city,
      region,
      device_type,
      device_brand,
      browser,
      os,
      user_agent:  user_agent.slice(0, 500), // cap length
      screen_res:  screen_res ?? null,
      timezone:    timezone   ?? null,
      language:    language   ?? null,
    }]);

    if (error) {
      console.error('site_visits insert error:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Track route error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
