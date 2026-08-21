import Link from "next/link";
import GuideUpdatesSection from "../components/GuideUpdatesSection";
import { formatGuideDate, getLatestGuideUpdate } from "../lib/guide-updates";

export const metadata = {
  title: "Panduan | Aloptama Collect",
  description: "Panduan lengkap Aloptama Collect untuk pengguna Stasiun.",
};

const stationTasks = [
  ["Baru pertama kali", "#mulai-di-sini", "Lihat urutan singkat dari masuk sampai selesai."],
  ["Masuk atau keluar aplikasi", "#akun-stasiun", "Gunakan akun Stasiun dan jaga password."],
  ["Memilih Site dan Subtipe", "#lokasi-pengisian", "Pahami pilihan lokasi dan konfigurasi alat."],
  ["Mengisi, melanjutkan, atau memperbaiki", "#alur-pengisian", "Buka data baru atau data yang sudah tersimpan."],
  ["Mengisi Metadata Aloptama", "#metadata-aloptama", "Isi identitas, lokasi, koordinat, dan komunikasi."],
  ["Mengisi kategori dan unit", "#kategori-dan-unit", "Catat Produk dan setiap unit fisiknya."],
  ["Memilih atau mengusulkan Produk", "#produk", "Cari Produk yang ada atau kirim usulan baru."],
  ["Mengisi Gudang", "#gudang", "Tambah kategori dan catat barang yang tersedia."],
  ["Memastikan data tersimpan", "#penyimpanan", "Pahami status simpan, lock, dan data yang berubah."],
  ["Mengunduh hasil", "#unduh-data", "Pilih CSV atau JSON sesuai kebutuhan."],
  ["Mengatasi masalah", "#troubleshooting", "Temukan langkah aman untuk masalah yang umum."],
] as const;

const metadataGroups = [
  {
    title: "Identitas dan status",
    summary: "Pengadaan, ID, kepemilikan, dan status Site",
    fields: [
      ["Nama Stasiun", "Terisi otomatis dari akun Stasiun dan tidak dapat diubah dari form."],
      ["Equipment Type", "Terisi otomatis dari Tipe Site yang dipilih."],
      ["Field/Domain", "Terisi otomatis sesuai Tipe Site: Meteorologi, Klimatologi, atau Geofisika."],
      ["UPT Pengelola", "Terisi otomatis dengan nama Stasiun atau Balai pemilik akun."],
      ["Sumber Anggaran Pemeliharaan", "Isi kode atau nama akun anggaran yang membiayai pemeliharaan, misalnya 3347. Kolom ini berupa isian bebas."],
      ["Merk Pengadaan", "Isi merk aset saat pertama kali diadakan, misalnya LSI atau Microstep."],
      ["WIGOS ID", "Isi ID resmi berformat WSI, misalnya 0-360-04-36001. Konfirmasikan nilainya ke Direktorat Data dan Komputasi."],
      ["AWS Center ID", "Isi ID AWS Center yang tercatat, misalnya STA2062. Gunakan data resmi yang tersedia."],
      ["Status Kepemilikan", "Pilih BMKG, Sewa, Hibah, Kerjasama Mitra, atau Lainnya. Jika memilih Lainnya, isi keterangannya."],
      ["Kode BMN (NUP)", "Isi kode NUP BMN pengadaan, misalnya 1.01.02.99.999.000804."],
      ["Tanggal Instalasi", "Pilih tanggal pemasangan pertama Site."],
      ["Status", "Pilih OPERATIONAL, TRIAL, INACTIVE, atau RETIRED sesuai kondisi operasional Site."],
    ],
  },
  {
    title: "Lokasi dan pengelola",
    summary: "Alamat, wilayah, mitra, dan penjaga lokasi",
    fields: [
      ["Alamat Detail", "Isi alamat lengkap lokasi alat."],
      ["Nama Provinsi, Kab/Kota, Kecamatan, Desa/Kelurahan", "Pilih berurutan mulai dari Provinsi. Jika daftar wilayah gagal dimuat, klik Coba lagi atau Input manual."],
      ["Nama Instansi Mitra", "Isi nama instansi mitra yang terkait dengan lokasi bila ada."],
      ["Alamat Instansi", "Isi alamat instansi mitra bila ada."],
      ["Nama Penjaga", "Isi nama petugas atau penjaga lokasi yang dapat dihubungi."],
      ["No HP Penjaga", "Isi nomor telepon atau WhatsApp penjaga, misalnya 081312345678."],
    ],
  },
  {
    title: "Koordinat dan pengukuran",
    summary: "Posisi, elevasi, cara ukur, dan tanggal pengukuran",
    fields: [
      ["Latitude", "Isi lintang menggunakan titik sebagai pemisah desimal, misalnya -6.2792."],
      ["Longitude", "Isi bujur menggunakan titik sebagai pemisah desimal, misalnya 106.6503."],
      ["Elevasi (meter)", "Isi ketinggian lokasi dalam meter, misalnya 32."],
      ["Metode Ukur", "Pilih metode yang benar. Jika memilih Lainnya, kolom Metode Ukur Lainnya wajib diisi."],
      ["Tanggal Ukur", "Pilih tanggal pengambilan koordinat atau elevasi."],
    ],
  },
  {
    title: "Komunikasi dan interval",
    summary: "SIM, pengiriman data, teknisi, dan frekuensi data",
    fields: [
      ["No SIM/GSM", "Isi nomor kartu komunikasi alat, misalnya 08112345678."],
      ["Metode Transport", "Centang satu atau beberapa cara pengiriman: MQTT, HTTP POST, FTP, atau TCP/IP Direct."],
      ["Zona Waktu", "Pilih WIB (UTC+7), WITA (UTC+8), atau WIT (UTC+9)."],
      ["Nama Teknisi", "Isi nama teknisi komunikasi atau telemetri."],
      ["No HP Teknisi", "Isi nomor telepon atau WhatsApp teknisi."],
      ["Instansi Teknisi", "Isi instansi pengelola komunikasi, misalnya Telkomsel."],
      ["Mulai Interval dan Akhir Interval", "Pilih tanggal sesuai periode data yang ditetapkan pengelola. Jika maksud periode belum jelas, konfirmasikan kepada Super Admin."],
      ["Interval Data (menit)", "Pilih 1, 2, 5, 10, atau 60 menit. Pilih Lainnya untuk memasukkan jumlah menit sendiri."],
    ],
  },
] as const;

