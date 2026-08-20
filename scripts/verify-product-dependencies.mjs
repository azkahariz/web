import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib tersedia untuk verifier lokal.");
if (!/localhost|127\.0\.0\.1/.test(databaseUrl)) throw new Error("verify:product-dependencies hanya boleh memakai Supabase lokal.");

const sql = postgres(databaseUrl, { ssl: false, max: 1, connect_timeout: 15, idle_timeout: 5 });
try {
  const functions = await sql`
    select p.proname, p.prosecdef, p.provolatile
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('product_direct_reference_rows', 'admin_product_dependencies', 'admin_product_direct_references')
  `;
  if (functions.length !== 3) throw new Error("RPC Product dependency belum tersedia. Terapkan migration ke Supabase lokal terlebih dahulu.");
  if (functions.some((fn) => !fn.prosecdef || fn.provolatile !== 's')) throw new Error("RPC dependency harus SECURITY DEFINER dan STABLE/read-only.");
  const direct = functions.find((fn) => fn.proname === 'product_direct_reference_rows');
  if (!direct) throw new Error("Helper direct reference tidak ditemukan.");
  const grants = await sql`
    select has_function_privilege('anon', 'public.product_direct_reference_rows(uuid)', 'execute') as anon_can_execute,
      has_function_privilege('authenticated', 'public.product_direct_reference_rows(uuid)', 'execute') as station_can_execute
  `;
  if (grants[0].anon_can_execute || grants[0].station_can_execute) throw new Error("Helper direct reference tidak boleh dapat dipanggil langsung oleh anon/station user.");
  console.log("Verifikasi Product dependency lulus; RPC read-only, security boundary, dan helper private tersedia di Supabase lokal.");
} finally {
  await sql.end({ timeout: 5 });
}
