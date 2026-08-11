# STC AutoTrade — Design System

Dihasilkan oleh `design-system/_build.mjs`. **Jangan menyunting berkas di folder
ini secara langsung** — ubah generatornya lalu jalankan:

```
node design-system/_build.mjs
```

`tokens.css` dan `components.css` dipakai aplikasi; sisanya halaman pratinjau.

## Kenapa terpisah dari koala

Identitas visualnya berbeda. Koala memakai eucalyptus yang diturunkan
saturasinya; STC memakai **emerald** yang lebih tajam (`#059669` terang /
`#2DD4A7` gelap) — warna yang memang sudah dipakai aplikasinya. Menyalin token
koala akan mengganti merek STC, bukan merapikannya.

## Aturan yang mengikat

- **Aksen ≠ untung.** Emerald merek dipakai untuk aksi; hijau untung dan merah
  rugi dikunci hanya untuk angka uang.
- **Angka memakai `tabular-nums`** supaya kolom tidak bergoyang saat berubah.
- **Font sistem**, nol byte diunduh.
- Kontras dihitung di generator, bukan ditebak — lihat catatan di
  `fondasi/warna.html`.
