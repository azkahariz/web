import Link from "next/link";
import { redirect } from "next/navigation";
import GuideUpdatesSection from "../../components/GuideUpdatesSection";
import { formatGuideDate, getLatestGuideUpdate } from "../../lib/guide-updates";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Panduan Super Admin | Aloptama Collect",
  description: "Panduan pekerjaan operasional Super Admin Aloptama Collect.",
};

const adminTasks = [
  ["Melihat progres pengisian", "#submission", "Periksa data aktif dan data yang sudah diarsipkan."],
  ["Memeriksa Submission", "#submission", "Buka, unduh, atau edit data pengisian."],
  ["Mengelola akun Stasiun", "#akun-stasiun", "Aktifkan akun atau buat password baru."],
  ["Memeriksa usulan Produk", "#qc-produk", "Setujui, gabungkan, atau tolak usulan."],
  ["Melihat penggunaan Produk", "#penggunaan-produk", "Cari tahu Produk masih dipakai di mana."],
  ["Memperbaiki Produk yang salah", "#memperbaiki-produk", "Edit nama atau pindahkan item ke Produk yang benar."],
  ["Menggabungkan Produk yang sama", "#menggabungkan-produk", "Satukan dua Produk tanpa membuang riwayat lama."],
  ["Menonaktifkan atau menghapus Produk", "#produk-tidak-digunakan", "Pilih tindakan yang paling aman."],
  ["Melihat riwayat atau mengatasi masalah", "#riwayat-masalah", "Periksa Audit Admin dan tindakan yang tertahan."],
] as const;

