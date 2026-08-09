# Panduan Perubahan Aloptama Collect

Panduan ini dimulai dari perubahan yang paling aman. Kerjakan satu jenis
perubahan dalam satu waktu agar kesalahan mudah ditemukan.

## Sebelum mengubah

1. Pastikan folder yang dibuka adalah `Z:\collect-irm-data\web`.
2. Jangan mengedit file `app/data.generated.json` secara langsung.
3. Catat kondisi awal dengan `git status` atau buat salinan folder jika belum
   terbiasa menggunakan Git.

## Mengubah pilihan pada form

Buka `app/config/form-options.ts`. Di file ini tersedia daftar:

- kondisi perangkat;
- bahan mounting;
- sumber anggaran;
- status kepemilikan;
- status operasional;
- metode ukur;
- metode transport;
- zona waktu; dan
- interval pengiriman data.

Contoh menambahkan pilihan kondisi:

```ts
export const CONDITION_OPTIONS = [
  "Baik",
  "Rusak ringan",
  "Perlu kalibrasi",
] as const;
```

Perhatikan koma dan tanda kutip. Jangan mengubah nama konstanta yang ditulis
dengan huruf kapital.

## Mengubah stasiun, site, subtipe, barang, atau produk

Data sumber berada di empat file CSV pada folder `Z:\collect-irm-data`:

- `List Barang Terpasang_Group By Stamet - Nama Stasiun.csv`;
- `List Barang Terpasang_Group By Stamet - Jenis Site.csv`;
- `List Barang Terpasang_Group By Stamet - Barang.csv`;
- `List Barang Terpasang_Group By Stamet - products.csv`.

Setelah CSV diperbarui, jalankan:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-data.ps1
```

Script akan membuat ulang `app/data.generated.json`, menghapus produk kosong
dan duplikat, lalu memeriksa bahwa setiap tipe site mempunyai subtipe dan
profil barang. Kolom UUID dan status aktif tambahan akan dipertahankan.

Untuk validasi dan sinkronisasi master Supabase, ikuti
`docs/MASTER-DATA-SUPABASE.md`. Jangan mengubah UUID yang sudah dihasilkan.

## Mengubah teks atau susunan form

- Form inventaris berada di `app/InventoryApp.tsx`.
- Form metadata site berada di `app/SiteMetadataForm.tsx`.
- Tampilan dan warna berada di `app/globals.css`.

Perubahan di tiga file ini lebih berisiko. Ubah bagian kecil, simpan, lalu
langsung jalankan pemeriksaan otomatis.

## Mengubah kolom metadata

Penambahan atau penghapusan kolom harus dilakukan pada beberapa tempat:

1. Tambahkan nama data di `app/types/site-metadata.ts`.
2. Tambahkan nilai kosong di `app/lib/site-metadata.ts`.
3. Tambahkan inputnya di `app/SiteMetadataForm.tsx`.
4. Jika harus ikut CSV, tambahkan judul dan nilainya di
   `app/lib/site-metadata.ts` pada urutan yang sama.
5. Tambahkan pemeriksaan pada `tests/rendered-html.test.mjs`.

Jangan hanya menambahkan input pada tampilan. Jika langkah lain dilewati, data
bisa tidak tersimpan atau tidak ikut dalam hasil ekspor.

## Memeriksa hasil

Jalankan:

```powershell
npm.cmd run check
```

Jika muncul error, baca nama file dan nomor baris pertama yang disebutkan.
Perbaiki error tersebut sebelum melanjutkan.

Untuk melihat hasil di browser:

```powershell
npm.cmd run dev
```

Periksa pemilihan lokasi, metadata wilayah, penambahan perangkat, perubahan
jumlah unit, penyimpanan draf, dan unduhan CSV.

## Menyimpan perubahan dengan Git

```powershell
git status
git add app docs tests README.md package.json
git commit -m "jelaskan perubahan secara singkat"
```

Jangan memasukkan `node_modules`, `dist`, file rahasia, atau hasil ekspor data
pengguna ke Git.

## Publikasi ke Vercel

Jalankan `npm.cmd run check`, tinjau `git status`, lalu commit dan push perubahan
ke branch produksi. Vercel akan membuat deployment baru secara otomatis setelah
repository GitHub dihubungkan. Build default adalah native Next.js.

Deployment ChatGPT Sites lama masih dapat diperiksa dengan
`npm.cmd run build:sites`. Jangan hapus konfigurasi Sites sebelum migrasi
Vercel selesai dan website baru sudah diverifikasi.
