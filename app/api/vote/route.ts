import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function settingIsOn(value: unknown) {
  return value === true || String(value).toLowerCase() === 'true';
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Please sign in before voting.' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.email) {
      return NextResponse.json({ ok: false, error: 'Your session could not be verified. Please sign in again.' }, { status: 401 });
    }

    const body = await req.json();
    const position_name = String(body.position_name ?? '').trim();
    const candidate_name = String(body.candidate_name ?? '').trim();
    const chapter = String(body.chapter ?? '').trim();
    const class_year = body.class_year ? String(body.class_year).trim() : null;

    if (!position_name || !candidate_name || !chapter) {
      return NextResponse.json({ ok: false, error: 'Missing vote details.' }, { status: 400 });
    }

    const { data: settings } = await supabaseAdmin
      .from('election_settings')
      .select('key,value')
      .in('key', ['voting_open', 'voting_deadline']);
    const get = (key: string) => settings?.find((row: any) => row.key === key)?.value;
    const votingOpen = settingIsOn(get('voting_open'));
    const deadline = get('voting_deadline');

    if (!votingOpen) {
      return NextResponse.json({ ok: false, error: 'VOTING IS NOT OPEN YET. The Election Committee has not officially opened the ballot.' }, { status: 403 });
    }
    if (deadline && new Date(deadline).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: 'VOTING HAS CLOSED. The election deadline has passed.' }, { status: 403 });
    }

    const email = user.email.toLowerCase();
    const { data: blocked } = await supabaseAdmin
      .from('blacklisted_voters')
      .select('reason')
      .eq('email', email)
      .maybeSingle();
    if (blocked) {
      return NextResponse.json({ ok: false, error: `ACCESS DENIED: This email has been blocked. Reason: ${blocked.reason}.` }, { status: 403 });
    }

    const { data: eligible } = await supabaseAdmin
      .from('eligible_voters')
      .select('email,chapter')
      .eq('email', email)
      .maybeSingle();
    if (!eligible) {
      return NextResponse.json({ ok: false, error: `${user.email} is not on the official voter roster.` }, { status: 403 });
    }

    const voteChapter = eligible.chapter || chapter;
    const { data: candidate } = await supabaseAdmin
      .from('candidates')
      .select('id')
      .eq('full_name', candidate_name)
      .eq('position_name', position_name)
      .eq('chapter', voteChapter)
      .maybeSingle();
    if (!candidate) {
      return NextResponse.json({ ok: false, error: 'Selected candidate is not valid for your chapter ballot.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('votes')
      .insert([{
        position_name,
        candidate_name,
        voter_name: user.email,
        voter_id: user.id,
        chapter: voteChapter,
        class_year,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ ok: false, error: `INTEGRITY ALERT: You have already cast a ballot for ${position_name}.` }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: `Vote could not be recorded: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, vote: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? 'Vote could not be recorded.' }, { status: 500 });
  }
}
