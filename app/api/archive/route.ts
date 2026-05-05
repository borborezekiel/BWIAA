import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role — bypasses RLS, runs securely server-side
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Verify request has correct secret to prevent abuse
    const { secret } = await req.json();
    if (secret !== process.env.ARCHIVE_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check deadline has actually passed
    const { data: deadlineRow } = await supabaseAdmin
      .from('election_settings').select('value').eq('key', 'voting_deadline').maybeSingle();
    if (!deadlineRow?.value) {
      return NextResponse.json({ ok: false, error: 'No deadline set' });
    }
    if (new Date(deadlineRow.value).getTime() > Date.now()) {
      return NextResponse.json({ ok: false, error: 'Deadline has not passed yet' });
    }

    // Fetch all votes and candidates
    const [{ data: allVotes }, { data: allCandidates }, { data: settings }] = await Promise.all([
      supabaseAdmin.from('votes').select('*'),
      supabaseAdmin.from('candidates').select('*'),
      supabaseAdmin.from('election_settings').select('*'),
    ]);

    if (!allVotes || !allCandidates) {
      return NextResponse.json({ ok: false, error: 'No data to archive' });
    }

    const get = (k: string) => settings?.find((r: any) => r.key === k)?.value;
    const year        = new Date().getFullYear();
    const orgName     = get('org_name')       ?? 'BWIAA';
    const electionTitle = get('election_title') ?? 'Election';

    // Group votes by chapter + position
    const grouped: Record<string, Record<string, Record<string, number>>> = {};
    allVotes.forEach((v: any) => {
      if (!grouped[v.chapter]) grouped[v.chapter] = {};
      if (!grouped[v.chapter][v.position_name]) grouped[v.chapter][v.position_name] = {};
      grouped[v.chapter][v.position_name][v.candidate_name] =
        (grouped[v.chapter][v.position_name][v.candidate_name] ?? 0) + 1;
    });

    const historyRows: any[] = [];
    Object.entries(grouped).forEach(([chapter, positions]) => {
      Object.entries(positions).forEach(([position, candidates]) => {
        const total      = Object.values(candidates).reduce((a, b) => a + b, 0);
        const sorted     = Object.entries(candidates).sort((a, b) => b[1] - a[1]);
        const winnerName = sorted[0]?.[0];
        const winnerVotes = candidates[winnerName] ?? 0;
        const winnerCand  = allCandidates.find(
          (c: any) => c.full_name === winnerName && c.chapter === chapter
        );
        historyRows.push({
          election_year:    year,
          election_name:    `${orgName} ${electionTitle} ${year}`,
          chapter,
          position_name:    position,
          winner_name:      winnerName,
          winner_photo_url: winnerCand?.photo_url ?? null,
          total_votes:      total,
          winner_votes:     winnerVotes,
          archived_by:      'system-auto',
        });
      });
    });

    if (historyRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'No votes to archive' });
    }

    const { error } = await supabaseAdmin.from('election_history')
      .upsert(historyRows, { onConflict: 'election_year,chapter,position_name' });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Auto-announce results and close voting
    await supabaseAdmin.from('election_settings')
      .upsert([
        { key: 'results_announced', value: 'true' },
        { key: 'voting_open',       value: 'false' },
      ], { onConflict: 'key' });

    return NextResponse.json({
      ok: true,
      archived: historyRows.length,
      message: `✓ Archived ${historyRows.length} position results. Results announced automatically.`,
    });

  } catch (e: any) {
    console.error('Archive route error:', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Also allow GET for Vercel cron jobs
export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Check if deadline has passed and results not yet archived
  const { data: rows } = await supabaseAdmin
    .from('election_settings').select('key,value')
    .in('key', ['voting_deadline', 'results_announced', 'voting_open']);

  const get = (k: string) => rows?.find(r => r.key === k)?.value;
  const deadline = get('voting_deadline');
  const resultsAnnounced = get('results_announced') === 'true';

  if (!deadline || resultsAnnounced) {
    return NextResponse.json({ ok: true, message: 'Nothing to archive' });
  }

  if (new Date(deadline).getTime() > Date.now()) {
    return NextResponse.json({ ok: true, message: 'Deadline not yet passed' });
  }

  // Trigger the archive via internal POST
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.ARCHIVE_SECRET }),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
