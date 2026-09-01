import Link from "next/link";
import { redirect } from "next/navigation";
import GuideSearch from "../../components/GuideSearch";
import GuideUpdatesSection from "../../components/GuideUpdatesSection";
import { formatGuideDate, getLatestGuideUpdate } from "../../lib/guide-updates";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Panduan Super Admin | Aloptama Collect",
  description: "Panduan lengkap pekerjaan operasional Super Admin Aloptama Collect.",
};

const adminTaskGroups = [
  {
    title: "Pengisian",
    tasks: [
      ["Memahami dashboard", "#dashboard", "Baca kondisi umum aplikasi dan buka pekerjaan yang perlu ditangani."],
      ["Melihat progres Stasiun", "#stasiun-pengisian", "Cari Stasiun, Site, Subtipe, dan status pengisiannya."],
      ["Mencari atau mengedit Submission", "#submission", "Periksa data aktif, arsip, progres, dan isi perangkat."],
      ["Menangani lock dan akun", "#lock", "Bantu pengguna yang terkunci atau tidak dapat masuk."],
    ],
  },
  {
    title: "Produk",
    tasks: [
      ["Memeriksa usulan Produk", "#qc-produk", "Setujui, gabungkan, atau tolak proposal berdasarkan data yang benar."],
      ["Mengelola Master Produk", "#master-produk", "Cari, filter, urutkan, tambah, edit, dan ubah status Produk."],
      ["Mengecek penggunaan Produk", "#penggunaan-produk", "Periksa item, Site, Submission, QC, Alias, dan arsip."],
      ["Memindahkan referensi", "#pindahkan-referensi", "Perbaiki beberapa item yang menunjuk Produk yang salah."],
      ["Menggabungkan Produk", "#menggabungkan-produk", "Satukan Produk ganda tanpa menghilangkan riwayat lama."],
      ["Menonaktifkan atau menghapus", "#produk-tidak-digunakan", "Pilih tindakan paling aman untuk Produk yang tidak dipakai."],
    ],
  },
  {
    title: "Sistem",
    tasks: [
      ["Memeriksa Site dan Subtipe", "#site-subtipe", "Tangani konfigurasi yang tidak sesuai tanpa melewati pengaman."],
      ["Mengunduh data", "#export-admin", "Unduh satu data, seluruh Site, atau seluruh Stasiun."],
      ["Melihat Audit Admin", "#audit-admin", "Telusuri tindakan penting beserta pelaku dan waktunya."],
      ["Mengatasi masalah", "#troubleshooting", "Temukan tindakan aman untuk error dan konflik yang umum."],
    ],
  },
] as const;