export default async function AdminGuidePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");
  const { data: admin } = await supabase.from("super_admins").select("id").eq("auth_user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!admin) redirect("/");
  const latest = getLatestGuideUpdate("admin");

  return (
    <main className="guide-shell">
      <header className="guide-header">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">AC</div><div><p className="eyebrow">BANTUAN SUPER ADMIN</p><h1>Aloptama Collect</h1></div></div>
        <Link className="logout-button" href="/admin">Kembali ke Dashboard</Link>
      </header>

      <article className="guide-content">
        <p className="kicker">PANDUAN SUPER ADMIN</p>
        <h2>Selesaikan pekerjaan Admin dengan memahami langkah dan akibatnya.</h2>
        <p className="guide-lead">Mulai dari pekerjaan yang ingin dilakukan. Istilah teknis hanya dijelaskan ketika memang diperlukan.</p>
        {latest && <p className="guide-version-meta">Terakhir diperbarui: <strong>{formatGuideDate(latest.date)}</strong><span>Versi panduan {latest.version}</span></p>}

        <nav className="guide-task-nav" aria-labelledby="admin-guide-tasks">
          <h3 id="admin-guide-tasks">Mau melakukan apa?</h3>
          <div className="guide-task-grid">
            {adminTasks.map(([label, href, description]) => <a key={label} href={href}><strong>{label}</strong><span>{description}</span></a>)}
          </div>
        </nav>

        <GuideUpdatesSection audience="admin" />

        <section id="submission" className="guide-article">
          <p className="guide-section-label">STASIUN DAN PENGISIAN</p>
          <h3>Bagaimana melihat progres dan membuka data yang sudah diisi?</h3>
          <p><strong>Submission</strong> adalah data pengisian untuk satu Site dan satu Subtipe.</p>
          <ol>
            <li>Buka menu <strong>Stasiun &amp; Pengisian</strong>.</li>
            <li>Pilih tab <strong>Submission</strong>.</li>
            <li>Gunakan pencarian atau filter untuk menemukan Stasiun, Site, atau Subtipe.</li>
            <li>Klik baris untuk melihat progres dan rincian perangkat.</li>
            <li>Klik <strong>Buka</strong> untuk melihat lengkap, <strong>Unduh</strong> untuk mengambil data, atau buka data sebagai Admin jika perlu memperbaikinya.</li>
          </ol>

          <h4>Bagaimana melihat data yang sudah diarsipkan?</h4>
          <ol>
            <li>Pada tab <strong>Submission</strong>, pilih <strong>Diarsipkan</strong>.</li>
            <li>Buka detail Submission yang diperlukan.</li>
            <li>Klik <strong>Pulihkan Submission</strong> jika data perlu dikembalikan ke pengisian aktif.</li>
          </ol>
          <p>Membuka atau mengunduh hanya membaca data. Mengedit sebagai Admin dapat mengubah data, sehingga pastikan Site dan Subtipe sudah benar sebelum menyimpan.</p>
        </section>

        <section id="akun-stasiun" className="guide-article">
          <p className="guide-section-label">AKUN STASIUN</p>
          <h3>Bagaimana mengelola akun Stasiun?</h3>
          <ol>
            <li>Buka menu <strong>Akun Stasiun</strong>.</li>
            <li>Cari Stasiun yang diperlukan.</li>
            <li>Klik <strong>Aktifkan</strong> atau <strong>Nonaktifkan</strong> untuk mengubah akses masuk.</li>
            <li>Klik <strong>Reset Password</strong> jika Stasiun membutuhkan password baru.</li>
          </ol>
          <div className="guide-note"><strong>Catatan</strong><p>Password baru hanya ditampilkan satu kali. Simpan atau kirimkan kepada petugas Stasiun sebelum dialog ditutup.</p></div>
        </section>

        <section id="qc-produk" className="guide-article">
          <p className="guide-section-label">USULAN PRODUK</p>
          <h3>Bagaimana memeriksa usulan Produk?</h3>
          <ol>
            <li>Buka menu <strong>QC Produk</strong>.</li>
            <li>Pilih tab <strong>PENDING</strong>, lalu periksa Merk, Tipe, Stasiun, Site, Subtipe, dan Kategori.</li>
            <li>Cari Produk tujuan pada kotak merge jika usulan mirip dengan Produk yang sudah ada.</li>
            <li>Pilih tindakan yang sesuai.</li>
          </ol>
          <ul className="guide-choice-list">
            <li><strong>Approve Baru:</strong> gunakan jika Merk dan Tipe tersebut memang Produk baru yang belum ada.</li>
            <li><strong>Merge:</strong> gunakan jika usulan hanya variasi penulisan dari Produk yang sudah ada.</li>
            <li><strong>Tolak:</strong> gunakan jika usulan salah atau tidak layak. Isi alasan yang membantu pengguna memperbaikinya.</li>
          </ul>
          <p>Usulan yang disetujui menjadi Produk resmi. Usulan yang digabungkan menunjuk ke Produk yang sudah ada. Usulan yang ditolak tetap menyimpan alasan pemeriksaan.</p>
        </section>

        <section id="penggunaan-produk" className="guide-article">
          <p className="guide-section-label">MASTER PRODUK</p>
          <h3>Bagaimana mengecek Produk masih digunakan atau tidak?</h3>
          <ol>
            <li>Buka menu <strong>Produk</strong>.</li>
            <li>Cari Produk yang ingin diperiksa.</li>
            <li>Klik angka pada kolom <strong>Penggunaan</strong>.</li>
            <li>Buka tab <strong>Dependency</strong>, <strong>Referensi</strong>, <strong>QC History</strong>, dan <strong>Alias</strong> untuk memeriksa seluruh keterkaitannya.</li>
          </ol>
          <p>Angka <strong>0 referensi</strong> hanya berarti tidak ada item aktif yang memakai Produk tersebut. Periksa juga riwayat QC, Alias, arsip, dan hubungan penggabungan sebelum mengambil tindakan.</p>
        </section>

        <section id="memperbaiki-produk" className="guide-article">
          <p className="guide-section-label">PERBAIKI PRODUK</p>
          <h3>Bagaimana memperbaiki Produk yang salah?</h3>
          <h4>Jika hanya Merk atau Tipe yang salah</h4>
          <ol>
            <li>Buka menu <strong>Produk</strong> dan cari Produk tersebut.</li>
            <li>Klik <strong>Edit</strong>.</li>
            <li>Perbaiki <strong>Merk</strong> atau <strong>Tipe</strong>, lalu klik <strong>Simpan Perubahan</strong>.</li>
          </ol>
          <h4>Jika item menunjuk ke Produk yang salah</h4>
          <ol>
            <li>Klik angka pada kolom <strong>Penggunaan</strong>.</li>
            <li>Buka tab <strong>Referensi</strong> dan centang item yang ingin diperbaiki.</li>
            <li>Klik <strong>Pindahkan Referensi</strong>.</li>
            <li>Cari dan pilih Produk tujuan yang benar, periksa ringkasan, lalu klik tombol <strong>Pindahkan Item</strong>.</li>
          </ol>
          <h4>Apa yang akan terjadi?</h4>
          <p>Produk yang ditunjuk oleh item akan berubah ke Produk tujuan. Jumlah unit, nomor seri, kondisi, tahun, catatan, dan data inventaris lainnya tetap.</p>
          <div className="guide-example"><strong>Contoh</strong><p>Item yang salah memilih <strong>Datalogger CR6</strong> dipindahkan ke Produk <strong>CR6</strong> yang benar.</p></div>
        </section>

        <section id="menggabungkan-produk" className="guide-article">
          <p className="guide-section-label">PRODUK GANDA</p>
          <h3>Ada dua Produk yang sebenarnya sama</h3>
          <ol>
            <li>Buka menu <strong>Produk</strong> dan cari Produk yang tidak ingin dipakai lagi.</li>
            <li>Klik <strong>Gabungkan</strong>.</li>
            <li>Pilih Produk tujuan yang akan dipertahankan.</li>
            <li>Periksa jumlah Item, Unit, Site, Submission, dan Alias.</li>
            <li>Jika sudah benar, klik <strong>Gabungkan Produk</strong>.</li>
          </ol>
          <h4>Apa yang akan terjadi?</h4>
          <p>Item aktif akan menggunakan Produk tujuan. Produk lama berstatus <strong>Digabungkan</strong> dan tetap disimpan sebagai riwayat. Nama lamanya dapat digunakan untuk membantu pencarian.</p>
          <div className="guide-example"><strong>Contoh</strong><p><strong>Datalogger CR6</strong> digabungkan ke <strong>CR6</strong>.</p></div>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Tindakan ini tidak dapat dibatalkan melalui aplikasi. Pastikan Produk sumber dan Produk tujuan benar-benar sama sebelum melanjutkan.</p></div>
        </section>

        <section id="produk-tidak-digunakan" className="guide-article">
          <p className="guide-section-label">PRODUK TIDAK DIGUNAKAN</p>
          <h3>Produk sudah tidak digunakan. Haruskah dihapus?</h3>
          <p className="guide-direct-answer"><strong>Tidak perlu.</strong> Jika Produk sudah tidak digunakan, sebaiknya cukup <strong>Nonaktifkan</strong>.</p>
          <h4>Nonaktifkan Produk</h4>
          <ol>
            <li>Buka menu <strong>Produk</strong> dan cari Produk.</li>
            <li>Klik <strong>Nonaktifkan</strong>.</li>
            <li>Konfirmasi tindakan.</li>
          </ol>
          <p>Produk tidak muncul lagi sebagai pilihan untuk pengisian baru, tetapi data dan riwayatnya tetap tersimpan. Produk dapat diaktifkan kembali jika diperlukan.</p>
          <h4>Hapus Permanen</h4>
          <p>Gunakan <strong>Hapus Permanen</strong> hanya jika benar-benar diperlukan dan Produk sudah tidak memiliki keterkaitan data apa pun.</p>
          <ol>
            <li>Pastikan Produk sudah dinonaktifkan.</li>
            <li>Klik <strong>Hapus Permanen</strong>.</li>
            <li>Periksa hasil pemeriksaan keterkaitan. Jika masih ada keterkaitan, klik <strong>Lihat Keterkaitan</strong> dan selesaikan masalahnya terlebih dahulu.</li>
            <li>Lanjutkan hanya jika aplikasi menyatakan Produk dapat dihapus.</li>
          </ol>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Hapus Permanen tidak dapat dibatalkan melalui aplikasi. Angka <strong>0 referensi</strong> tidak otomatis berarti Produk harus atau boleh dihapus.</p></div>
        </section>

        <section id="riwayat-masalah" className="guide-article">
          <p className="guide-section-label">RIWAYAT DAN MASALAH</p>
          <h3>Bagaimana melihat riwayat perubahan atau menangani tindakan yang tertahan?</h3>
          <ul>
            <li><strong>Riwayat perubahan:</strong> buka menu <strong>Audit Admin</strong>, lalu cari tindakan, waktu, dan Admin yang melakukannya.</li>
            <li><strong>Data sedang diedit:</strong> buka <strong>Lock Aktif</strong>. Hubungi editor sebelum memakai tindakan paksa.</li>
            <li><strong>Submission tidak dapat diubah:</strong> periksa apakah data diarsipkan, sedang dikunci, atau sudah berubah sejak terakhir dibuka.</li>
            <li><strong>Tindakan Produk tertahan:</strong> buka kolom <strong>Penggunaan</strong> dan selesaikan keterkaitan yang ditampilkan aplikasi.</li>
          </ul>
          <div className="guide-warning"><strong>Hati-hati</strong><p><strong>Paksa Lepas Lock</strong> dapat menghentikan hak simpan editor yang masih bekerja. Gunakan hanya setelah memastikan editor tidak lagi mengubah data.</p></div>
        </section>
      </article>
    </main>
  );
}
