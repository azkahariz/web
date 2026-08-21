import Link from "next/link";
import GuideUpdatesSection from "../components/GuideUpdatesSection";
import { formatGuideDate, getLatestGuideUpdate } from "../lib/guide-updates";

export const metadata = {
  title: "Panduan | Aloptama Collect",
  description: "Panduan pengisian Aloptama Collect untuk pengguna Stasiun.",
};

const stationTasks = [
  ["Mulai mengisi data", "#mengisi-data", "Pilih Site, masuk mode edit, lalu mulai isi."],
  ["Melanjutkan pengisian", "#mengisi-data", "Buka kembali data yang sudah pernah disimpan."],
  ["Memperbaiki data", "#mengisi-data", "Ubah data lama tanpa membuat pengisian baru."],
  ["Memilih atau mengusulkan Produk", "#memilih-produk", "Cari Produk yang ada atau kirim usulan baru."],
  ["Mengisi data setiap unit", "#data-unit", "Isi jumlah, nomor seri, kondisi, tahun, dan catatan."],
  ["Mengunduh data", "#mengunduh-data", "Unduh CSV atau JSON tanpa masuk mode edit."],
  ["Data sedang diedit orang lain", "#sedang-diedit", "Pahami pesan yang muncul dan coba kembali."],
  ["Saya mengalami masalah", "#masalah-pengisian", "Periksa langkah aman sebelum mengulang."],
] as const;

