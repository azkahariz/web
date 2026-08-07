# Struktur Proyek

## Peta singkat

```text
web/
|-- app/
|   |-- api/                 Penghubung ke layanan eksternal
|   |-- config/              Daftar pilihan yang mudah diubah
|   |-- hooks/               Logika React yang dapat dipakai ulang
|   |-- lib/                 Fungsi pengolahan data
|   |-- types/               Bentuk atau struktur data
|   |-- InventoryApp.tsx     Alur utama inventaris
|   |-- SiteMetadataForm.tsx Form metadata Aloptama
|   |-- data.generated.json  Hasil otomatis dari CSV, jangan diedit
|   `-- globals.css          Seluruh tampilan aplikasi
|-- db/                      Tempat skema database pada tahap berikutnya
|-- docs/                    Dokumentasi pemeliharaan
|-- scripts/                 Pembuat data aplikasi dari CSV
|-- tests/                   Pemeriksaan perilaku penting
`-- README.md                Pintu masuk dokumentasi
```

## Aliran data saat ini

```text
CSV sumber
  -> scripts/generate-data.ps1
  -> app/data.generated.json
  -> InventoryApp
  -> localStorage browser
  -> ekspor CSV atau JSON
```

Data wilayah mempunyai alur terpisah:

```text
SiteMetadataForm
  -> /api/regions
  -> wilayah.id
```

Route internal digunakan agar browser pengguna tidak bergantung langsung pada
aturan akses lintas domain milik layanan wilayah.

## Batas tanggung jawab

| Lokasi | Tanggung jawab |
| --- | --- |
| `app/config` | Nilai pilihan yang tampil pada form |
| `app/types` | Nama kolom dan bentuk data |
| `app/lib` | Pengolahan, ekspor, dan penyimpanan lokal |
| `app/hooks` | Pengambilan data yang terkait dengan tampilan React |
| `app/api` | Komunikasi server dengan layanan luar |
| `app/*.tsx` | Tampilan dan interaksi pengguna |
| `tests` | Kontrak perilaku yang tidak boleh rusak |

## Aturan pemeliharaan

1. Data yang sering berubah ditempatkan di `config` atau CSV, bukan ditulis
   berulang di komponen.
2. Satu nama data didefinisikan sekali di `types`.
3. Fungsi pengolahan yang tidak menampilkan elemen layar ditempatkan di `lib`.
4. File otomatis tidak diedit secara manual.
5. Perubahan perilaku harus disertai perubahan tes.
6. Jangan mencampurkan perapian kode dengan perubahan fitur besar dalam satu
   commit.
