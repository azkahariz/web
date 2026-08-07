const WILAYAH_API_BASE = "https://wilayah.id/api";
const ALLOWED_PATH = /^\/(?:provinces\.json|regencies\/\d{2}\.json|districts\/\d{2}\.\d{2}\.json|villages\/\d{2}\.\d{2}\.\d{2}\.json)$/;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const path = requestUrl.searchParams.get("path") ?? "";

  if (!ALLOWED_PATH.test(path)) {
    return Response.json({ data: null, message: "Path wilayah tidak valid" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${WILAYAH_API_BASE}${path}`, {
      headers: { Accept: "application/json" },
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    });
  } catch {
    return Response.json(
      { data: null, message: "Layanan wilayah belum dapat dihubungi" },
      { status: 502 },
    );
  }
}
