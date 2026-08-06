# IRM Collect — prototipe lokal

## Menjalankan

```powershell
cd Z:\collect-irm-data\web
npm.cmd install
npm.cmd run dev
```

Buka alamat lokal yang ditampilkan oleh terminal, biasanya `http://localhost:3000`.

## Memperbarui data dari CSV

CSV sumber tetap berada satu tingkat di atas folder `web`. Setelah CSV diperbarui, jalankan:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-data.ps1
```

Kemudian mulai ulang aplikasi. Script akan membersihkan baris produk yang tidak lengkap, memangkas spasi, dan membuang pasangan merek–tipe yang sama persis.

## Penyimpanan

Draf disimpan di `localStorage` browser pada perangkat yang sedang digunakan. Tombol **Unduh hasil CSV** mengekspor satu baris per produk beserta lokasi dan metadatanya; kategori yang belum diisi tetap disertakan sebagai baris kosong. Ekspor JSON juga tetap tersedia.