const troubleshooting = [
  {
    title: "Tidak bisa login",
    seen: "Muncul pesan Username atau password tidak sesuai, atau login gagal diproses.",
    cause: "Username/password salah, akun belum aktif, atau koneksi sedang bermasalah.",
    action: "Periksa penulisan username dan password, gunakan tombol mata bila perlu, lalu coba lagi setelah koneksi stabil.",
    admin: "Hubungi Super Admin jika password lupa, akun belum siap, atau pesan tetap muncul.",
  },
  {
    title: "Site tidak muncul",
    seen: "Daftar Aloptama / Site tidak memuat Site yang dicari.",
    cause: "Site belum aktif atau belum terhubung ke akun Stasiun Anda.",
    action: "Muat ulang halaman dan pastikan Anda masuk dengan akun Stasiun yang benar.",
    admin: "Hubungi Super Admin dengan nama Stasiun dan nama Site yang seharusnya tersedia.",
  },
  {
    title: "Subtipe tidak muncul",
    seen: "Setelah memilih Site, daftar Subtipe kosong atau pilihan yang dicari tidak ada.",
    cause: "Belum ada Subtipe aktif yang sesuai dengan Tipe Site atau keluarga Site tersebut.",
    action: "Pilih ulang Site dan gunakan hanya Subtipe yang ditawarkan aplikasi.",
    admin: "Hubungi Super Admin jika daftar tetap kosong atau tidak sesuai kondisi Site.",
  },
  {
    title: "Konfigurasi Site sedang diperbarui",
    seen: "Form tidak dapat digunakan dan aplikasi menampilkan pesan pembaruan konfigurasi.",
    cause: "Data lama dan konfigurasi Site saat ini belum cocok sehingga aplikasi menahan pengisian.",
    action: "Klik Muat ulang. Jangan memaksakan pengisian atau memilih Subtipe di luar daftar aplikasi.",
    admin: "Jika pesan tetap muncul, hubungi Super Admin karena konfigurasi Site perlu diperiksa.",
  },
  {
    title: "Subtipe tidak sesuai dengan konfigurasi Site",
    seen: "Muncul pesan bahwa Subtipe tidak sesuai dengan konfigurasi Site saat ini.",
    cause: "Pilihan lama tidak lagi sesuai dengan Site yang tersedia sekarang.",
    action: "Muat ulang halaman, pilih Site kembali, lalu pilih Subtipe yang tersedia.",
    admin: "Hubungi Super Admin jika pesan tetap muncul setelah memilih ulang.",
  },
  {
    title: "Data sedang diedit orang lain",
    seen: "Form hanya dapat dibaca dan menampilkan operator serta waktu aktivitas terakhir.",
    cause: "Sesi lain sedang mengedit Site dan Subtipe yang sama.",
    action: "Tunggu pengguna lain klik Selesai Mengedit, lalu klik Coba lagi. Gunakan Ambil alih draf hanya jika tombol muncul dan Anda yakin editor sebelumnya sudah berhenti.",
    admin: "Hubungi Super Admin jika lock tetap aktif padahal tidak ada yang mengedit.",
  },
  {
    title: "Perubahan belum tersimpan ke server",
    seen: "Status menunjukkan Tersimpan lokal atau Ada perubahan belum tersinkron.",
    cause: "Koneksi ke server belum tersedia atau proses simpan belum selesai.",
    action: "Jangan hapus data browser. Sambungkan internet, buka Site/Subtipe yang sama, lalu klik Simpan sampai muncul Tersimpan ke server atau Semua perubahan sudah tersimpan.",
    admin: "Hubungi Super Admin jika penyimpanan tetap gagal setelah koneksi stabil.",
  },
  {
    title: "Data server berubah",
    seen: "Muncul Ada versi server yang lebih baru atau Versi server berubah.",
    cause: "Data yang sama telah diperbarui dari sesi lain sejak Anda membukanya.",
    action: "Klik Muat versi terbaru, periksa isi terbaru, lalu mulai edit kembali. Perubahan yang belum dikirim tidak digabungkan otomatis.",
    admin: "Hubungi Super Admin jika Anda perlu menelusuri perubahan yang saling bertentangan.",
  },
  {
    title: "Produk tidak ditemukan",
    seen: "Pencarian tidak menampilkan Produk yang dibutuhkan.",
    cause: "Kata pencarian belum cocok atau Produk belum tersedia di katalog aktif.",
    action: "Cari dengan bagian Merk atau Tipe, periksa halaman berikutnya dan rekomendasi, lalu usulkan Produk baru hanya jika memang belum ada.",
    admin: "Hubungi Super Admin jika Produk yang seharusnya tersedia tetap tidak muncul.",
  },
  {
    title: "Usulan Produk belum selesai diproses",
    seen: "Produk berstatus menunggu pemeriksaan, tersimpan lokal, disesuaikan, atau ditolak.",
    cause: "Usulan sedang diperiksa, belum terkirim, sudah digabungkan/disetujui, atau ditolak Admin.",
    action: "Baca pesan di bawah Produk. Untuk usulan lokal, pastikan server tersedia. Untuk usulan ditolak, baca Catatan lalu hapus Produk tersebut dan pilih atau usulkan data yang benar.",
    admin: "Hubungi Super Admin jika status tidak berubah atau alasan penolakan tidak cukup jelas.",
  },
  {
    title: "Halaman atau master data gagal dimuat",
    seen: "Muncul Master data gagal dimuat, Ringkasan server belum dapat dimuat, atau katalog Produk gagal dimuat.",
    cause: "Koneksi ke server atau salah satu layanan data sedang terganggu.",
    action: "Klik Muat ulang atau Coba lagi. Jangan mengosongkan draf saat koneksi bermasalah.",
    admin: "Hubungi Super Admin jika masalah terjadi berulang pada beberapa perangkat.",
  },
  {
    title: "Unduhan tidak sesuai perubahan terakhir",
    seen: "File berhasil dibuat tetapi aplikasi memberi tahu bahwa server belum tersinkron.",
    cause: "Aplikasi membuat unduhan dari data terbaru di browser ketika server belum dapat menerima perubahan.",
    action: "Simpan file sebagai salinan sementara, pulihkan koneksi, lalu klik Simpan dan unduh ulang setelah data tersimpan di server.",
    admin: "Hubungi Super Admin jika unduhan tetap gagal dibuat atau isinya tidak sesuai setelah sinkron berhasil.",
  },
] as const;