const troubleshooting = [
  {
    title: "Tidak bisa login Super Admin",
    seen: "Username atau password ditolak, muncul Konfigurasi login belum tersedia, atau setelah masuk tidak terbuka Dashboard Admin.",
    cause: "Credential salah, akun Super Admin tidak aktif, konfigurasi layanan login belum tersedia, atau koneksi sedang bermasalah.",
    action: "Periksa penulisan username dan password, lalu coba lagi setelah koneksi stabil. Pastikan akun memang terdaftar sebagai Super Admin aktif. Jika konfigurasi belum tersedia, hubungi pengelola aplikasi.",
    caution: "Jangan memakai akun Stasiun untuk mencoba membuka halaman Admin dan jangan membagikan credential Admin.",
  },
  {
    title: "Dashboard atau halaman gagal dimuat",
    seen: "Angka menjadi kosong, daftar tidak tampil, atau muncul pesan gagal memuat.",
    cause: "Koneksi atau layanan data sedang terganggu.",
    action: "Klik Muat ulang. Jika hanya satu menu bermasalah, coba buka menu lain lalu kembali setelah koneksi stabil.",
    caution: "Jangan menjalankan perubahan berulang ketika hasil tindakan sebelumnya belum jelas.",
  },
  {
    title: "Stasiun atau Site tidak ditemukan",
    seen: "Pencarian Master Pengisian tidak menemukan Stasiun atau Site yang diharapkan.",
    cause: "Kata pencarian tidak cocok, master belum benar, atau relasi Site ke Stasiun berbeda.",
    action: "Kosongkan pencarian, cari dengan sebagian nama Stasiun/Site, lalu periksa Tipe Site dan Subtipe pada baris yang tersedia.",
    caution: "Jangan membuat Submission pengganti sebelum memastikan master Site yang benar.",
  },
  {
    title: "Submission tidak bisa dibuka atau diubah",
    seen: "Buka gagal, Edit sebagai Admin tidak aktif, atau data hanya dapat dilihat.",
    cause: "Submission sedang dikunci, sudah diarsipkan, berubah sejak dibuka, atau konfigurasi Site-Subtipe tidak sesuai.",
    action: "Periksa tab Aktif/Diarsipkan, Lock Aktif, dan pesan pada form. Muat ulang sebelum mencoba lagi.",
    caution: "Jangan menghapus Submission untuk mengatasi masalah buka atau edit.",
  },
  {
    title: "Konfigurasi Site sedang diperbarui",
    seen: "Form menahan pengisian karena Subtipe lama tidak lagi sesuai dengan Site.",
    cause: "Submission aktif atau historis memakai konfigurasi yang berbeda dari master Site sekarang.",
    action: "Periksa Site, Tipe Site, Subtipe yang tersedia, dan Submission terkait. Tentukan penyebab sebelum menyiapkan remediasi data.",
    caution: "Jangan melewati pengaman atau mengganti master hanya untuk menghilangkan pesan.",
  },
  {
    title: "Data sedang diedit atau lock aktif",
    seen: "Submission tampil pada Lock Aktif atau form menunjukkan editor lain.",
    cause: "Sesi lain masih mempunyai hak edit dan aktivitasnya masih dianggap aktif.",
    action: "Hubungi operator. Minta pengguna menyimpan dan klik Selesai Mengedit. Gunakan Paksa Lepas Lock atau Ambil Alih sebagai Admin hanya bila editor benar-benar sudah berhenti.",
    caution: "Jangan memaksa lepas atau mengambil alih saat operator masih mengubah data.",
  },
  {
    title: "Data berubah sejak dibuka",
    seen: "Muncul pesan versi server lebih baru atau tindakan dibatalkan karena data berubah.",
    cause: "Pengguna atau Admin lain telah menyimpan perubahan setelah data dibuka.",
    action: "Klik Muat versi terbaru atau muat ulang daftar, periksa perubahan terbaru, lalu ulangi tindakan bila masih diperlukan.",
    caution: "Jangan mengandalkan data lama yang masih terlihat pada dialog.",
  },
  {
    title: "QC tidak menemukan konteks",
    seen: "Tampil Konteks submission tidak tersedia atau Kategori tidak ditemukan pada submission aktif.",
    cause: "Submission terkait tidak tersedia atau proposal tidak lagi ditemukan pada inventaris aktif.",
    action: "Periksa Stasiun dan Submission terkait. Gunakan Merk/Tipe serta bukti lapangan; konteks kosong bukan alasan otomatis untuk menyetujui atau menolak.",
    caution: "Jangan menebak identitas Produk hanya dari Kategori.",
  },
  {
    title: "Proposal sudah diproses Admin lain",
    seen: "Proposal dilewati atau statusnya berubah ketika Approve, Merge, atau Tolak dijalankan.",
    cause: "Admin lain lebih dahulu menyelesaikan proposal yang sama.",
    action: "Baca status dan nama pemeriksa terbaru, lalu muat ulang tab QC. Pada bulk merge, periksa berapa proposal yang berhasil dan berapa yang dilewati.",
    caution: "Jangan mencoba mengulang tindakan tanpa memeriksa hasil terbaru.",
  },
  {
    title: "Produk tidak muncul",
    seen: "Produk yang dicari tidak terlihat pada Master Produk atau pilihan target.",
    cause: "Filter awal hanya Aktif, filter Sumber masih terpasang, Produk berstatus Nonaktif/Digabungkan, atau target harus Produk aktif.",
    action: "Ubah Status ke Semua status, kosongkan filter Sumber, dan cari kembali dengan Merk atau Tipe. Untuk target Move/Merge, aktifkan Produk yang memang layak dipakai.",
    caution: "Jangan membuat Produk baru sebelum memastikan Produk lama bukan sekadar tersembunyi oleh filter.",
  },
  {
    title: "Status Produk tidak dapat diubah",
    seen: "Aktifkan atau Nonaktifkan gagal, atau tombol tidak tersedia.",
    cause: "Produk sudah Digabungkan, sudah berubah, atau tidak lagi tersedia.",
    action: "Muat ulang daftar dan periksa Status serta tujuan penggabungannya. Produk Digabungkan hanya menyediakan Lihat Riwayat.",
    caution: "Jangan mencoba mengaktifkan kembali Produk yang sudah menjadi jejak penggabungan.",
  },
  {
    title: "Pindahkan Referensi gagal",
    seen: "Pemindahan dibatalkan dan tidak ada item yang berubah.",
    cause: "Submission berubah, sedang diedit, diarsipkan, item tidak lagi cocok, atau Produk tujuan sudah nonaktif.",
    action: "Muat ulang tab Referensi, pilih ulang item yang masih dapat dicentang, lalu pilih Produk tujuan aktif.",
    caution: "Jangan melepas lock hanya agar pemindahan dapat dipaksa saat pengguna masih bekerja.",
  },
  {
    title: "Gabungkan Produk gagal",
    seen: "Ringkasan tidak siap atau Merge dibatalkan.",
    cause: "Ada Submission aktif yang sedang diedit, data berubah, nama alternatif bertabrakan, target nonaktif, atau sumber sudah digabungkan.",
    action: "Baca pesan dialog, selesaikan lock atau benturan nama, lalu buka ulang Gabungkan untuk mendapatkan ringkasan terbaru.",
    caution: "Jangan memilih target lain hanya untuk melewati peringatan tanpa memastikan kedua Produk sama.",
  },
  {
    title: "Produk tidak bisa Hapus Permanen",
    seen: "Dialog menampilkan Produk belum dapat dihapus permanen.",
    cause: "Produk masih aktif atau masih memiliki item, Site, Submission, QC, Alias, arsip, atau hubungan penggabungan.",
    action: "Klik Lihat Keterkaitan. Pertahankan Produk sebagai Nonaktif bila riwayatnya masih diperlukan.",
    caution: "Jangan menghapus data terkait hanya untuk membuat Produk memenuhi syarat hapus.",
  },
  {
    title: "Nama atau Alias bertabrakan",
    seen: "Tambah, Edit, atau Merge ditolak karena Produk/nama alternatif sudah dimiliki Produk lain.",
    cause: "Merk dan Tipe yang setara sudah tersedia atau Alias akan menjadi ambigu.",
    action: "Cari Produk dengan Status Semua status, periksa Alias dan riwayat penggabungan, lalu pilih Produk yang sudah menjadi tujuan utama.",
    caution: "Jangan mengubah ejaan sedikit saja untuk membuat duplikat baru.",
  },
  {
    title: "Unduhan Admin gagal",
    seen: "Unduh atau Bulk Download tidak menghasilkan file.",
    cause: "Relasi master tidak lengkap, Site tidak memiliki Subtipe valid, atau koneksi terputus saat data disiapkan.",
    action: "Periksa pilihan Stasiun, Site, dan Subtipe. Muat ulang master lalu coba kembali dengan lingkup yang lebih kecil.",
    caution: "Jangan menganggap file kosong sebagai bukti bahwa tidak ada data sebelum memeriksa pesan hasil unduhan.",
  },
] as const;

const faqs = [
  ["Apa beda Nonaktifkan dan Hapus Permanen?", "Nonaktifkan menyembunyikan Produk dari pengisian baru tetapi mempertahankan data. Hapus Permanen menghilangkan Produk dan tidak dapat dipulihkan melalui aplikasi.", "#produk-tidak-digunakan"],
  ["Apa beda Pindahkan Referensi dan Gabungkan Produk?", "Pindahkan Referensi hanya mengarahkan referensi yang dipilih. Gabungkan menyatakan seluruh Produk sumber sama dengan Produk tujuan.", "#move-vs-merge"],
  ["Kenapa Produk dengan 0 referensi belum tentu bisa dihapus?", "Produk mungkin masih terkait dengan QC, Alias, arsip, atau hubungan penggabungan.", "#produk-tidak-digunakan"],
  ["Kenapa Produk Digabungkan masih terlihat?", "Produk sumber dipertahankan sebagai riwayat dan menunjukkan Produk tujuan yang sekarang digunakan.", "#menggabungkan-produk"],
  ["Bagaimana kalau Produk yang dicari tidak muncul?", "Ubah Status ke Semua status, periksa filter Sumber, lalu cari kembali. Target pemindahan dan penggabungan harus Produk aktif.", "#master-produk"],
  ["Apa fungsi Alias?", "Alias menyimpan nama alternatif agar penulisan lama tetap membantu pencarian dan rekomendasi ke Produk yang benar.", "#alias-riwayat"],
  ["Kapan proposal QC disetujui, digabungkan, atau ditolak?", "Setujui untuk Produk baru yang valid, Merge jika Produk sebenarnya sudah ada, dan Tolak untuk usulan yang salah atau tidak layak.", "#qc-produk"],
  ["Kenapa Submission sedang terkunci?", "Sesi lain sedang mengedit kombinasi Site dan Subtipe tersebut atau belum menyelesaikan editnya.", "#lock"],
  ["Bagaimana melihat data yang sudah diarsipkan?", "Buka Stasiun & Pengisian, tab Submission, lalu pilih Diarsipkan.", "#submission"],
  ["Kenapa hanya Produk Aktif yang tampil pertama kali?", "Master Produk menggunakan filter Status Aktif sebagai tampilan awal. Pilih Nonaktif, Digabungkan, atau Semua status untuk melihat yang lain.", "#master-produk"],
] as const;

