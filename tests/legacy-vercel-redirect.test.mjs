import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_HOSTINGER_ORIGIN,
  legacyVercelRedirectDestination,
} from "../app/lib/legacy-vercel-redirect.ts";

test("hostname legacy Vercel diarahkan sementara ke Hostinger dengan path dan query utuh", () => {
  assert.equal(
    legacyVercelRedirectDestination("aloptama-collect.vercel.app", "/", "")?.toString(),
    `${CANONICAL_HOSTINGER_ORIGIN}/`,
  );
  assert.equal(
    legacyVercelRedirectDestination("aloptama-collect.vercel.app", "/admin", "?foo=bar")?.toString(),
    `${CANONICAL_HOSTINGER_ORIGIN}/admin?foo=bar`,
  );
  assert.equal(
    legacyVercelRedirectDestination("ALOPTAMA-COLLECT.VERCEL.APP", "/admin/panduan", "?a=1&b=2")?.toString(),
    `${CANONICAL_HOSTINGER_ORIGIN}/admin/panduan?a=1&b=2`,
  );
});

test("redirect legacy tidak menghapus refresh sesi Supabase untuk hostname lain", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  );

  assert.match(source, /if \(destination\) return NextResponse\.redirect\(destination, 307\);/);
  assert.match(source, /createServerClient\(/);
  assert.match(source, /await supabase\.auth\.getClaims\(\);/);
});

test("hostname Hostinger, localhost, dan Preview tidak dialihkan", () => {
  for (const hostname of [
    "aloptama-collect.azkahariz.com",
    "localhost",
    "aloptama-collect-git-feat-hostinger-cutover-azkahariz-projects.vercel.app",
  ]) {
    assert.equal(legacyVercelRedirectDestination(hostname, "/", ""), null);
  }
});
