import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Panduan Super Admin | Aloptama Collect",
  description: "Panduan ringkas untuk Super Admin Aloptama Collect.",
};

export default async function AdminGuidePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");
  const { data: admin } = await supabase.from("super_admins").select("id").eq("auth_user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!admin) redirect("/");

  return (
    <main className="guide-shell">
      <header className="guide-header">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">AC</div><div><p className="eyebrow">BANTUAN SUPER ADMIN</p><h1>Aloptama Collect</h1></div></div>
        <Link className="logout-button" href="/admin">Kembali ke Dashboard</Link>
      </header>
      <article className="guide-content">
        <p className="kicker">PANDUAN RINGKAS</p>
        <h2>Gunakan tindakan admin untuk membantu pengisian, bukan untuk menimpa data tanpa alasan.</h2>
        <section>
          <h3>Stasiun dan pengisian</h3>
          <ul>
            <li><strong>Buka</strong> dan <strong>Unduh</strong> hanya membaca data, tanpa membuat submission atau lock.</li>
            <li><strong>Edit sebagai Admin</strong> baru mengambil lock dan dapat mengubah data.</li>
            <li>Site tanpa submission tetap tampil dari master data dan dapat diunduh sebagai template kosong.</li>
          </ul>
        </section>
        <section>
          <h3>Tindakan yang berisiko</h3>
          <ul>
            <li><strong>Paksa Lepas Lock</strong> menghentikan hak simpan editor aktif. Gunakan hanya setelah menghubungi editor bila memungkinkan.</li>
            <li><strong>Ambil Alih sebagai Admin</strong> dapat membuat perubahan editor lain tidak tersimpan. Pastikan alasan dan konfirmasi tindakan.</li>
            <li><strong>Reset Password</strong> menampilkan password baru sekali saja. Password lama tidak dapat dibaca.</li>
          </ul>
        </section>
        <section>
          <h3>QC Produk</h3>
          <ul>
            <li>Approve untuk produk yang benar-benar baru.</li>
            <li>Merge untuk variasi penulisan produk yang sudah ada.</li>
            <li>Reject harus memakai alasan. Raw input pengguna tetap tersimpan.</li>
          </ul>
        </section>
        <p className="guide-more">Gunakan dokumen lengkap di repository: <strong>docs/PANDUAN-SUPER-ADMIN.md</strong> dan <strong>docs/SOP-PERUBAHAN-PRODUCTION.md</strong>.</p>
      </article>
    </main>
  );
}