const glossary = [
  ["Submission", "Satu data pengisian untuk kombinasi Site dan Subtipe."],
  ["Site", "Lokasi atau sistem/peralatan utama milik Stasiun."],
  ["Subtipe", "Bagian Site yang menentukan profil dan kategori peralatan."],
  ["Produk", "Pasangan Merk dan Tipe yang digunakan oleh item inventaris."],
  ["Proposal Produk", "Usulan Produk dari pengguna Stasiun yang perlu diperiksa Admin."],
  ["QC Produk", "Proses memeriksa proposal lalu menyetujui, menggabungkan, atau menolaknya."],
  ["Alias", "Nama alternatif yang mengarah ke Produk utama yang sama."],
  ["Referensi", "Item inventaris langsung dan hasil QC yang diarahkan ke sebuah Produk."],
  ["Dependency/Penggunaan", "Seluruh keterkaitan yang membuat Produk masih dibutuhkan atau harus dipertahankan."],
  ["Nonaktif", "Produk biasa yang tidak ditawarkan untuk pengisian baru tetapi masih disimpan."],
  ["Digabungkan", "Produk lama yang sudah diarahkan ke Produk tujuan dan dipertahankan sebagai riwayat."],
  ["Arsip", "Submission lama yang disimpan di luar daftar pengisian aktif dan dapat dipulihkan."],
  ["Audit", "Catatan tindakan penting Admin beserta waktu, pelaku, target, dan rincian terkait."],
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

      <article id="admin-guide-content" className="guide-content">
        <p className="kicker">PANDUAN SUPER ADMIN</p>
        <h2>Kelola pengisian dan Produk dengan memahami langkah serta akibatnya.</h2>
        <p className="guide-lead">Mulai dari pekerjaan yang ingin dilakukan. Periksa dampak sebelum menjalankan tindakan yang mengubah banyak data.</p>
        {latest && <p className="guide-version-meta">Terakhir diperbarui: <strong>{formatGuideDate(latest.date)}</strong><span>Versi panduan {latest.version}</span></p>}
        <GuideSearch audience="admin" rootId="admin-guide-content" />

        <nav className="guide-task-nav" aria-labelledby="admin-guide-tasks">
          <h3 id="admin-guide-tasks">Mau melakukan apa?</h3>
          {adminTaskGroups.map((group) => (
            <div className="guide-task-group" key={group.title}>
              <h4>{group.title}</h4>
              <div className="guide-task-grid">
                {group.tasks.map(([label, href, description]) => <a key={label} href={href}><strong>{label}</strong><span>{description}</span></a>)}
              </div>
            </div>
          ))}
        </nav>

        <section id="mulai-di-sini" className="guide-article guide-start-section" data-guide-keywords="panduan awal, mulai super admin">
          <p className="guide-section-label">MULAI DI SINI</p>
          <h3>Baru pertama kali menjadi Super Admin?</h3>
          <p>Super Admin digunakan untuk memantau pengisian, membantu memperbaiki Submission, memeriksa proposal Produk, dan menjaga Master Produk.</p>
          <ul>
            <li>Jika hanya ingin melihat, gunakan daftar, detail, atau <strong>Penggunaan Produk</strong>.</li>
            <li>Jika ingin memperbaiki pengisian, buka Submission lalu klik <strong>Edit sebagai Admin</strong>.</li>
            <li>Jika masalahnya Produk, periksa <strong>Penggunaan</strong> dan riwayatnya terlebih dahulu.</li>
            <li>Jika Produk tidak dipakai lagi, utamakan <strong>Nonaktifkan</strong>, bukan <strong>Hapus Permanen</strong>.</li>
          </ul>
          <p>Masuk melalui halaman login yang sama menggunakan akun Super Admin. Setelah berhasil, aplikasi membuka Dashboard Admin secara otomatis. Klik <strong>Keluar</strong> setelah pekerjaan selesai.</p>
        </section>

        <section id="dashboard" className="guide-article" data-guide-keywords="dashboard, ringkasan, progress, progres">
          <p className="guide-section-label">RINGKASAN</p>
          <h3>Bagaimana memahami halaman Super Admin?</h3>
          <p>Gunakan <strong>Ringkasan</strong> untuk melihat keadaan umum sebelum masuk ke detail. Kartu dapat diklik untuk menuju pekerjaan terkait.</p>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Stasiun aktif</dt><dd>Jumlah Stasiun yang saat ini aktif pada master.</dd></div>
            <div><dt>Akun aktif</dt><dd>Jumlah akun Stasiun yang masih dapat digunakan untuk masuk.</dd></div>
            <div><dt>Site</dt><dd>Jumlah Site unik, dengan rincian tambahan pada Site berdasarkan Tipe Site.</dd></div>
            <div><dt>Produk</dt><dd>Jumlah seluruh Produk yang tersimpan pada Master Produk.</dd></div>
            <div><dt>Submission</dt><dd>Jumlah Submission aktif yang sedang digunakan.</dd></div>
            <div><dt>Lock aktif</dt><dd>Jumlah data yang masih mempunyai sesi edit aktif.</dd></div>
            <div><dt>QC Pending, Approved, Merged, Rejected</dt><dd>Jumlah proposal pada masing-masing hasil pemeriksaan.</dd></div>
          </dl>
          <h4>Ringkasan Monitoring Pengisian</h4>
          <p>Bagian ini merangkum Stasiun berdasarkan kondisi pengisian: <strong>Belum Dimulai</strong>, <strong>Terisi &lt;50%</strong>, <strong>Terisi 50–99%</strong>, dan <strong>Lengkap</strong>. <strong>Tidak Dinilai</strong> ditampilkan sebagai informasi sekunder bila progress tidak dapat dihitung.</p>
          <p>Klik kartu kondisi untuk membuka <strong>Stasiun &amp; Pengisian</strong> dengan filter yang sesuai. Kartu <strong>Site berdasarkan Tipe Site</strong> juga dapat diklik untuk membuka daftar Stasiun yang memiliki Tipe Site tersebut.</p>
          <p>Progress hanya menghitung kategori yang memang menjadi target pengisian. <strong>Gudang</strong> tetap tidak dinilai dalam completeness; persentase pada kartu Gudang menunjukkan proporsi Stasiun yang sudah memiliki Submission Gudang.</p>
          <p>Klik <strong>Muat ulang</strong> bila ingin mengambil kondisi terbaru. Menu samping menggunakan link sehingga halaman dapat dibuka di tab baru, di-bookmark, dan dipertahankan setelah refresh.</p>
        </section>

        <section id="stasiun-pengisian" className="guide-article" data-guide-keywords="progress stasiun, progres pengisian, master pengisian">
          <p className="guide-section-label">STASIUN DAN PENGISIAN</p>
          <h3>Bagaimana melihat progres satu Stasiun?</h3>
          <ol>
            <li>Buka menu <strong>Stasiun &amp; Pengisian</strong>.</li>
            <li>Pilih tab <strong>Master Pengisian</strong>.</li>
            <li>Cari nama Stasiun, Site, Tipe Site, atau Subtipe.</li>
            <li>Gunakan filter <strong>Jenis Stasiun</strong> untuk memilih Meteorologi, Klimatologi, Geofisika, Balai, atau Pusat.</li>
            <li>Pilih <strong>Tipe Site</strong>. Pilihan ini mengikuti Jenis Stasiun yang dipilih.</li>
            <li>Buka baris Stasiun untuk melihat jumlah Site dan Submission.</li>
            <li>Periksa kolom Site, Tipe Site, Subtipe, Status, Versi, dan Terakhir Simpan.</li>
            <li>Buka menu <strong>Aksi</strong>, lalu pilih <strong>Buka</strong> atau <strong>Unduh</strong>.</li>
          </ol>
          <p>Filter <strong>Kondisi Pengisian</strong> membantu menemukan Belum Dimulai, Terisi &lt;50%, Terisi 50–99%, atau Lengkap. Pilihan <strong>Reset</strong> mengembalikan semua filter ke keadaan awal.</p>
          <p><strong>Sudah ada data</strong> berarti kombinasi Site-Subtipe mempunyai Submission aktif. <strong>Belum ada submission</strong> berarti master tersedia tetapi belum ada data pengisian.</p>
          <p>Jumlah Site menghitung Site utama, bukan jumlah Subtipe. Karena itu satu Site AWOS dengan beberapa Subtipe tetap dihitung sebagai satu Site.</p>
        </section>

        <section id="submission" className="guide-article" data-guide-keywords="submission, arsip, pulihkan, restore, hapus submission">
          <p className="guide-section-label">SUBMISSION</p>
          <h3>Bagaimana mencari, membuka, dan memperbaiki Submission?</h3>
          <p><strong>Submission</strong> adalah satu data pengisian untuk kombinasi Site dan Subtipe. <strong>Aktif</strong> adalah data yang dipakai sekarang; <strong>Diarsipkan</strong> adalah data lama yang disimpan sebagai riwayat.</p>
          <h4>Mencari dan memeriksa</h4>
          <ol>
            <li>Pada <strong>Stasiun &amp; Pengisian</strong>, pilih tab <strong>Submission</strong>.</li>
            <li>Pilih <strong>Aktif</strong> atau <strong>Diarsipkan</strong>.</li>
            <li>Cari Stasiun, Site, Subtipe, atau Operator.</li>
            <li>Gunakan filter Jenis Stasiun, Tipe Site, dan konteks QC bila sedang melihat PENDING.</li>
            <li>Klik judul kolom untuk mengurutkan Stasiun, Site, Tipe Site, Subtipe, Progres, Versi, Operator, atau Terakhir Diperbarui.</li>
            <li>Atur <strong>Baris per halaman</strong>, lalu gunakan <strong>Sebelumnya</strong> dan <strong>Berikutnya</strong>.</li>
            <li>Klik baris untuk melihat kategori, item, versi, waktu simpan, QC Pending, dan alasan arsip.</li>
          </ol>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Kosong</dt><dd>Belum ada kategori target yang terisi.</dd></div>
            <div><dt>Terisi Sebagian</dt><dd>Sudah ada kategori target yang terisi, tetapi belum seluruhnya.</dd></div>
            <div><dt>Lengkap</dt><dd>Seluruh kategori target pada profil sudah terisi.</dd></div>
            <div><dt>Gudang</dt><dd>Persentase pada Ringkasan menunjukkan proporsi Stasiun yang sudah memiliki Submission Gudang, bukan persentase kelengkapan kategori.</dd></div>
            <div><dt>Belum terpetakan</dt><dd>Profil belum menyediakan target kategori untuk menghitung progress.</dd></div>
          </dl>
          <h4>Membuka dan mengedit</h4>
          <ol>
            <li>Klik <strong>Buka</strong> untuk membuka form lengkap dalam mode lihat.</li>
            <li>Periksa Stasiun, Site, Tipe Site, Subtipe, metadata, kategori, Produk, dan Unit.</li>
            <li>Jika koreksi diperlukan, klik <strong>Edit sebagai Admin</strong>.</li>
            <li>Ubah data yang memang perlu diperbaiki, lalu tunggu penyimpanan atau klik <strong>Simpan</strong>.</li>
            <li>Klik <strong>Selesai Mengedit</strong> agar perubahan terakhir tersimpan dan lock dilepas.</li>
          </ol>
          <p>Admin juga dapat membuka kombinasi yang belum memiliki data dari Master Pengisian. Submission baru dibuat saat Admin benar-benar memulai Edit sebagai Admin, bukan saat hanya membuka atau mengunduh.</p>
          <h4>Mengarsipkan dan memulihkan</h4>
          <p>Klik <strong>Arsipkan Submission</strong>, isi alasan bila perlu, lalu konfirmasi. Data hilang dari daftar Aktif tetapi tetap tersedia pada tab Diarsipkan. Klik <strong>Pulihkan Submission</strong> untuk mengembalikannya dengan isi dan versi yang sama.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Jangan mengarsipkan hanya untuk menyembunyikan error. Submission yang masih dikunci tidak dapat diarsipkan. Pastikan alasan dan data pengganti sudah jelas.</p></div>
          <h4>Hapus Permanen Submission</h4>
          <p>Zona Berbahaya menyediakan <strong>Hapus Permanen</strong> untuk Submission yang tidak sedang dikunci. Tindakan meminta Anda mengetik <strong>HAPUS</strong> dan tidak dapat dipulihkan.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Utamakan Arsip untuk mempertahankan riwayat. Gunakan Hapus Permanen hanya setelah memastikan data memang tidak boleh dipertahankan. Aplikasi tidak menetapkan pihak pemberi persetujuan; ikuti ketentuan internal yang berlaku.</p></div>
        </section>

        <section id="lock" className="guide-article" data-guide-keywords="lock, data terkunci, tidak bisa edit, data dipakai orang lain, paksa lepas">
          <p className="guide-section-label">LOCK AKTIF</p>
          <h3>Bagaimana menangani data yang sedang diedit?</h3>
          <p>Lock berarti satu sesi sedang mempunyai hak untuk mengubah Submission. Menu <strong>Lock Aktif</strong> menampilkan Stasiun, Site/Subtipe, Operator, potongan identitas sesi, dan durasi sejak aktivitas terakhir.</p>
          <ol>
            <li>Periksa nama Operator dan durasi aktivitas.</li>
            <li>Hubungi operator agar menyimpan dan klik <strong>Selesai Mengedit</strong>.</li>
            <li>Klik <strong>Muat ulang</strong> untuk memeriksa apakah lock sudah hilang.</li>
            <li>Gunakan <strong>Paksa Lepas Lock</strong> hanya bila editor benar-benar sudah berhenti.</li>
          </ol>
          <p>Lock aktif dihitung dari aktivitas dalam lima menit terakhir. Lock lama dapat kedaluwarsa otomatis. Saat membuka form sebagai Admin, <strong>Ambil Alih sebagai Admin</strong> juga tersedia bila tindakan segera memang diperlukan.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Paksa Lepas Lock atau Ambil Alih sebagai Admin dapat memutus hak simpan editor lain. Jangan gunakan ketika pengguna masih bekerja.</p></div>
        </section>

        <section id="akun-stasiun" className="guide-article" data-guide-keywords="akun, provision, reset password, lupa password, credential">
          <p className="guide-section-label">AKUN STASIUN</p>
          <h3>Bagaimana membuat dan mengelola akun Stasiun?</h3>
          <p>Menu <strong>Akun Stasiun</strong> menampilkan nama Stasiun, Username, Status, dan Aksi. Cari menggunakan nama Stasiun atau Username.</p>
          <ul>
            <li><strong>Provision akun:</strong> membuat akun untuk Stasiun yang berstatus Belum ada akun.</li>
            <li><strong>Nonaktifkan:</strong> menghentikan akses masuk tanpa menghapus akun.</li>
            <li><strong>Aktifkan:</strong> mengembalikan akses akun yang sebelumnya dinonaktifkan.</li>
            <li><strong>Reset Password:</strong> membuat password sementara baru dan langsung membuat password lama tidak berlaku.</li>
          </ul>
          <p>Setelah Provision atau Reset Password, dialog menampilkan Username dan Password baru. Gunakan tombol mata bila perlu, lalu klik <strong>Salin Password</strong>. Password hanya dapat dilihat selama dialog tersebut masih terbuka.</p>
          <div className="guide-note"><strong>Keamanan credential</strong><p>Kirim password hanya kepada petugas yang berwenang. Aplikasi tidak menetapkan kanal pengiriman resmi; ikuti ketentuan internal yang berlaku. Jangan mengirim daftar password ke grup umum, menaruhnya pada Catatan Submission, atau menyimpannya di file ekspor.</p></div>
        </section>

        <section id="qc-produk" className="guide-article" data-guide-keywords="qc, approve, approve baru, merge qc, tolak proposal, pemeriksaan produk">
          <p className="guide-section-label">QC PRODUK</p>
          <h3>Bagaimana memeriksa proposal Produk?</h3>
          <p>QC Produk digunakan ketika pengguna Stasiun mengusulkan Merk dan Tipe yang belum ditemukan. Tab statusnya adalah <strong>PENDING</strong>, <strong>APPROVED</strong>, <strong>MERGED</strong>, dan <strong>REJECTED</strong>.</p>
          <ol>
            <li>Buka menu <strong>QC Produk</strong> dan pilih <strong>PENDING</strong>.</li>
            <li>Cari berdasarkan Brand, Tipe, Stasiun, Site, Subtipe, atau Kategori.</li>
            <li>Periksa usulan, operator, tanggal, serta konteks Site/Subtipe/Kategori.</li>
            <li>Cari Produk serupa sebelum menentukan hasil.</li>
            <li>Pilih Approve Baru, Merge, atau Tolak.</li>
          </ol>
          <p>Konteks membantu memahami asal proposal, tetapi Kategori tidak otomatis menentukan bahwa identitas Produk benar atau salah.</p>
          <h4>Kapan memilih Approve Baru?</h4>
          <p>Gunakan <strong>Approve Baru</strong> jika Merk dan Tipe memang merupakan Produk baru yang valid. Periksa Brand dan Tipe utama, isi Catatan pemeriksaan bila perlu, lalu konfirmasi. Produk aktif baru dibuat dengan Sumber <strong>QC Produk</strong>, sedangkan nama usulan disimpan sebagai Alias.</p>
          <h4>Kapan memilih Merge?</h4>
          <p>Gunakan <strong>Merge</strong> jika usulan sebenarnya sama dengan Produk yang sudah ada. Centang proposal, pilih Produk existing tujuan, periksa rekomendasi atau cari manual, isi Catatan bila perlu, lalu klik <strong>Gabungkan Semua</strong>.</p>
          <p>Rekomendasi hanya membantu menemukan Produk mirip. Admin tetap menentukan tujuan yang benar.</p>
          <h4>Kapan memilih Tolak?</h4>
          <p>Gunakan <strong>Tolak</strong> jika usulan salah atau tidak layak dan tidak dapat diselesaikan dengan Merge. Alasan penolakan wajib diisi agar pengguna Stasiun dapat memperbaiki data.</p>
          <h4>Bulk merge dan beberapa Admin</h4>
          <p>Centang beberapa proposal yang benar-benar menuju Produk yang sama. Jika pilihan terlihat berasal dari Merk/Tipe berbeda, aplikasi menampilkan peringatan. Bila Admin lain sudah memproses sebagian proposal, proposal yang masih PENDING tetap dapat berhasil sedangkan yang sudah berubah dilewati dan dilaporkan.</p>
          <p>Tab hasil menampilkan Produk tujuan, Catatan QC, pemeriksa, dan waktu pemeriksaan. Tindakan pertama yang selesai menjadi hasil resmi; Admin berikutnya akan melihat konflik, bukan menimpa hasil tersebut.</p>
          <h4>Perbaikan Produk hasil QC</h4>
          <p>Untuk memperbaiki Merk atau Tipe Produk setelah QC, buka menu <strong>Produk</strong> lalu pilih <strong>Edit</strong>. Produk tetap sama, nama sebelumnya disimpan sebagai nama alternatif, dan tindakan tercatat pada Audit Admin.</p>
          <p>Gunakan <strong>Gabungkan</strong> di menu Produk bila dua Produk ternyata mewakili Produk yang sama. Jangan gunakan Edit untuk menyatukan dua Produk.</p>
        </section>

        <section id="master-produk" className="guide-article" data-guide-keywords="master produk, daftar produk, tambah produk, edit produk, filter produk">
          <p className="guide-section-label">MASTER PRODUK</p>
          <h3>Bagaimana mengelola daftar Produk?</h3>
          <p>Menu <strong>Produk</strong> menampilkan Merk, Tipe, Status, Sumber, Penggunaan, dan Aksi. Tampilan awal memakai Status <strong>Aktif</strong>.</p>
          <h4>Mencari, memfilter, dan mengurutkan</h4>
          <ul>
            <li>Cari menggunakan Merk atau Tipe.</li>
            <li>Filter Status: Aktif, Nonaktif, Digabungkan, atau Semua status.</li>
            <li>Filter Sumber berdasarkan nilai yang tersedia, misalnya QC Produk, Admin, atau Legacy Spreadsheet.</li>
            <li>Klik Merk, Tipe, Status, Sumber, atau Penggunaan untuk mengurutkan naik/turun. Penggunaan diurutkan sebagai jumlah.</li>
            <li>Atur Baris per halaman ke 50, 100, 200, 500, 1000, atau Custom antara 10-1000.</li>
          </ul>
          <h4>Memahami Status</h4>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Aktif</dt><dd>Tersedia untuk dipilih pada pengisian baru.</dd></div>
            <div><dt>Nonaktif</dt><dd>Tidak ditawarkan untuk pengisian baru, tetapi data dan riwayatnya tetap ada.</dd></div>
            <div><dt>Digabungkan</dt><dd>Produk lama yang sudah diarahkan ke Produk lain dan hanya menyediakan Lihat Riwayat.</dd></div>
          </dl>
          <h4>Tambah Produk</h4>
          <p>Klik <strong>Tambah Produk</strong>, isi <strong>Merk</strong> dan <strong>Tipe</strong>, lalu klik Tambah Produk. Sumber ditetapkan otomatis sebagai <strong>Admin</strong>. Produk dengan Merk/Tipe yang sama akan ditolak.</p>
          <h4>Edit Produk</h4>
          <p>Klik <strong>Edit</strong>, perbaiki Merk/Tipe, lalu klik <strong>Simpan Perubahan</strong>. Produk tetap sama dan nama sebelumnya disimpan sebagai Alias. Produk berstatus Digabungkan tidak dapat diedit.</p>
          <div className="guide-example"><strong>Pilih tindakan yang tepat</strong><p>Salah ketik pada satu Produk: Edit. Beberapa item memilih Produk yang salah: Pindahkan Referensi. Dua Produk sebenarnya sama: Gabungkan.</p></div>
        </section>

        <section id="penggunaan-produk" className="guide-article" data-guide-keywords="penggunaan produk, dependency, keterkaitan, 0 referensi, referensi produk">
          <p className="guide-section-label">PENGGUNAAN PRODUK</p>
          <h3>Bagaimana mengecek Produk masih digunakan atau tidak?</h3>
          <ol>
            <li>Cari Produk pada menu <strong>Produk</strong>.</li>
            <li>Klik angka <strong>N referensi</strong> pada kolom Penggunaan.</li>
            <li>Periksa tab <strong>Dependency</strong>, <strong>Referensi</strong>, <strong>QC History</strong>, dan <strong>Alias</strong>.</li>
          </ol>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Item langsung</dt><dd>Item inventaris aktif yang langsung memilih Produk tersebut.</dd></div>
            <div><dt>Site terkait</dt><dd>Jumlah Site aktif dengan item langsung atau hasil QC yang diarahkan ke Produk.</dd></div>
            <div><dt>Submission terkait</dt><dd>Jumlah Submission aktif dengan item langsung atau hasil QC yang diarahkan ke Produk.</dd></div>
            <div><dt>Hasil QC terkait</dt><dd>Proposal yang telah diselesaikan dan diarahkan ke Produk.</dd></div>
            <div><dt>Alias produk</dt><dd>Nama alternatif yang mengarah ke Produk.</dd></div>
            <div><dt>Referensi arsip</dt><dd>Penggunaan pada Submission yang sudah diarsipkan.</dd></div>
          </dl>
          <p className="guide-direct-answer"><strong>Item langsung = 0 tidak selalu berarti Produk tidak digunakan.</strong> QC, Alias, arsip, dan hubungan penggabungan juga dapat membuat Produk harus dipertahankan.</p>
          <h4>Tab Referensi</h4>
          <p>Tab ini berisi item inventory yang langsung menunjuk Produk dan hasil QC APPROVED atau MERGED yang diarahkan ke Produk. Setiap baris menampilkan Stasiun, Site, Tipe Site, dan Subtipe. Referensi yang sedang dikunci tidak dapat dipilih.</p>
          <p>Checkbox paling atas memilih atau membatalkan seluruh referensi yang dapat dipilih pada halaman saat ini. Pilihan dari halaman lain tetap tersimpan. Tanda sebagian berarti hanya beberapa item halaman ini yang dipilih. Klik <strong>Batalkan semua</strong> untuk mengosongkan seluruh pilihan lintas halaman.</p>
        </section>

        <section id="pindahkan-referensi" className="guide-article" data-guide-keywords="pindahkan, move, produk salah, perbaiki referensi">
          <p className="guide-section-label">PINDAHKAN REFERENSI</p>
          <h3>Beberapa item memilih Produk yang salah</h3>
          <ol>
            <li>Buka <strong>Penggunaan Produk</strong> pada Produk sumber.</li>
            <li>Pilih tab <strong>Referensi</strong>.</li>
            <li>Centang referensi langsung atau hasil QC yang ingin diperbaiki, termasuk dari beberapa halaman bila perlu.</li>
            <li>Klik <strong>Pindahkan Referensi</strong>.</li>
            <li>Cari Produk tujuan aktif menggunakan Merk atau Tipe, lalu pilih.</li>
            <li>Periksa jumlah referensi langsung, hasil QC, Site, dan Submission.</li>
            <li>Klik <strong>Pindahkan N Item</strong>.</li>
          </ol>
          <p>Referensi langsung memperbarui Produk pada item terpilih. Hasil QC hanya mengubah Produk tujuan pada proposal; status, catatan, riwayat, Unit, nomor seri, kondisi, tahun, Kategori, dan metadata lainnya tetap.</p>
          <p>Jika salah satu data berubah, diarsipkan, atau sedang diedit, pemindahan dibatalkan dan tidak ada pilihan yang berubah sebagian. Muat ulang Referensi lalu pilih kembali.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Periksa Produk sumber, target, dan seluruh item terpilih. Pindahkan hanya item yang benar-benar salah menunjuk Produk.</p></div>
        </section>

        <section id="menggabungkan-produk" className="guide-article" data-guide-keywords="gabungkan, merge produk, produk sama, produk kembar, duplikat produk">
          <p className="guide-section-label">GABUNGKAN PRODUK</p>
          <h3>Ada dua Produk yang sebenarnya sama</h3>
          <ol>
            <li>Pada menu Produk, cari Produk yang akan menjadi sumber/riwayat.</li>
            <li>Klik <strong>Gabungkan</strong>.</li>
            <li>Periksa <strong>Rekomendasi Produk Tujuan</strong> atau cari Produk lain secara manual.</li>
            <li>Pilih Produk tujuan yang akan dipertahankan.</li>
            <li>Periksa Item, Unit, Site, Submission, dan Alias sumber pada ringkasan.</li>
            <li>Klik <strong>Gabungkan Produk</strong>.</li>
          </ol>
          <p>Semua referensi aktif Produk sumber dipindahkan ke tujuan. Hasil QC terkait juga diarahkan ke Produk tujuan tanpa mengubah proposal, status, catatan, atau riwayat pemeriksaannya. Produk sumber menjadi <strong>Digabungkan</strong>, tidak hilang, dan nama lamanya menjadi Alias tujuan. Submission arsip tidak diubah.</p>
          <p>Jika target yang dipilih ternyata sudah Digabungkan, aplikasi menunjukkan Produk tujuan terakhir yang akan digunakan. Rekomendasi mempertimbangkan Merk, Tipe, dan Alias, tetapi keputusan tetap berada pada Admin.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Gabungkan tidak mempunyai Undo atau Unmerge otomatis. Pastikan sumber dan tujuan memang Produk yang sama, bukan hanya mirip atau digunakan pada Kategori yang sama.</p></div>
          <h4 id="move-vs-merge">Apa beda Pindahkan Referensi dan Gabungkan Produk?</h4>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Pindahkan Referensi</dt><dd>Memperbaiki hanya item yang dicentang. Produk sumber tetap berdiri sendiri.</dd></div>
            <div><dt>Gabungkan Produk</dt><dd>Menyatakan seluruh Produk sumber dan tujuan sebenarnya sama. Semua referensi aktif sumber dialihkan dan sumber menjadi riwayat.</dd></div>
          </dl>
          <div className="guide-example"><strong>Contoh</strong><p>Satu item salah memilih Datalogger CR6: Pindahkan Referensi. Produk Datalogger CR6 dan CR6 ternyata duplikat yang sama: Gabungkan Produk.</p></div>
        </section>

        <section id="produk-tidak-digunakan" className="guide-article" data-guide-keywords="hapus produk, hapus permanen, nonaktifkan, produk tidak dipakai, 0 referensi">
          <p className="guide-section-label">NONAKTIFKAN DAN HAPUS</p>
          <h3>Produk sudah tidak digunakan. Haruskah dihapus?</h3>
          <p className="guide-direct-answer"><strong>Tidak perlu. Sebaiknya cukup Nonaktifkan.</strong></p>
          <h4>Nonaktifkan Produk</h4>
          <p>Klik <strong>Nonaktifkan</strong> jika Produk tidak ingin ditawarkan untuk pengisian baru tetapi data dan riwayatnya masih perlu disimpan. Produk biasa yang Nonaktif dapat diaktifkan kembali. Produk Digabungkan berbeda dan tidak dapat diaktifkan kembali dari daftar.</p>
          <h4>Kapan Hapus Permanen boleh dipertimbangkan?</h4>
          <p>Produk harus sudah Nonaktif dan aplikasi harus memastikan tidak ada:</p>
          <ul>
            <li>item inventaris atau penggunaan Site/Submission aktif;</li>
            <li>hasil QC yang terkait;</li>
            <li>Alias Produk;</li>
            <li>referensi pada Submission arsip;</li>
            <li>Produk lain yang digabungkan ke Produk ini; atau</li>
            <li>status Produk sumber yang sudah Digabungkan.</li>
          </ul>
          <p>Klik <strong>Hapus Permanen</strong> hanya setelah Produk Nonaktif, lalu baca pemeriksaan keterkaitan. Jika diblokir, gunakan <strong>Lihat Keterkaitan</strong>. Setelah keterkaitan berubah, klik <strong>Periksa lagi</strong>. Lanjutkan hanya bila aplikasi menyatakan Produk dapat dihapus.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Hapus Permanen tidak dapat dibatalkan melalui aplikasi. Jangan menghapus QC, Alias, arsip, atau hubungan lain hanya untuk membuat Produk memenuhi syarat.</p></div>
          <p>Produk berstatus <strong>Digabungkan</strong> dipertahankan sebagai jejak sumber. Produk tujuan yang menerima penggabungan juga dilindungi selama masih mempunyai hubungan tersebut.</p>
        </section>

        <section id="alias-riwayat" className="guide-article" data-guide-keywords="alias, nama lain, riwayat produk">
          <p className="guide-section-label">ALIAS DAN RIWAYAT PRODUK</p>
          <h3>Apa fungsi Alias dan Lihat Riwayat?</h3>
          <p><strong>Alias</strong> adalah nama alternatif yang membantu aplikasi menghubungkan penulisan lama atau variasi nama dengan Produk utama yang sama.</p>
          <p>Alias dapat terbentuk ketika proposal QC disetujui atau digabungkan, ketika Merk/Tipe Produk diedit, dan ketika satu Produk digabungkan ke Produk lain. Alias membantu pencarian/rekomendasi Produk pada pengisian dan rekomendasi Merge. Master Produk tetap menampilkan Merk/Tipe utama sebagai nama baris.</p>
          <p>Buka <strong>Penggunaan Produk</strong> lalu tab <strong>Alias</strong> untuk melihat nama alternatif. Tab <strong>QC History</strong> menampilkan proposal, status, pemeriksa, dan Catatan yang diarahkan ke Produk tersebut.</p>
          <p>Untuk Produk berstatus Digabungkan, klik <strong>Lihat Riwayat</strong> untuk melihat Produk tujuan, Dependency, referensi, QC History, dan Alias. Tidak ada tombol pengelolaan Alias manual pada halaman ini.</p>
        </section>

        <section id="site-subtipe" className="guide-article" data-guide-keywords="site subtipe, konfigurasi site, family awos, tipe site">
          <p className="guide-section-label">SITE DAN SUBTIPE</p>
          <h3>Bagaimana menangani Site dan Subtipe yang tidak sesuai?</h3>
          <p><strong>Site</strong> adalah lokasi atau sistem utama, <strong>Tipe Site</strong> adalah kelompoknya, dan <strong>Subtipe</strong> menentukan profil peralatan. Aplikasi hanya menerima Subtipe yang sesuai dengan Site saat ini.</p>
          <p>Untuk AWOS Kategori III, keluarga pada Site menentukan keluarga Subtipe yang diizinkan. Contohnya, Site All Weather tidak boleh memakai Subtipe Coastal. Ini hanya contoh; keluarga Site lain tetap mengikuti master masing-masing.</p>
          <h4>Jika muncul Konfigurasi Site sedang diperbarui</h4>
          <ol>
            <li>Periksa nama Site dan Tipe Site pada Master Pengisian.</li>
            <li>Periksa Submission aktif serta Subtipe yang sedang digunakan.</li>
            <li>Periksa apakah data historis berasal dari konfigurasi lama.</li>
            <li>Jangan melewati pengaman. Tentukan data penyebab sebelum melakukan remediasi terarah.</li>
            <li>Setelah konfigurasi diperbaiki melalui prosedur yang sesuai, muat ulang dan buka kembali form.</li>
          </ol>
          <p>Submission arsip dengan konfigurasi lama dapat tetap dibuka sebagai riwayat. Jangan memulihkan atau mengeditnya sebelum memastikan Site-Subtipe masih sesuai dengan master saat ini.</p>
        </section>

        <section id="export-admin" className="guide-article" data-guide-keywords="csv, json, zip, export, download, unduh data">
          <p className="guide-section-label">UNDUH DATA ADMIN</p>
          <h3>Bagaimana mengunduh satu atau banyak data?</h3>
          <h4>Satu Site-Subtipe</h4>
          <p>Pada Master Pengisian atau detail Submission, klik <strong>Unduh</strong>. Dashboard Admin menghasilkan CSV tanpa mengambil lock atau mengubah Submission.</p>
          <h4>Bulk Download</h4>
          <ol>
            <li>Pada Master Pengisian, klik <strong>Bulk Download</strong>.</li>
            <li>Pilih Stasiun.</li>
            <li>Pilih Semua Site atau satu Site.</li>
            <li>Pilih Semua Subtipe atau satu Subtipe bila Site sudah dipilih.</li>
            <li>Klik <strong>Unduh CSV</strong> untuk satu kombinasi atau <strong>Unduh ZIP</strong> untuk banyak kombinasi.</li>
          </ol>
          <p>Bulk Download menyertakan CSV untuk kombinasi valid yang sudah berisi data dan file default untuk yang belum mempunyai Submission. Pesan hasil menjelaskan jumlah file berisi data dan file default.</p>
          <p>Saat membuka form lengkap, menu Unduh juga menyediakan CSV dan JSON seperti pada Station User. CSV cocok untuk spreadsheet; JSON merupakan salinan data terstruktur.</p>
        </section>

        <section id="audit-admin" className="guide-article" data-guide-keywords="audit, riwayat admin, catatan tindakan, pelaku perubahan">
          <p className="guide-section-label">AUDIT ADMIN</p>
          <h3>Bagaimana membaca riwayat tindakan Admin?</h3>
          <p>Menu <strong>Audit Admin</strong> menampilkan riwayat terbaru dengan kolom Waktu, Admin, Aksi, Target, dan Metadata.</p>
          <ul>
            <li><strong>Waktu:</strong> kapan tindakan selesai.</li>
            <li><strong>Admin:</strong> nama dan username pelaku bila tersedia.</li>
            <li><strong>Aksi:</strong> jenis tindakan, misalnya akun, edit Submission, lock, QC, perubahan Produk, pemindahan referensi, penggabungan, atau penghapusan.</li>
            <li><strong>Target:</strong> jenis data yang dikenai tindakan.</li>
            <li><strong>Metadata:</strong> ringkasan sebelum/sesudah atau konteks lain yang dicatat tindakan tersebut.</li>
          </ul>
          <p>Daftar diurutkan dari tindakan terbaru dan saat ini tidak mempunyai pencarian/filter khusus. Gunakan Audit untuk menelusuri siapa melakukan apa dan kapan, bukan untuk mengubah kembali data.</p>
        </section>

        <section id="troubleshooting" className="guide-article">
          <p className="guide-section-label">TROUBLESHOOTING</p>
          <h3>Apa yang dilakukan jika terjadi masalah?</h3>
          <div className="guide-disclosure-list guide-troubleshooting-list">
            {troubleshooting.map((item) => (
              <details className="guide-disclosure" key={item.title}>
                <summary><span><strong>{item.title}</strong><small>{item.seen}</small></span></summary>
                <dl className="guide-problem-steps">
                  <div><dt>Kemungkinan penyebab</dt><dd>{item.cause}</dd></div>
                  <div><dt>Yang perlu dilakukan</dt><dd>{item.action}</dd></div>
                  <div><dt>Kapan jangan memaksa perubahan</dt><dd>{item.caution}</dd></div>
                </dl>
              </details>
            ))}
          </div>
        </section>

        <section id="faq" className="guide-article">
          <p className="guide-section-label">PERTANYAAN UMUM</p>
          <h3>FAQ Super Admin</h3>
          <div className="guide-disclosure-list guide-faq-list">
            {faqs.map(([question, answer, href]) => (
              <details className="guide-disclosure" key={question}>
                <summary><strong>{question}</strong></summary>
                <p>{answer} <a href={href}>Lihat panduan terkait.</a></p>
              </details>
            ))}
          </div>
        </section>

        <section id="istilah" className="guide-article">
          <p className="guide-section-label">ISTILAH YANG SERING MUNCUL</p>
          <h3>Arti istilah pada halaman Admin</h3>
          <dl className="guide-glossary">
            {glossary.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}
          </dl>
        </section>

        <GuideUpdatesSection audience="admin" />

        <p className="guide-more">Jika masalah belum selesai, catat menu, Stasiun, Site, Subtipe atau Produk, waktu kejadian, tindakan terakhir, serta pesan yang terlihat sebelum meminta pemeriksaan teknis.</p>
      </article>
    </main>
  );
}
