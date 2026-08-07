# IRM Collect

Website pendataan metadata Aloptama dan barang terpasang. Versi saat ini
menyimpan draf otomatis di browser pengguna dan dapat mengekspor hasil ke CSV
atau JSON.

## Mulai di sini

Dokumentasi dibuat berurutan agar perubahan sederhana dapat dilakukan tanpa
harus memahami seluruh kode:

1. [Panduan perubahan](docs/PANDUAN-PERUBAHAN.md) - langkah paling praktis.
2. [Struktur proyek](docs/STRUKTUR-PROYEK.md) - fungsi setiap folder dan file.
3. [Checklist sebelum publikasi](docs/CHECKLIST-PUBLIKASI.md) - pemeriksaan wajib.
4. [Rencana database](docs/RENCANA-DATABASE.md) - batas sistem saat ini dan arah berikutnya.

## Menjalankan di komputer

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
```

Buka alamat lokal yang ditampilkan terminal, biasanya
`http://localhost:3000`.

## Pemeriksaan otomatis

Setelah melakukan perubahan, jalankan satu perintah berikut:

```powershell
npm.cmd run check
```

Perubahan baru boleh dipublikasikan jika pemeriksaan selesai tanpa error.

## Penyimpanan saat ini

Draf disimpan dalam `localStorage` browser pada perangkat yang sedang
digunakan. Draf belum tersimpan di server, belum terhubung ke akun pengguna,
dan belum dapat dilanjutkan dari perangkat lain.