const faqs = [
  ["Apakah data tersimpan otomatis?", "Ya. Saat mode pengisian aktif, perubahan disimpan otomatis beberapa saat setelah Anda berhenti mengubah form.", "#penyimpanan"],
  ["Bolehkah dua orang mengisi data yang sama?", "Sebaiknya tidak. Satu Site dan Subtipe hanya diedit oleh satu sesi pada satu waktu.", "#data-sedang-diedit"],
  ["Saya salah memilih Produk. Apa yang harus dilakukan?", "Jika masih dapat mengedit, hapus Produk yang salah lalu pilih Produk yang benar. Jika koreksi memerlukan bantuan, hubungi Super Admin.", "#produk"],
  ["Produk yang saya cari tidak ada.", "Cari dengan Merk atau Tipe, periksa rekomendasi, lalu gunakan Usulkan produk baru bila memang belum tersedia.", "#produk"],
  ["Apakah saya perlu mengisi semua kategori?", "Kategori Site biasa menunjukkan kelompok yang perlu diperiksa. Untuk Gudang, tambahkan hanya kategori barang yang benar-benar tersedia.", "#kategori-dan-unit"],
  ["Bagaimana melanjutkan pengisian kemarin?", "Masuk kembali, pilih Site dan Subtipe yang sama, lalu klik Edit Data. Data yang tersimpan akan muncul kembali.", "#alur-pengisian"],
  ["Apa beda Item dan Unit?", "Item adalah satu jenis Produk pada kategori. Unit adalah barang fisik satu per satu dari Item tersebut.", "#kategori-dan-unit"],
  ["Apa beda CSV dan JSON?", "CSV mudah dibuka di aplikasi spreadsheet. JSON menyimpan salinan data dengan susunan yang lebih lengkap.", "#unduh-data"],
  ["Kenapa saya tidak bisa mengedit?", "Data mungkin sedang digunakan sesi lain, konfigurasi Site sedang diperbarui, atau Nama operator belum diisi.", "#troubleshooting"],
] as const;

