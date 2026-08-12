# Panduan Bulk Download

Terakhir diperbarui: 12 Agustus 2026. Fitur ini hanya tersedia untuk Super
Admin.

1. Buka **Stasiun & Pengisian**, lalu tekan **Bulk Download**.
2. Pilih **Stasiun**.
3. Pilih **Semua Site** untuk mengunduh seluruh stasiun, atau pilih satu Site.
4. Pada Site tertentu, pilih **Semua Subtipe** atau satu Subtipe.

Hasilnya:

```text
Stasiun -> semua Site dan subtipe valid -> ZIP
Site    -> semua subtipe valid         -> ZIP
Subtipe -> satu file                   -> CSV
```

Download hanya membaca data. Tidak mengambil lock, tidak membuat submission,
dan tidak mengubah version. Kombinasi Site/Subtipe yang belum mempunyai
submission tetap ada sebagai CSV template dengan field pengisian kosong.

Nama file mengikuti scope: ZIP stasiun memakai `nama-stasiun.zip`, ZIP Site
memakai `nama-stasiun_nama-site.zip`, dan CSV memakai
`nama-stasiun_nama-site_nama-subtipe.csv`.

Untuk AWOS Kategori III, hanya empat subtipe family Site yang valid yang masuk
ke pilihan dan ZIP. Variant yang belum terpetakan tidak dapat diekspor sampai
master/mapping diperbaiki.

← [Panduan Super Admin](PANDUAN-SUPER-ADMIN.md) | → [Troubleshooting](TROUBLESHOOTING.md)