export default function StationGuidePage() {
  const latest = getLatestGuideUpdate("station");

  return (
    <main className="guide-shell">
      <header className="guide-header">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">AC</div><div><p className="eyebrow">BANTUAN PENGISIAN</p><h1>Aloptama Collect</h1></div></div>
        <Link className="logout-button" href="/">Kembali ke aplikasi</Link>
      </header>

      <article className="guide-content">
        <p className="kicker">PANDUAN PENGGUNA STASIUN</p>
        <h2>Isi dan perbaiki data Aloptama dengan langkah yang mudah diikuti.</h2>
        <p className="guide-lead">Panduan ini membantu Anda menemukan apa yang perlu diklik, apa yang akan terjadi, dan apa yang perlu dilakukan jika ada masalah.</p>
        {latest && <p className="guide-version-meta">Terakhir diperbarui: <strong>{formatGuideDate(latest.date)}</strong><span>Versi panduan {latest.version}</span></p>}

        <nav className="guide-task-nav" aria-labelledby="station-guide-tasks">
          <h3 id="station-guide-tasks">Mau melakukan apa?</h3>
          <div className="guide-task-grid">
            {stationTasks.map(([label, href, description]) => <a key={label} href={href}><strong>{label}</strong><span>{description}</span></a>)}
          </div>
        </nav>

        <GuideUpdatesSection audience="station" />

        <section id="mengisi-data" className="guide-article">
          <p className="guide-section-label">MULAI, LANJUTKAN, ATAU PERBAIKI</p>
          <h3>Bagaimana cara mengisi atau memperbaiki data?</h3>
          <p><strong>Site</strong> adalah lokasi atau perangkat utama tempat data dikelompokkan. <strong>Subtipe</strong> menentukan kelompok peralatan yang perlu diisi.</p>
          <h4>Caranya</h4>
          <ol>
            <li>Pada bagian <strong>Tentukan lokasi</strong>, pilih <strong>Aloptama / Site</strong>.</li>
            <li>Pilih <strong>Subtipe Site</strong> yang tersedia. Aplikasi hanya menampilkan Subtipe yang sesuai dengan Site.</li>
            <li>Klik <strong>Mulai Pengisian</strong> untuk data baru, atau <strong>Edit Data</strong> untuk melanjutkan dan memperbaiki data yang sudah ada.</li>
            <li>Isi nama operator, lalu lengkapi Metadata Aloptama dan perangkat terpasang.</li>
            <li>Klik <strong>Simpan</strong> jika ingin menyimpan saat itu juga.</li>
            <li>Setelah benar-benar selesai, klik <strong>Selesai Mengedit</strong>.</li>
          </ol>
          <h4>Apa yang akan terjadi?</h4>
          <p>Perubahan disimpan otomatis selama Anda mengedit. Tombol <strong>Simpan</strong> mengirim perubahan saat itu juga. <strong>Selesai Mengedit</strong> menyimpan perubahan terakhir dan memberi kesempatan perangkat lain untuk mengedit data tersebut.</p>
          <div className="guide-note"><strong>Catatan</strong><p>Satu data pengisian berlaku untuk satu Site dan satu Subtipe. Membuka data lama lalu memilih <strong>Edit Data</strong> tidak membuat data baru.</p></div>
        </section>

        <section id="memilih-produk" className="guide-article">
          <p className="guide-section-label">PRODUK</p>
          <h3>Bagaimana memilih atau mengusulkan Produk?</h3>
          <h4>Memilih Produk yang sudah ada</h4>
          <ol>
            <li>Buka kategori perangkat yang ingin diisi.</li>
            <li>Klik pilihan Produk, lalu cari berdasarkan <strong>Merk</strong>, <strong>Tipe</strong>, atau keduanya.</li>
            <li>Pilih hasil atau rekomendasi yang paling sesuai.</li>
          </ol>
          <h4>Jika Produk tidak ditemukan</h4>
          <ol>
            <li>Buka bagian <strong>Produk tidak ditemukan?</strong>.</li>
            <li>Isi <strong>Merk</strong>, <strong>Tipe</strong>, dan catatan bila diperlukan.</li>
            <li>Periksa rekomendasi sekali lagi. Jika memang belum ada, klik <strong>Usulkan produk baru</strong> atau <strong>Tetap usulkan produk baru</strong>.</li>
          </ol>
          <h4>Apa yang akan terjadi?</h4>
          <p>Produk yang dipilih langsung terhubung ke daftar Produk aplikasi. Usulan Produk baru akan menunggu pemeriksaan Super Admin sebelum menjadi pilihan resmi.</p>
          <div className="guide-example"><strong>Contoh</strong><p>Cari <strong>Vaisala HMP155</strong>. Jika Produk yang sama muncul pada rekomendasi, pilih rekomendasi itu agar tidak membuat usulan ganda.</p></div>
        </section>

        <section id="data-unit" className="guide-article">
          <p className="guide-section-label">PERANGKAT TERPASANG</p>
          <h3>Bagaimana mengisi data setiap unit?</h3>
          <ol>
            <li>Pilih Produk pada kategori yang sedang diisi.</li>
            <li>Atur <strong>Jumlah</strong> sesuai banyaknya unit.</li>
            <li>Isi <strong>Nomor Seri</strong>, <strong>Kondisi</strong>, <strong>Tahun Pasang</strong>, dan <strong>Catatan</strong> untuk setiap unit.</li>
            <li>Periksa kembali data tiap unit sebelum klik <strong>Simpan</strong>.</li>
          </ol>
          <p>Jika jumlah lebih dari satu, setiap unit dapat memiliki nomor seri, kondisi, tahun pasang, dan catatan yang berbeda.</p>
        </section>

        <section id="mengunduh-data" className="guide-article">
          <p className="guide-section-label">UNDUH DATA</p>
          <h3>Bagaimana mengunduh data?</h3>
          <ol>
            <li>Pilih Site dan Subtipe yang ingin diunduh.</li>
            <li>Tetap berada pada mode lihat.</li>
            <li>Klik <strong>Unduh CSV</strong> atau <strong>Unduh JSON</strong>.</li>
          </ol>
          <p>Mengunduh data tidak mengubah isi pengisian dan tidak menghalangi pengguna lain untuk mengedit.</p>
        </section>

        <section id="sedang-diedit" className="guide-article">
          <p className="guide-section-label">DATA SEDANG DIGUNAKAN</p>
          <h3>Apa yang dilakukan jika data sedang diedit orang lain?</h3>
          <ol>
            <li>Jangan membuat data pengganti untuk Site dan Subtipe yang sama.</li>
            <li>Tunggu pengguna lain memilih <strong>Selesai Mengedit</strong>.</li>
            <li>Klik <strong>Coba lagi</strong> untuk memeriksa apakah data sudah dapat diedit.</li>
          </ol>
          <p>Selama pesan tersebut tampil, data hanya dapat dilihat. Ini mencegah perubahan dari dua perangkat saling menimpa.</p>
        </section>

        <section id="masalah-pengisian" className="guide-article">
          <p className="guide-section-label">JIKA ADA MASALAH</p>
          <h3>Apa yang perlu diperiksa?</h3>
          <ul>
            <li><strong>Site atau Subtipe tidak sesuai:</strong> jangan lanjutkan pengisian. Hubungi Super Admin agar data utama diperiksa.</li>
            <li><strong>Internet terputus:</strong> jangan hapus data browser. Sambungkan kembali internet, lalu klik <strong>Simpan</strong>.</li>
            <li><strong>Data belum dapat diedit:</strong> klik <strong>Coba lagi</strong> setelah pengguna sebelumnya selesai.</li>
            <li><strong>Perubahan belum terlihat:</strong> pastikan Site dan Subtipe yang dibuka sudah benar, lalu buka kembali data tersebut.</li>
          </ul>
        </section>

        <p className="guide-more">Jika masalah tetap terjadi, catat nama Stasiun, Site, Subtipe, waktu kejadian, dan pesan yang terlihat, lalu hubungi Super Admin.</p>
      </article>
    </main>
  );
}
