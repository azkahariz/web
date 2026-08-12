import Link from "next/link";

export const metadata = {
  title: "Panduan | Aloptama Collect",
  description: "Panduan ringkas pengisian Aloptama Collect.",
};

export default function StationGuidePage() {
  return (
    <main className="guide-shell">
      <header className="guide-header">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">AC</div><div><p className="eyebrow">BANTUAN PENGISIAN</p><h1>Aloptama Collect</h1></div></div>
        <Link className="logout-button" href="/">Kembali ke aplikasi</Link>
      </header>
      <article className="guide-content">
        <p className="kicker">PANDUAN RINGKAS</p>
        <h2>Isi data dengan aman, satu site dan subtipe pada satu waktu.</h2>
        <p className="guide-more">Akses resmi: <a href="https://aloptama-collect.vercel.app">https://aloptama-collect.vercel.app</a>.</p>
        <section>
          <h3>Urutan pengisian</h3>
          <ol>
            <li>Pilih Site dan Subtipe Site. Awalnya aplikasi berada di Mode lihat.</li>
            <li>Tekan <strong>Edit Data</strong> atau <strong>Mulai Pengisian</strong>, lalu isi nama operator.</li>
            <li>Lengkapi Metadata Aloptama dan perangkat terpasang. Perubahan disimpan otomatis.</li>
            <li>Tekan <strong>Simpan</strong> bila ingin mengirim perubahan sekarang.</li>
            <li>Tekan <strong>Selesai Mengedit</strong> setelah selesai agar lock dilepas.</li>
          </ol>
        </section>
        <section>
          <h3>Hal penting</h3>
          <ul>
            <li><strong>Unduh CSV/JSON</strong> dapat digunakan saat Mode lihat dan tidak mengambil lock.</li>
            <li>Bila data sedang diedit perangkat lain, tekan <strong>Coba lagi</strong> untuk mengecek lock terbaru.</li>
            <li>Bila internet putus, jangan hapus data browser. Simpan lagi setelah koneksi kembali.</li>
            <li>Jika produk tidak ada, isi Brand dan Tipe pada <strong>Usulkan produk baru</strong>. Status Pending berarti menunggu QC Admin.</li>
          </ul>
        </section>
        <section>
          <h3>Jangan dilakukan</h3>
          <ul>
            <li>Jangan memakai satu draf secara bersamaan pada beberapa perangkat.</li>
            <li>Jangan menutup pengisian tanpa mencoba <strong>Selesai Mengedit</strong>.</li>
            <li>Jangan menghapus data browser saat status menunjukkan tersimpan lokal atau ada konflik versi.</li>
          </ul>
        </section>
        <p className="guide-more">Panduan lengkap tersedia pada dokumen <strong>PANDUAN-PENGGUNA-STASIUN.md</strong> di repository project. Hubungi Super Admin bila Site atau Subtipe yang tersedia tidak sesuai.</p>
      </article>
    </main>
  );
}