const glossary = [
  ["Stasiun", "Unit kerja yang menggunakan akun Anda dan menjadi pemilik daftar Site."],
  ["Site", "Lokasi atau sistem/peralatan utama yang akan didata."],
  ["Tipe Site", "Kelompok Site, misalnya AWOS Kategori III, AWS, atau Gudang."],
  ["Subtipe", "Bagian Site yang menentukan profil dan kategori peralatan yang perlu diisi."],
  ["Submission", "Data pengisian untuk satu Site dan satu Subtipe."],
  ["Produk", "Pasangan Merk dan Tipe yang dipilih untuk sebuah Item."],
  ["Item", "Satu jenis Produk atau bahan pada sebuah kategori."],
  ["Unit", "Barang fisik satu per satu. Setiap Unit dapat memiliki nomor seri dan metadata sendiri."],
  ["Proposal Produk", "Usulan Merk dan Tipe baru yang belum ada di katalog dan perlu diperiksa Super Admin."],
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
        <h2>Gunakan Aloptama Collect dari masuk sampai pengisian selesai.</h2>
        <p className="guide-lead">Ikuti langkah berdasarkan pekerjaan yang ingin dilakukan. Gunakan nama tombol yang sama seperti yang terlihat di aplikasi.</p>
        {latest && <p className="guide-version-meta">Terakhir diperbarui: <strong>{formatGuideDate(latest.date)}</strong><span>Versi panduan {latest.version}</span></p>}

        <nav className="guide-task-nav" aria-labelledby="station-guide-tasks">
          <h3 id="station-guide-tasks">Mau melakukan apa?</h3>
          <div className="guide-task-grid">
            {stationTasks.map(([label, href, description]) => <a key={label} href={href}><strong>{label}</strong><span>{description}</span></a>)}
          </div>
        </nav>

        <section id="mulai-di-sini" className="guide-article guide-start-section">
          <p className="guide-section-label">MULAI DI SINI</p>
          <h3>Baru pertama kali menggunakan aplikasi?</h3>
          <ol>
            <li>Masuk menggunakan akun Stasiun.</li>
            <li>Isi <strong>Nama operator</strong>.</li>
            <li>Pilih <strong>Aloptama / Site</strong> dan <strong>Subtipe site</strong>.</li>
            <li>Klik <strong>Mulai Pengisian</strong> atau <strong>Edit Data</strong>.</li>
            <li>Lengkapi Metadata Aloptama, kategori, Produk, dan data setiap unit.</li>
            <li>Tunggu sampai status menunjukkan data tersimpan, atau klik <strong>Simpan</strong>.</li>
            <li>Klik <strong>Selesai Mengedit</strong> setelah pekerjaan selesai.</li>
          </ol>
          <div className="guide-note"><strong>Catatan</strong><p>Gudang memiliki cara pengisian yang sedikit berbeda. Lihat bagian <a href="#gudang">Mengisi Gudang</a>.</p></div>
        </section>

        <section id="akun-stasiun" className="guide-article">
          <p className="guide-section-label">AKUN STASIUN</p>
          <h3>Bagaimana masuk dan keluar dari aplikasi?</h3>
          <h4>Masuk</h4>
          <ol>
            <li>Buka halaman Aloptama Collect.</li>
            <li>Isi <strong>Username</strong> dan <strong>Password</strong> akun Stasiun.</li>
            <li>Gunakan tombol bergambar mata untuk menampilkan atau menyembunyikan password.</li>
            <li>Klik <strong>Masuk</strong> dan tunggu halaman pengisian terbuka.</li>
          </ol>
          <p>Nama Stasiun dan daftar Site ditentukan oleh akun yang digunakan. Anda tidak perlu memilih Stasiun secara manual.</p>
          <h4>Keluar</h4>
          <ol>
            <li>Pastikan status penyimpanan tidak menunjukkan perubahan yang belum tersinkron.</li>
            <li>Jika sedang mengedit, klik <strong>Selesai Mengedit</strong> terlebih dahulu bila memungkinkan.</li>
            <li>Klik <strong>Keluar</strong> di kanan atas.</li>
          </ol>
          <p>Keluar hanya mengakhiri sesi pada browser atau perangkat yang sedang digunakan. Sesi lain dengan akun Stasiun yang sama tetap dapat masuk.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p>Jangan membagikan password di Catatan, file ekspor, atau pesan umum. Jika lupa password atau akun belum siap, hubungi Super Admin. Aplikasi tidak menyediakan reset password mandiri.</p></div>
        </section>

        <section id="lokasi-pengisian" className="guide-article">
          <p className="guide-section-label">STASIUN, SITE, DAN SUBTIPE</p>
          <h3>Bagaimana menentukan data yang akan diisi?</h3>
          <p><strong>Stasiun</strong> mengikuti akun. <strong>Site</strong> adalah lokasi atau sistem utama. <strong>Tipe Site</strong> menunjukkan kelompoknya. <strong>Subtipe</strong> menentukan profil dan kategori peralatan yang akan tampil.</p>
          <ol>
            <li>Pada bagian <strong>Tentukan lokasi</strong>, periksa nama <strong>Stasiun</strong>.</li>
            <li>Isi <strong>Nama operator</strong> dengan nama petugas yang melakukan pengisian.</li>
            <li>Pilih <strong>Aloptama / Site</strong>. Tipe Site akan terlihat di bawah pilihan.</li>
            <li>Pilih <strong>Subtipe site</strong> dari daftar yang tersedia.</li>
            <li>Periksa <strong>Profil Barang</strong> dan jumlah kategori yang perlu diperiksa.</li>
          </ol>
          <p>Daftar Site diurutkan berdasarkan nama, dengan Gudang di bagian paling bawah. Nama operator diingat pada browser ini agar tidak perlu diketik ulang setiap kali.</p>
          <div className="guide-example"><strong>Contoh AWOS</strong><p>Site <strong>AWOS All Weather Kat. 3</strong> dapat menampilkan Subtipe AllWeather End Point, Mid, Station, dan TDZ. Site lain dapat memiliki susunan Subtipe yang berbeda.</p></div>
          <p>Aplikasi hanya menampilkan dan menerima Subtipe yang sesuai dengan Site. Untuk Subtipe TDZ dan End Point, isi <strong>Azimuth runway</strong> dengan maksimal dua digit, misalnya 01, 11, atau 24.</p>
          <h4>Ringkasan Site Saya</h4>
          <p>Panel ini menampilkan persentase serta jumlah kategori yang sudah terisi. Klik sebuah baris untuk memilih Site tersebut. Saat sedang mengedit, pemilihan Site lain dinonaktifkan sampai Anda selesai.</p>
        </section>

        <section id="alur-pengisian" className="guide-article">
          <p className="guide-section-label">LIHAT DAN EDIT DATA</p>
          <h3>Bagaimana mulai, melanjutkan, atau memperbaiki pengisian?</h3>
          <h4>Mode lihat</h4>
          <p>Setelah Site dan Subtipe dipilih, aplikasi membuka data untuk dilihat. Pada keadaan ini form belum dapat diubah dan belum mengunci data. Anda tetap dapat mengunduh CSV atau JSON.</p>
          <h4>Mulai pengisian baru</h4>
          <ol>
            <li>Isi Nama operator.</li>
            <li>Pilih Site dan Subtipe.</li>
            <li>Klik <strong>Mulai Pengisian</strong>.</li>
            <li>Tunggu status menjadi <strong>Mode pengisian aktif</strong>, lalu isi form.</li>
          </ol>
          <h4>Melanjutkan pengisian sebelumnya</h4>
          <ol>
            <li>Masuk kembali dengan akun Stasiun yang sama.</li>
            <li>Pilih Site dan Subtipe yang sama seperti pengisian sebelumnya.</li>
            <li>Periksa data yang muncul, lalu klik <strong>Edit Data</strong>.</li>
          </ol>
          <p>Data yang sudah tersimpan di server akan muncul kembali, termasuk setelah halaman dimuat ulang atau Anda memakai perangkat lain.</p>
          <h4>Memperbaiki data yang salah</h4>
          <ol>
            <li>Buka Site dan Subtipe yang berisi data salah.</li>
            <li>Klik <strong>Edit Data</strong>.</li>
            <li>Ubah kolom, Produk, atau Unit yang diperlukan.</li>
            <li>Tunggu penyimpanan otomatis atau klik <strong>Simpan</strong>.</li>
          </ol>
          <p>Anda tidak perlu membuat Submission baru hanya untuk memperbaiki data.</p>
        </section>

        <section id="metadata-aloptama" className="guide-article">
          <p className="guide-section-label">METADATA ALOPTAMA</p>
          <h3>Bagaimana mengisi profil Site?</h3>
          <p>Metadata Aloptama tersedia untuk Site biasa dan tersimpan untuk Site tersebut. Buka setiap kelompok, lalu isi berdasarkan dokumen atau data resmi yang tersedia.</p>
          <div className="guide-note"><strong>Catatan</strong><p>Aplikasi tidak memberi tanda wajib pada seluruh kolom metadata. Jangan menebak nilai resmi. Jika data belum diketahui, konfirmasikan kepada pengelola data atau Super Admin.</p></div>
          <div className="guide-disclosure-list">
            {metadataGroups.map((group) => (
              <details className="guide-disclosure" key={group.title}>
                <summary><span><strong>{group.title}</strong><small>{group.summary}</small></span></summary>
                <dl className="guide-field-list">
                  {group.fields.map(([field, guidance]) => <div key={field}><dt>{field}</dt><dd>{guidance}</dd></div>)}
                </dl>
              </details>
            ))}
          </div>
          <p>Jika data wilayah tidak dapat dimuat, gunakan <strong>Coba lagi</strong>. Gunakan <strong>Input manual</strong> hanya bila layanan wilayah tetap tidak tersedia.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p><strong>Kosongkan metadata</strong> menghapus seluruh isian metadata Site dari draf saat ini. Gunakan hanya jika memang ingin mengisi ulang.</p></div>
        </section>

        <section id="kategori-dan-unit" className="guide-article">
          <p className="guide-section-label">KATEGORI, ITEM, DAN UNIT</p>
          <h3>Bagaimana mencatat peralatan yang tersedia?</h3>
          <p>Kategori mengelompokkan fungsi peralatan yang perlu didata, misalnya Sensor Suhu Udara, Pengolah Data, atau Sistem Catu Daya. Daftar kategori mengikuti profil Site dan Subtipe yang dipilih.</p>
          <ol>
            <li>Cari kategori atau buka kategori yang ingin diisi.</li>
            <li>Klik <strong>Pilih produk</strong>. Untuk kategori mounting, klik <strong>Pilih bahan</strong>.</li>
            <li>Pilih Produk atau bahan yang benar.</li>
            <li>Atur <strong>Jumlah</strong> sesuai banyaknya unit fisik.</li>
            <li>Isi data setiap Unit, lalu periksa ringkasan progres.</li>
          </ol>
          <div className="guide-example"><strong>Contoh Item dan Unit</strong><p>Item <strong>Baterai 12 V 33 Ah</strong> dengan Jumlah 5 berarti ada lima Unit fisik. Setiap Unit memiliki bagian data sendiri.</p></div>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Merk dan Tipe</dt><dd>Mengikuti Produk yang Anda pilih. Untuk bahan mounting, pilih bahan dari daftar atau isi Bahan lainnya.</dd></div>
            <div><dt>Fungsi sensor</dt><dd>Pada sensor tertentu, pilih Suhu, Kelembaban, Suhu + Kelembaban, Kecepatan, Arah, atau Kecepatan + Arah. Satu Unit kombinasi tetap dihitung satu kali.</dd></div>
            <div><dt>Jumlah</dt><dd>Banyaknya Unit fisik untuk Item tersebut. Menambah Jumlah akan menambah bagian Unit yang dapat diisi satu per satu.</dd></div>
            <div><dt>Nomor seri</dt><dd>Isi sesuai label pada perangkat. Jangan gabungkan beberapa nomor seri dalam satu kolom. Kolom ini bertanda Opsional dan tidak tersedia untuk bahan mounting.</dd></div>
            <div><dt>Kondisi</dt><dd>Untuk Site biasa, pilih <strong>Baik</strong> atau <strong>Rusak</strong> sesuai kondisi Unit.</dd></div>
            <div><dt>Tahun pasang</dt><dd>Isi empat digit tahun pemasangan Unit pada Site, misalnya 2025.</dd></div>
            <div><dt>Catatan</dt><dd>Isi keterangan penting yang tidak tersedia pada kolom lain. Jangan tulis password atau informasi sensitif.</dd></div>
          </dl>
          <p>Klik <strong>Hapus</strong> pada Item jika salah memilih. Untuk sensor yang memenuhi dua fungsi, aplikasi meminta konfirmasi sebelum menghapus Unit dari kedua kategori.</p>
          <div className="guide-warning"><strong>Hati-hati</strong><p><strong>Kosongkan draf</strong> menghapus seluruh pilihan barang pada Site dan Subtipe yang sedang dibuka. Tindakan ini berbeda dengan menghapus satu Item.</p></div>
        </section>

        <section id="produk" className="guide-article">
          <p className="guide-section-label">PRODUK</p>
          <h3>Bagaimana memilih atau mengusulkan Produk?</h3>
          <h4>Memilih Produk yang sudah tersedia</h4>
          <ol>
            <li>Pada kategori, klik <strong>Pilih produk</strong>.</li>
            <li>Cari menggunakan Merk, Tipe, atau kombinasi keduanya. Pencarian dilakukan pada seluruh katalog, bukan hanya halaman yang terlihat.</li>
            <li>Gunakan <strong>Sebelumnya</strong> dan <strong>Berikutnya</strong> jika hasil lebih dari 100 Produk.</li>
            <li>Klik <strong>Pilih</strong> pada Produk yang benar.</li>
          </ol>
          <p>Rekomendasi hanya membantu mencari Produk yang mirip. Anda tetap memilih Produk yang benar.</p>
          <h4>Jika Produk belum tersedia</h4>
          <ol>
            <li>Cari dahulu dengan Merk dan Tipe untuk memastikan Produk belum ada.</li>
            <li>Buka bagian <strong>Produk tidak ditemukan?</strong>.</li>
            <li>Isi <strong>Brand</strong>, <strong>Tipe</strong>, dan <strong>Catatan</strong> bila diperlukan.</li>
            <li>Periksa rekomendasi. Jika ada Produk yang sama, pilih rekomendasi tersebut.</li>
            <li>Jika tetap belum ada, klik <strong>Usulkan produk baru</strong> atau <strong>Tetap usulkan produk baru</strong>.</li>
          </ol>
          <p>Usulan dapat langsung dipakai dalam pengisian dan akan diperiksa Super Admin. Admin dapat menyetujui sebagai Produk baru, menggabungkannya dengan Produk yang sudah ada, atau menolak usulan.</p>
          <h4>Memahami status usulan</h4>
          <ul>
            <li><strong>Menunggu pemeriksaan admin:</strong> usulan sudah dikirim.</li>
            <li><strong>Tersimpan lokal:</strong> usulan belum berhasil dikirim; pertahankan draf dan coba lagi saat server tersedia.</li>
            <li><strong>Disesuaikan admin:</strong> Produk telah disetujui atau digabungkan dan tampilan mengikuti Produk hasil pemeriksaan.</li>
            <li><strong>Ditolak:</strong> baca Catatan, hapus Produk tersebut dari form, lalu pilih atau usulkan Produk yang benar.</li>
          </ul>
        </section>

        <section id="gudang" className="guide-article">
          <p className="guide-section-label">INVENTARIS GUDANG</p>
          <h3>Bagaimana mengisi peralatan yang ada di Gudang?</h3>
          <p>Gudang tersedia sebagai Site dengan Tipe Site dan Subtipe <strong>Gudang</strong>. Gudang mencatat barang yang tersedia, bukan daftar kategori yang wajib dipenuhi.</p>
          <ol>
            <li>Pilih Site <strong>Gudang</strong> dan Subtipe <strong>Gudang</strong>.</li>
            <li>Isi Nama operator, lalu klik <strong>Mulai Pengisian</strong> atau <strong>Edit Data</strong>.</li>
            <li>Klik <strong>+ Tambah Kategori Barang</strong>.</li>
            <li>Cari kategori yang benar-benar memiliki barang, lalu klik <strong>Tambah</strong>.</li>
            <li>Pada kategori tersebut, klik <strong>Pilih produk</strong> atau <strong>Pilih bahan</strong>.</li>
            <li>Atur Jumlah dan isi data setiap Unit.</li>
            <li>Simpan dan klik <strong>Selesai Mengedit</strong> setelah selesai.</li>
          </ol>
          <dl className="guide-field-list guide-unit-fields">
            <div><dt>Nomor seri</dt><dd>Isi nomor seri setiap Unit Produk jika tersedia. Bahan mounting tidak memakai nomor seri.</dd></div>
            <div><dt>Kondisi</dt><dd>Gudang menggunakan nilai <strong>Baik</strong> dan kolomnya tidak dapat diubah.</dd></div>
            <div><dt>Tahun pengadaan</dt><dd>Isi empat digit tahun pengadaan, misalnya 2025.</dd></div>
            <div><dt>Nama kegiatan pengadaan</dt><dd>Isi nama kegiatan yang mengadakan barang, misalnya Pengadaan Aloptama MKG 2025.</dd></div>
            <div><dt>Catatan</dt><dd>Isi keterangan tambahan yang penting untuk Unit tersebut.</dd></div>
          </dl>
          <p>Gudang tidak menampilkan Metadata Aloptama atau Tahun Pasang. Ringkasannya menggunakan jumlah kategori tercatat dan jumlah Unit fisik, bukan persentase kelengkapan.</p>
          <p>Klik <strong>Hapus kategori</strong> jika kategori salah dipilih. Jika kategori sudah berisi Unit, aplikasi meminta konfirmasi. Unit sensor kombinasi tetap dipertahankan pada fungsi lain yang masih digunakan.</p>
        </section>

        <section id="penyimpanan" className="guide-article">
          <p className="guide-section-label">SIMPAN DAN PENGGUNAAN BERSAMA</p>
          <h3>Bagaimana memastikan data aman dan tersimpan?</h3>
          <h4>Penyimpanan otomatis</h4>
          <p>Saat mode pengisian aktif, perubahan disimpan otomatis beberapa saat setelah Anda berhenti mengubah form. Draf juga disimpan pada browser yang sedang digunakan.</p>
          <h4>Simpan manual</h4>
          <p>Klik <strong>Simpan</strong> jika ingin segera mengirim perubahan ke server. Tunggu sampai muncul <strong>Tersimpan ke server</strong>, <strong>Semua perubahan sudah tersimpan</strong>, atau status <strong>Tersimpan di server</strong>.</p>
          <h4>Jika belum tersinkron</h4>
          <p>Status <strong>Tersimpan lokal</strong> atau pesan <strong>Ada perubahan belum tersinkron</strong> berarti data masih berada di browser dan belum tersedia dari perangkat lain. Jangan hapus data browser atau menutup pekerjaan sebelum mencoba menyimpan kembali.</p>
          <h4 id="data-sedang-diedit">Jika data sedang diedit sesi lain</h4>
          <ol>
            <li>Baca nama operator dan waktu aktivitas terakhir.</li>
            <li>Tunggu pengguna lain klik <strong>Selesai Mengedit</strong>.</li>
            <li>Klik <strong>Coba lagi</strong> untuk memeriksa kondisi terbaru.</li>
            <li>Jika tombol <strong>Ambil alih draf</strong> muncul karena tidak ada aktivitas dalam waktu lama, gunakan hanya setelah yakin editor sebelumnya sudah berhenti.</li>
          </ol>
          <p>Hindari mengedit Site dan Subtipe yang sama secara bersamaan dari dua tab atau perangkat, walaupun memakai akun Stasiun yang sama.</p>
          <h4>Jika data berubah sejak dibuka</h4>
          <p>Klik <strong>Muat versi terbaru</strong>, periksa data terbaru, lalu mulai edit kembali. Data dari server dan perubahan Anda yang belum dikirim tidak digabungkan otomatis.</p>
          <h4>Selesai mengedit</h4>
          <p>Klik <strong>Selesai Mengedit</strong>. Aplikasi menyimpan perubahan terakhir lalu melepas hak edit sesi ini. Jika pelepasan belum terkonfirmasi, aplikasi memberi tahu bahwa data sudah tersimpan dan hak edit akan berakhir otomatis.</p>
        </section>

        <section id="unduh-data" className="guide-article">
          <p className="guide-section-label">UNDUH HASIL</p>
          <h3>Bagaimana mengunduh CSV atau JSON?</h3>
          <ol>
            <li>Pilih Site dan Subtipe yang ingin diunduh.</li>
            <li>Klik <strong>Unduh</strong> saat mode lihat atau mode pengisian.</li>
            <li>Pilih <strong>Unduh CSV</strong> atau <strong>Unduh JSON</strong>.</li>
          </ol>
          <ul>
            <li><strong>CSV:</strong> berisi baris data kategori dan setiap Unit. Format ini mudah dibuka dengan aplikasi spreadsheet.</li>
            <li><strong>JSON:</strong> berisi salinan data dengan susunan Site, metadata, kategori, Produk, dan Unit. Format ini lebih cocok untuk penyimpanan atau pengolahan data terstruktur.</li>
          </ul>
          <p>Nama file mengikuti pola <code>nama-stasiun_nama-site_nama-subtipe.csv</code> atau <code>.json</code>. Spasi pada setiap bagian nama diubah menjadi tanda hubung.</p>
          <p>Jika ada perubahan yang belum tersimpan, aplikasi mencoba menyimpan lebih dahulu. Bila server belum dapat dihubungi, file tetap dapat dibuat dari data terbaru di browser dan aplikasi menampilkan peringatan.</p>
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
                  <div><dt>Yang harus dilakukan</dt><dd>{item.action}</dd></div>
                  <div><dt>Kapan menghubungi Admin</dt><dd>{item.admin}</dd></div>
                </dl>
              </details>
            ))}
          </div>
        </section>

        <section id="faq" className="guide-article">
          <p className="guide-section-label">PERTANYAAN UMUM</p>
          <h3>FAQ</h3>
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
          <h3>Arti istilah pada aplikasi</h3>
          <dl className="guide-glossary">
            {glossary.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}
          </dl>
        </section>

        <GuideUpdatesSection audience="station" />

        <p className="guide-more">Jika masalah tetap terjadi, catat nama Stasiun, Site, Subtipe, waktu kejadian, status penyimpanan, dan pesan yang terlihat, lalu hubungi Super Admin.</p>
      </article>
    </main>
  );
}
