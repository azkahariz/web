import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "./app/lib/supabase/config";
import { legacyVercelRedirectDestination } from "./app/lib/legacy-vercel-redirect";

export async function proxy(request: NextRequest) {
  const destination = legacyVercelRedirectDestination(
    request.nextUrl.hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (destination) return NextResponse.redirect(destination, 307);

  const config = getPublicSupabaseConfig();
  if (!config) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request, headers });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
