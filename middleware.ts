import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // This is the important check
  const { data: { session } } = await supabase.auth.getSession()

  // If trying to go to /admin
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // If not logged in, go back home
    if (!session) return NextResponse.redirect(new URL('/', request.url))

    // Check if email is in the admin list
    const { data: admin } = await supabase
      .from('election_admins')
      .select('*')
      .eq('email', session.user.email)
      .maybeSingle()

    // If not on the list, go back home
    if (!admin) return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
