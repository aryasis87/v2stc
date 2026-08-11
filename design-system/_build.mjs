// design-system/_build.mjs — GENERATOR design system STC AutoTrade
// ─────────────────────────────────────────────────────────────────────
// SEMUA berkas di folder ini dihasilkan oleh skrip ini. JANGAN menyunting
// HTML pratinjau atau CSS-nya langsung — ubah generator ini, lalu jalankan:
//
//     node design-system/_build.mjs
//
// Keluarannya: tokens.css + components.css (dipakai aplikasi) dan halaman
// pratinjau untuk fondasi, komponen, dan pola layar.
//
// Kenapa STC punya design system sendiri, bukan menyalin koala: identitas
// visualnya berbeda. Koala memakai eucalyptus yang diturunkan saturasinya;
// STC memakai EMERALD yang lebih tajam (#2DD4A7 gelap / #059669 terang) —
// warna yang sudah dipakai aplikasinya hari ini. Menyalin token koala akan
// mengganti merek STC, bukan merapikannya.
// ─────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath, bukan .pathname: pathname masih ter-URL-encode, sehingga
// spasi pada "Next JS" menjadi %20 dan berkasnya tertulis ke folder salah.
const OUT = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════ TOKEN ═══════════════ */

const LIGHT = `
  --s-bg:#F7F8F9;        --s-bg-el:#FFFFFF;
  --s-card:#FFFFFF;      --s-card-2:#F2F4F5;   --s-faint:#F7F8F9;
  --s-text:#14161A;      --s-sub:#4A5058;      --s-muted:#7A828C;
  --s-line:#E6E8EB;      --s-hair:rgba(20,22,26,0.07);
  --s-acc:#059669;       --s-acc-tint:rgba(5,150,105,0.09);  --s-on-acc:#FFFFFF;
  --s-gain:#0F7A4E;      --s-loss:#E11D48;     --s-loss-tint:rgba(225,29,72,0.08);
  --s-warn:#B45309;      --s-warn-tint:rgba(180,83,9,0.09);  --s-on-warn:#FFFFFF;
  --s-violet:#7C3AED;    --s-violet-tint:rgba(124,58,237,0.08);
  /* Palet kategori — dipakai menandai jenis/aset di riwayat, BUKAN status.
     Untung/rugi tetap memakai --s-gain/--s-loss supaya artinya tak kabur. */
  --s-blue:#2563EB;      --s-pink:#BE185D;     --s-orange:#EA580C;   --s-grey:#8E8E93;
  --s-press:rgba(2,6,23,0.045);                --s-skel:rgba(2,6,23,0.06);
  /* Bilah atas tembus pandang. Ditulis tegas, bukan color-mix() dari --s-bg,
     karena color-mix butuh WebView Chrome 111+ dan APK berjalan di perangkat lama. */
  --s-header:rgba(247,248,249,0.90);
  /* Lapis dialog & isian — dipakai halaman profil. */
  --s-acc-bdr:rgba(5,150,105,0.30);            --s-acc-bdr-act:rgba(5,150,105,0.45);
  /* Hijau KEDUA, sengaja dibedakan dari --s-acc: dipakai menandai kategori
     di dashboard, bukan aksi utama. Kalau disamakan, penanda kategori jadi
     tak bisa dibedakan dari tombol aksi. */
  --s-sky:#16A34A;       --s-sky-tint:rgba(22,163,74,0.09);
  --s-orange-tint:rgba(234,88,12,0.09);        --s-pink-tint:rgba(190,24,93,0.08);
  --s-modal:#FFFFFF;     --s-backdrop:rgba(15,23,42,0.40);   --s-input-bg:#F1F3F5;
  --s-hero-grad:linear-gradient(135deg, rgba(5,150,105,0.14) 0%, rgba(5,150,105,0.03) 55%, rgba(37,99,235,0.06) 100%);
  --s-shadow-card:0 1px 2px rgba(20,22,26,0.05), 0 8px 24px -16px rgba(20,22,26,0.18);
  --s-shadow-sheet:0 -8px 40px -12px rgba(20,22,26,0.22);
  --s-card-hi:#FFFFFF;   --s-card-lo:#FBFCFC;  --s-card-edge:rgba(255,255,255,0.9);
`;

const DARK = `
  /* Jarak antartingkat gelap sengaja dilebarkan. Ramp sebelumnya
     (#0B0D10 / #141821 / #1B2029) hanya berselisih sekitar sembilan tingkat,
     sehingga kartu nyaris tak terpisah dari latarnya dan halaman terlihat
     rata — ditemukan saat menggarap halaman profil, lalu diangkat ke sini
     supaya seluruh aplikasi ikut, bukan satu halaman saja. */
  --s-bg:#0F1114;        --s-bg-el:#171A1F;
  --s-card:#1A1C20;      --s-card-2:#24262B;   --s-faint:#141619;
  --s-text:#F2F4F6;      --s-sub:#A8B0BA;      --s-muted:#6E7784;
  --s-line:rgba(255,255,255,0.11);             --s-hair:rgba(255,255,255,0.07);
  --s-acc:#2DD4A7;       --s-acc-tint:rgba(45,212,167,0.14); --s-on-acc:#08201A;
  --s-gain:#3FD08C;      --s-loss:#FB7185;     --s-loss-tint:rgba(251,113,133,0.14);
  --s-warn:#FBBF24;      --s-warn-tint:rgba(251,191,36,0.14); --s-on-warn:#1A1612;
  --s-violet:#C084FC;    --s-violet-tint:rgba(192,132,252,0.14);
  --s-blue:#60A5FA;      --s-pink:#F472B6;     --s-orange:#FB923C;   --s-grey:#98989F;
  --s-press:rgba(255,255,255,0.06);            --s-skel:rgba(255,255,255,0.07);
  --s-header:rgba(15,17,20,0.88);
  --s-acc-bdr:rgba(45,212,167,0.30);           --s-acc-bdr-act:rgba(45,212,167,0.55);
  --s-sky:#4ADE80;       --s-sky-tint:rgba(74,222,128,0.14);
  --s-orange-tint:rgba(251,146,60,0.14);       --s-pink-tint:rgba(244,114,182,0.14);
  --s-modal:#1E2024;     --s-backdrop:rgba(0,0,0,0.65);      --s-input-bg:rgba(255,255,255,0.07);
  --s-hero-grad:linear-gradient(135deg, rgba(45,212,167,0.22) 0%, rgba(45,212,167,0.05) 55%, rgba(96,165,250,0.08) 100%);
  --s-shadow-card:0 1px 2px rgba(0,0,0,0.4), 0 10px 30px -18px rgba(0,0,0,0.8);
  --s-shadow-sheet:0 -10px 44px -12px rgba(0,0,0,0.7);
  --s-card-hi:#171C25;   --s-card-lo:#12161D;  --s-card-edge:rgba(255,255,255,0.05);
`;

const SHARED = `
  --s-r-card:18px;  --s-r-ctl:14px;  --s-r-pill:999px;
  --s-s1:4px; --s-s2:8px; --s-s3:12px; --s-s4:16px; --s-s5:24px; --s-s6:32px;
  --s-dur:.22s;  --s-ease:cubic-bezier(.32,.72,0,1);
  --s-font:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif;
`;

const TOKENS_CSS = `/* ─────────────────────────────────────────────
   tokens.css — DIHASILKAN oleh design-system/_build.mjs
   Jangan disunting langsung.

   Tiga keadaan tema: pilihan tegas menempel data-theme pada <html>;
   bawaan "system" tidak menempel apa pun, sehingga hanya
   prefers-color-scheme yang membedakan. Karena itu palet TERANG
   didefinisikan di :root polos, lalu gelap ditimpa dua kali —
   lewat media query dan lewat [data-theme="dark"] — supaya tombol
   tema menang di kedua arah.
   ───────────────────────────────────────────── */
:root{${LIGHT}${SHARED}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
:root[data-theme="light"]{${LIGHT}}
`;

/* ═══════════════ KOMPONEN ═══════════════ */

const COMPONENTS_CSS = `/* ─────────────────────────────────────────────
   components.css — DIHASILKAN oleh design-system/_build.mjs
   ───────────────────────────────────────────── */

/* ── Kartu ───────────────────────────────────────────────── */
.s-card{background:var(--s-card);border:1px solid var(--s-line);border-radius:var(--s-r-card);
  padding:var(--s-s4);box-shadow:var(--s-shadow-card)}
.s-card--hero{position:relative;overflow:hidden;
  background:
    radial-gradient(130% 120% at 100% 0%, var(--s-hero-tint, transparent) 0%, transparent 58%),
    linear-gradient(180deg, var(--s-card-hi) 0%, var(--s-card-lo) 100%);
  box-shadow:var(--s-shadow-card), inset 0 1px 0 var(--s-card-edge)}
.s-card--flat{box-shadow:none;background:var(--s-card-2)}

/* ── Tipografi ───────────────────────────────────────────── */
.s-h1{font-size:26px;font-weight:750;letter-spacing:-.03em;color:var(--s-text);margin:0}
.s-h2{font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--s-text);margin:0}
.s-label{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--s-muted);margin:0}
.s-body{font-size:13px;line-height:1.6;color:var(--s-sub);margin:0}
.s-num{font-size:32px;font-weight:800;letter-spacing:-.035em;font-variant-numeric:tabular-nums;
  line-height:1.05;margin:0}
.s-num--gain{color:var(--s-gain)} .s-num--loss{color:var(--s-loss)}

/* ── Tombol ──────────────────────────────────────────────── */
.s-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  height:48px;padding:0 20px;border-radius:var(--s-r-ctl);border:0;cursor:pointer;
  font:inherit;font-size:14.5px;font-weight:700;letter-spacing:-.01em;
  background:var(--s-acc);color:var(--s-on-acc);transition:transform .12s var(--s-ease)}
.s-btn:active{transform:scale(.985)}
.s-btn--ghost{background:var(--s-card-2);color:var(--s-text);border:1px solid var(--s-line)}
.s-btn--danger{background:var(--s-loss);color:#fff}
.s-btn--block{width:100%}

/* ── Segmen (Real / Demo) ────────────────────────────────── */
.s-seg{display:inline-flex;padding:3px;border-radius:var(--s-r-pill);
  background:var(--s-card-2);border:1px solid var(--s-line)}
.s-seg button{border:0;background:transparent;font:inherit;font-size:12px;font-weight:700;
  padding:6px 14px;border-radius:var(--s-r-pill);color:var(--s-muted);cursor:pointer}
.s-seg button[aria-selected="true"]{background:var(--s-bg-el);color:var(--s-text);
  box-shadow:0 1px 3px rgba(0,0,0,.12)}

/* ── Petak status ────────────────────────────────────────── */
.s-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--s-s2)}
.s-tile{background:var(--s-card);border:1px solid var(--s-line);border-radius:var(--s-r-ctl);
  padding:10px 8px;text-align:center}
.s-tile b{display:block;font-size:12.5px;font-weight:700;color:var(--s-text);letter-spacing:-.01em}
.s-tile span{display:block;font-size:9px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:var(--s-muted);margin-top:3px}
.s-tile.is-on b{color:var(--s-acc)}
.s-tile.is-warn b{color:var(--s-warn)}

/* ── Baris daftar ────────────────────────────────────────── */
.s-row{display:flex;align-items:center;gap:12px;padding:13px 14px;width:100%;
  background:transparent;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.s-row + .s-row{border-top:1px solid var(--s-hair)}
.s-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.s-row-main b{font-size:13.5px;font-weight:650;letter-spacing:-.01em;color:var(--s-text)}
.s-row-main span{font-size:11px;color:var(--s-muted)}
.s-row-val{font-size:12.5px;font-weight:700;color:var(--s-sub);flex:none}
.s-list{background:var(--s-card);border:1px solid var(--s-line);border-radius:var(--s-r-card);
  overflow:hidden}

/* ── Ikon kotak ──────────────────────────────────────────── */
.s-sq{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:none;
  background:var(--s-card-2);color:var(--s-sub)}
.s-sq.is-acc{background:var(--s-acc-tint);color:var(--s-acc)}

/* ── Lencana ─────────────────────────────────────────────── */
.s-badge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;
  padding:3px 9px;border-radius:var(--s-r-pill);background:var(--s-card-2);color:var(--s-muted);
  border:1px solid var(--s-line)}
.s-badge--acc{background:var(--s-acc-tint);color:var(--s-acc);border-color:transparent}
.s-badge--warn{background:var(--s-warn-tint);color:var(--s-warn);border-color:transparent}
.s-badge--loss{background:var(--s-loss-tint);color:var(--s-loss);border-color:transparent}

/* ── Timeline riwayat ────────────────────────────────────── */
.s-tl{position:relative;padding-left:26px}
.s-tl::before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;
  background:var(--s-hair);border-radius:2px}
.s-tl-item{position:relative;padding:11px 0}
.s-tl-item::before{content:"";position:absolute;left:-21px;top:16px;width:10px;height:10px;
  border-radius:50%;background:var(--s-card);border:2px solid var(--s-muted)}
.s-tl-item.is-win::before{border-color:var(--s-gain);background:var(--s-gain)}
.s-tl-item.is-lose::before{border-color:var(--s-loss);background:var(--s-loss)}
.s-tl-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.s-tl-time{font-size:11px;color:var(--s-muted);font-variant-numeric:tabular-nums}
.s-tl-amt{font-size:13px;font-weight:750;font-variant-numeric:tabular-nums}

/* ── Dok navigasi ─────────────────────────────────────────────
   Dok MENGAMBANG, bukan bilah menempel di tepi. Bentuk ini diambil dari
   aplikasi STC yang sudah berjalan — ia lebih baik daripada bilah polos:
   sudut membulat penuh, latar buram, dan garis rambut membuatnya terbaca
   sebagai lapisan di atas konten, bukan potongan layar yang hilang.
   Design system mengikuti aplikasi di sini, bukan sebaliknya. */
.s-dock{position:relative;display:flex;gap:2px;margin:0 12px 12px;padding:6px;
  border-radius:var(--s-r-pill);background:var(--s-bg-el);
  border:1px solid var(--s-line);box-shadow:var(--s-shadow-card);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.s-dock a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:8px 0;border-radius:var(--s-r-pill);text-decoration:none;
  color:var(--s-muted);font-size:10px;font-weight:650}
.s-dock a[aria-current="page"]{color:var(--s-acc);background:var(--s-acc-tint)}

/* ── Pil sesi ────────────────────────────────────────────── */
.s-pill{display:flex;align-items:center;gap:10px;padding:9px 13px;border-radius:var(--s-r-pill);
  background:var(--s-bg-el);border:1px solid var(--s-line);box-shadow:var(--s-shadow-card)}
.s-pill-dot{width:8px;height:8px;border-radius:50%;background:var(--s-acc);flex:none;
  box-shadow:0 0 0 4px var(--s-acc-tint)}

/* ── Akordeon panduan ────────────────────────────────────── */
.s-acc{background:var(--s-card);border:1px solid var(--s-line);border-radius:var(--s-r-card);
  overflow:hidden}
.s-acc-head{display:flex;align-items:center;gap:11px;padding:14px;cursor:pointer}
.s-acc-head b{flex:1;font-size:13.5px;font-weight:650;color:var(--s-text)}
.s-acc-body{padding:0 14px 14px 59px;font-size:12.5px;line-height:1.65;color:var(--s-sub)}
.s-acc + .s-acc{margin-top:10px}

/* ── Profil ──────────────────────────────────────────────── */
.s-ava{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;
  background:var(--s-acc-tint);color:var(--s-acc);font-size:20px;font-weight:800;flex:none}
.s-bal{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.s-bal-card{background:var(--s-card);border:1px solid var(--s-line);border-radius:var(--s-r-ctl);
  padding:13px 14px}
/* Saldo demo bisa mencapai ratusan juta dan membungkus jadi dua baris,
   membuat kedua kartu tidak sejajar. Ukurannya diperkecil dan dikunci satu
   baris; kalau tetap tak muat, dipotong dengan elipsis daripada merusak baris. */
.s-bal-card b{display:block;font-size:15px;font-weight:800;letter-spacing:-.025em;
  font-variant-numeric:tabular-nums;color:var(--s-text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-bal-card span{display:block;font-size:10px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:var(--s-muted);margin-bottom:5px}
`;

/* ═══════════════ KERANGKA PRATINJAU ═══════════════ */

// Token bercakupan PANEL. tokens.css mendefinisikan tema gelap di
// `:root[data-theme="dark"]`, yang HANYA cocok dengan elemen akar — panel
// pratinjau bersarang tidak pernah kena, sehingga panel "Gelap" tampil terang.
// Di sini selektornya tanpa :root supaya berlaku pada div mana pun.
const PANE_TOKENS = `
[data-theme="light"]{${LIGHT}}
[data-theme="dark"]{${DARK}}
`;

const PAGE_CSS = PANE_TOKENS + `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--s-bg);color:var(--s-text);font-family:var(--s-font);
  padding:28px 22px 48px}
.ds-wrap{max-width:1060px;margin:0 auto}
.ds-eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:var(--s-acc);margin:0 0 6px}
.ds-title{font-size:24px;font-weight:750;letter-spacing:-.03em;margin:0 0 8px}
.ds-sub{font-size:13.5px;line-height:1.65;color:var(--s-sub);margin:0 0 26px;max-width:62ch}
.ds-duo{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media (max-width:820px){.ds-duo{grid-template-columns:1fr}}
/* Properti color diwarisi sebagai NILAI TERHITUNG: tanpa menegaskannya di
   sini, anak-anak panel mewarisi warna teks dari body yang sudah dihitung
   memakai token TERANG, sehingga panel gelap tampil berteks gelap. */
.ds-pane{border-radius:20px;padding:20px;border:1px solid var(--s-line);
  background:var(--s-bg);color:var(--s-text)}
.ds-pane-tag{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--s-muted);margin:0 0 14px}
.ds-notes{margin-top:26px;padding:18px 20px;border-radius:16px;background:var(--s-card-2);
  border:1px solid var(--s-line)}
.ds-notes ul{margin:0;padding-left:18px}
.ds-notes li{font-size:12.5px;line-height:1.7;color:var(--s-sub);margin-bottom:7px}
.ds-notes li:last-child{margin-bottom:0}
.ds-phone{width:300px;margin:0 auto;border-radius:26px;overflow:hidden;
  border:1px solid var(--s-line);background:var(--s-bg);box-shadow:var(--s-shadow-card)}
.ds-screen{display:flex;flex-direction:column;min-height:520px}
.ds-screen-body{flex:1;padding:14px;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.ds-statusbar{display:flex;justify-content:space-between;padding:8px 14px 4px;
  font-size:10px;font-weight:650;color:var(--s-muted)}
.ds-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
.ds-sw{border-radius:14px;border:1px solid var(--s-line);overflow:hidden;background:var(--s-card)}
.ds-sw-chip{height:56px}
.ds-sw-meta{padding:9px 11px}
.ds-sw-meta b{display:block;font-size:12px;font-weight:700}
.ds-sw-meta span{display:block;font-size:10.5px;color:var(--s-muted);margin-top:2px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
`;

/* ═══════════════ PEMBANTU ═══════════════ */

const files = {};
const add = (p, c) => { files[p] = c; };

function page({ card, title, sub, body, notes = '' }) {
  return `<!-- @dsCard group="${card}" -->
<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — STC AutoTrade</title>
<link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../components.css">
<style>${PAGE_CSS}</style></head><body>
<div class="ds-wrap">
  <p class="ds-eyebrow">STC AutoTrade</p>
  <h1 class="ds-title">${title}</h1>
  <p class="ds-sub">${sub}</p>
  ${body}
  ${notes ? `<div class="ds-notes">${notes}</div>` : ''}
</div></body></html>`;
}

/** Dua panel bersisian: terang & gelap, supaya keduanya dinilai bersamaan. */
const duo = (inner) => `<div class="ds-duo">
  <div class="ds-pane" data-theme="light"><p class="ds-pane-tag">Terang</p>${inner}</div>
  <div class="ds-pane" data-theme="dark"><p class="ds-pane-tag">Gelap</p>${inner}</div>
</div>`;

const phone = (screen) => duo(`<div class="ds-phone">${screen}</div>`);

const statusbar = `<div class="ds-statusbar"><span>9:41</span><span>▮▮▮ 100%</span></div>`;

const dock = (aktif) => `<nav class="s-dock">
  ${[['Beranda', 'dashboard'], ['Riwayat', 'riwayat'], ['Panduan', 'panduan'], ['Profil', 'profil']]
    .map(([l, k]) => `<a href="#"${k === aktif ? ' aria-current="page"' : ''}><span style="font-size:15px">●</span>${l}</a>`)
    .join('')}
</nav>`;

/* ═══════════════ KONTRAS (dihitung, bukan ditebak) ═══════════════ */

const lum = (hex) => {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ═══════════════ HALAMAN: FONDASI ═══════════════ */

const PALET = [
  ['Latar aplikasi', '#F7F8F9', '#0B0D10', 'Dasar layar'],
  ['Permukaan kartu', '#FFFFFF', '#141821', 'Kartu & panel'],
  ['Teks utama', '#14161A', '#F2F4F6', 'Judul & angka'],
  ['Teks sekunder', '#4A5058', '#A8B0BA', 'Penjelasan'],
  ['Aksen merek', '#059669', '#2DD4A7', 'Emerald — tombol & tautan'],
  ['Untung', '#0F7A4E', '#3FD08C', 'Hanya untuk hasil uang'],
  ['Rugi', '#E11D48', '#FB7185', 'Hanya untuk hasil uang'],
  ['Peringatan', '#B45309', '#FBBF24', 'Martingale & batas'],
];

const swatch = ([nama, l, d, ket]) => `<div class="ds-sw">
  <div class="ds-sw-chip" style="background:linear-gradient(90deg,${l} 50%,${d} 50%)"></div>
  <div class="ds-sw-meta"><b>${nama}</b><span>${l} / ${d}</span>
    <span style="font-family:var(--s-font);color:var(--s-muted)">${ket}</span></div>
</div>`;

add('fondasi/warna.html', page({
  card: 'Fondasi',
  title: 'Warna',
  sub: 'Emerald adalah warna merek STC dan dipakai untuk aksi — bukan untuk hasil uang. Hijau untung dan merah rugi dikunci terpisah supaya angka keuntungan tidak pernah tertukar dengan tombol.',
  body: `<div class="ds-swatches">${PALET.map(swatch).join('')}</div>`,
  notes: `<ul>
    <li><b>Aksen ≠ untung.</b> Emerald merek (${'#059669'} / ${'#2DD4A7'}) dipakai tombol dan status aktif. Hijau untung (${'#0F7A4E'} / ${'#3FD08C'}) hanya muncul pada angka uang. Tanpa pemisahan ini, tombol "Mulai" terbaca seperti kabar untung.</li>
    <li><b>Kontras teks utama.</b> Terang ${ratio('#14161A', '#F7F8F9').toFixed(2)}:1 · Gelap ${ratio('#F2F4F6', '#0B0D10').toFixed(2)}:1 — keduanya lolos AAA.</li>
    <li><b>Kontras teks sekunder.</b> Terang ${ratio('#4A5058', '#F7F8F9').toFixed(2)}:1 · Gelap ${ratio('#A8B0BA', '#0B0D10').toFixed(2)}:1 — lolos AA.</li>
    <li><b>Aksen di atas latar.</b> Terang ${ratio('#059669', '#FFFFFF').toFixed(2)}:1 · Gelap ${ratio('#2DD4A7', '#141821').toFixed(2)}:1.</li>
  </ul>`,
}));

add('fondasi/tipografi.html', page({
  card: 'Fondasi',
  title: 'Tipografi',
  sub: 'Font sistem — nol byte diunduh, dan huruf yang sudah dikenal mata pengguna di perangkatnya sendiri. Angka memakai tabular-nums supaya kolom saldo dan P/L tidak bergoyang saat berubah.',
  body: duo(`<div style="display:flex;flex-direction:column;gap:14px">
    <p class="s-num s-num--gain">+Rp 1.284.500</p>
    <h1 class="s-h1">Keuntungan hari ini</h1>
    <h2 class="s-h2">Pengaturan Trading</h2>
    <p class="s-label">Akun &amp; Order</p>
    <p class="s-body">Bot menjalankan aturan yang Anda tetapkan. Ia tidak memprediksi pasar dan tidak menjamin hasil.</p>
  </div>`),
  notes: `<ul>
    <li><b>Angka pakai tabular-nums.</b> Saldo dan P/L berubah tiap detik; tanpa lebar digit tetap, angkanya bergeser kiri-kanan dan terbaca gelisah.</li>
    <li><b>Satu ukuran raksasa saja per layar.</b> Angka 32px hanya untuk keuntungan hari ini — kalau dipakai di banyak tempat, tidak ada lagi yang menonjol.</li>
  </ul>`,
}));

/* ═══════════════ HALAMAN: KOMPONEN ═══════════════ */

add('komponen/tombol.html', page({
  card: 'Komponen',
  title: 'Tombol',
  sub: 'Satu tombol utama per layar. Tinggi 48px agar nyaman disentuh jempol, dan menyusut halus saat ditekan sebagai umpan balik.',
  body: duo(`<div style="display:flex;flex-direction:column;gap:10px">
    <button class="s-btn s-btn--block">Mulai bot</button>
    <button class="s-btn s-btn--ghost s-btn--block">Lihat riwayat</button>
    <button class="s-btn s-btn--danger s-btn--block">Hentikan sesi</button>
  </div>`),
  notes: `<ul>
    <li><b>Merah hanya untuk berhenti.</b> Menghentikan sesi memutus order berjalan, jadi warnanya harus berbeda tegas dari aksi lain.</li>
    <li><b>Umpan balik lewat skala, bukan warna.</b> Perubahan warna saat ditekan mudah tertukar dengan keadaan nonaktif.</li>
  </ul>`,
}));

add('komponen/kartu-status.html', page({
  card: 'Komponen',
  title: 'Kartu & petak status',
  sub: 'Kartu utama membawa satu angka yang paling dicari pengguna. Petak di bawahnya menjawab "apa yang sedang terjadi" dalam sekali pandang.',
  body: duo(`<div style="display:flex;flex-direction:column;gap:12px">
    <div class="s-card s-card--hero" style="--s-hero-tint:var(--s-acc-tint)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <p class="s-label">Keuntungan hari ini</p>
        <div class="s-seg"><button>Real</button><button aria-selected="true">Demo</button></div>
      </div>
      <p class="s-num s-num--gain">+Rp 284.360</p>
      <p style="font-size:11.5px;color:var(--s-muted);margin:8px 0 0">12 Agustus 2026 · 23:39:52</p>
    </div>
    <div class="s-tiles">
      <div class="s-tile is-on"><b>Aktif</b><span>Bot</span></div>
      <div class="s-tile is-on"><b>Terhubung</b><span>Koneksi</span></div>
      <div class="s-tile"><b>Fastrade</b><span>Mode</span></div>
      <div class="s-tile is-warn"><b>Aktif</b><span>Martingale</span></div>
    </div>
  </div>`),
  notes: `<ul>
    <li><b>Tanggal dan jam ada DI DALAM kartu.</b> Angka keuntungan tanpa keterangan waktu ambigu — "hari ini" menurut zona waktu siapa.</li>
    <li><b>Petak martingale diberi warna peringatan saat aktif.</b> Itu keadaan yang menaikkan risiko, jadi tidak boleh terlihat senetral yang lain.</li>
  </ul>`,
}));

/* ═══════════════ POLA LAYAR ═══════════════ */

const screenDashboard = `<div class="ds-screen">
  ${statusbar}
  <div class="ds-screen-body">
    <div style="display:flex;align-items:center;gap:8px">
      <div class="s-sq is-acc" style="width:28px;height:28px;border-radius:9px;font-size:12px;font-weight:800">S</div>
      <b style="font-size:14px;letter-spacing:-.02em">STC AutoTrade</b>
      <span class="s-badge" style="margin-left:auto">v4.2</span>
    </div>
    <div class="s-card s-card--hero" style="--s-hero-tint:var(--s-acc-tint);padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <p class="s-label">Keuntungan hari ini</p>
        <div class="s-seg"><button>Real</button><button aria-selected="true">Demo</button></div>
      </div>
      <p class="s-num s-num--gain" style="font-size:27px">+Rp 284.360</p>
      <p style="font-size:10.5px;color:var(--s-muted);margin:7px 0 0">12 Agustus 2026 · 23:39:52</p>
    </div>
    <div class="s-tiles">
      <div class="s-tile is-on"><b>Aktif</b><span>Bot</span></div>
      <div class="s-tile is-on"><b>OK</b><span>Koneksi</span></div>
      <div class="s-tile"><b>FTT</b><span>Mode</span></div>
      <div class="s-tile is-warn"><b>On</b><span>Marti</span></div>
    </div>
    <button class="s-btn s-btn--block">Mulai bot</button>
    <p class="s-label">Strategi</p>
    <div class="s-list">
      <div class="s-row"><span class="s-sq is-acc">⚡</span>
        <span class="s-row-main"><b>Mode</b><span>Strategi yang dijalankan</span></span>
        <span class="s-row-val">Fastrade FTT</span></div>
      <div class="s-row"><span class="s-sq">◷</span>
        <span class="s-row-main"><b>Info sesi</b><span>Order &amp; log berjalan</span></span>
        <span class="s-row-val">Tidak aktif</span></div>
    </div>
  </div>
  ${dock('dashboard')}
</div>`;

const tl = (jam, tone, arah, aset, jml, hasil) => `<div class="s-tl-item ${tone}">
  <div class="s-tl-head">
    <b style="font-size:13px;letter-spacing:-.01em">${aset}</b>
    <span class="s-tl-amt" style="color:var(--s-${tone === 'is-win' ? 'gain' : 'loss'})">${jml}</span>
  </div>
  <div class="s-tl-head" style="margin-top:2px">
    <span class="s-tl-time">${jam} · ${arah}</span>
    <span class="s-badge ${tone === 'is-win' ? 's-badge--acc' : 's-badge--loss'}">${hasil}</span>
  </div>
</div>`;

const screenRiwayat = `<div class="ds-screen">
  ${statusbar}
  <div class="ds-screen-body">
    <h2 class="s-h2">Riwayat</h2>
    <div class="s-card s-card--flat" style="padding:12px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div><span class="s-label">Order</span><b style="display:block;font-size:16px;margin-top:3px">48</b></div>
        <div><span class="s-label">Menang</span><b style="display:block;font-size:16px;margin-top:3px;color:var(--s-gain)">31</b></div>
        <div><span class="s-label">Winrate</span><b style="display:block;font-size:16px;margin-top:3px">64%</b></div>
        <div><span class="s-label">P/L</span><b style="display:block;font-size:16px;margin-top:3px;color:var(--s-gain)">+284k</b></div>
      </div>
    </div>
    <div style="display:flex;gap:6px">
      <span class="s-badge s-badge--acc">Semua</span><span class="s-badge">Menang</span>
      <span class="s-badge">Kalah</span><span class="s-badge">Menunggu</span>
    </div>
    <div class="s-tl">
      ${tl('23:31', 'is-win', 'PUT', 'AUD/USD (OTC)', '+Rp 12.600', 'WIN')}
      ${tl('23:29', 'is-lose', 'CALL', 'EUR/USD', '−Rp 14.000', 'LOSE')}
      ${tl('23:27', 'is-win', 'CALL', 'Z-CRY/IDX', '+Rp 11.480', 'WIN')}
    </div>
  </div>
  ${dock('riwayat')}
</div>`;

const screenPanduan = `<div class="ds-screen">
  ${statusbar}
  <div class="ds-screen-body">
    <h2 class="s-h2">Panduan</h2>
    <p class="s-body" style="font-size:12px">Baca sekali sebelum memakai dana nyata.</p>
    <div class="s-acc">
      <div class="s-acc-head"><span class="s-sq is-acc">1</span><b>Menghubungkan akun</b><span style="color:var(--s-muted)">▾</span></div>
      <div class="s-acc-body">Masuk dengan akun Stockity Anda. Kata sandi tidak disimpan di server — hanya token yang tersimpan terenkripsi di perangkat.</div>
    </div>
    <div class="s-acc">
      <div class="s-acc-head"><span class="s-sq">2</span><b>Memilih mode</b><span style="color:var(--s-muted)">▸</span></div>
    </div>
    <div class="s-acc">
      <div class="s-acc-head"><span class="s-sq">3</span><b>Batas kerugian</b><span style="color:var(--s-muted)">▸</span></div>
    </div>
    <div class="s-card s-card--flat" style="border-color:var(--s-warn);background:var(--s-warn-tint)">
      <p style="font-size:12px;line-height:1.6;color:var(--s-warn);margin:0">
        <b>Jalankan di demo dulu.</b> Binary option berisiko tinggi. Bot memperbaiki kedisiplinan, bukan menghilangkan risiko.</p>
    </div>
  </div>
  ${dock('panduan')}
</div>`;

const screenProfil = `<div class="ds-screen">
  ${statusbar}
  <div class="ds-screen-body">
    <div style="display:flex;align-items:center;gap:13px">
      <div class="s-ava">SA</div>
      <div style="min-width:0">
        <b style="display:block;font-size:15px;letter-spacing:-.02em">Sani Aryasis</b>
        <span style="font-size:11.5px;color:var(--s-muted)">sanzystoreid@gmail.com</span>
        <div style="margin-top:5px"><span class="s-badge s-badge--acc">Mode REAL aktif</span></div>
      </div>
    </div>
    <div class="s-bal">
      <div class="s-bal-card"><span>Akun Real</span><b>Rp 2.418.900</b></div>
      <div class="s-bal-card"><span>Akun Demo</span><b>Rp 163.036.038</b></div>
    </div>
    <div class="s-list">
      <div class="s-row"><span class="s-sq">◐</span><span class="s-row-main"><b>Tema</b></span><span class="s-row-val">Gelap</span></div>
      <div class="s-row"><span class="s-sq">⚑</span><span class="s-row-main"><b>Bahasa</b></span><span class="s-row-val">Indonesia</span></div>
      <div class="s-row"><span class="s-sq">◈</span><span class="s-row-main"><b>Aktivasi</b><span>Mode REAL &amp; AI Signal</span></span><span class="s-row-val">›</span></div>
    </div>
    <button class="s-btn s-btn--ghost s-btn--block">Keluar</button>
  </div>
  ${dock('profil')}
</div>`;

add('pola/beranda.html', page({
  card: 'Pola layar',
  title: 'Beranda',
  sub: 'Satu angka besar yang paling dicari, keadaan bot dalam empat petak, lalu satu aksi. Sisanya di bawah lipatan.',
  body: phone(screenDashboard),
  notes: `<ul>
    <li><b>Urutannya mengikuti pertanyaan pengguna:</b> "berapa hasil saya hari ini?" → "apakah botnya jalan?" → "apa yang bisa saya lakukan?"</li>
    <li><b>Tanggal dan jam masuk ke dalam kartu keuntungan</b> — angka tanpa keterangan waktu tidak bisa diverifikasi pengguna.</li>
    <li><b>Hanya satu tombol utama.</b> Pengaturan tetap ada, tapi tidak bersaing perhatian dengan aksi Mulai.</li>
  </ul>`,
}));

add('pola/riwayat.html', page({
  card: 'Pola layar',
  title: 'Riwayat',
  sub: 'Ringkasan dulu, baru daftar. Garis waktu vertikal membuat urutan order terbaca tanpa harus membaca jam satu per satu.',
  body: phone(screenRiwayat),
  notes: `<ul>
    <li><b>Titik berwarna di garis waktu</b> menyampaikan hasil sebelum teks dibaca — memindai 50 order jadi mungkin.</li>
    <li><b>Winrate ditampilkan apa adanya</b>, termasuk saat buruk. Menyembunyikannya membuat pengguna tidak bisa menilai strateginya sendiri.</li>
    <li><b>Tapis "Menunggu" ada</b> karena order yang hasilnya belum keluar adalah keadaan sah, bukan kesalahan.</li>
  </ul>`,
}));

add('pola/panduan.html', page({
  card: 'Pola layar',
  title: 'Panduan',
  sub: 'Akordeon bernomor: pengguna bisa membaca berurutan atau melompat ke bagian yang dibutuhkan, tanpa dinding teks.',
  body: phone(screenPanduan),
  notes: `<ul>
    <li><b>Peringatan risiko diletakkan di bawah, bukan sebagai sembulan.</b> Sembulan dilewati refleks; teks yang harus dilewati saat menggulir lebih mungkin terbaca.</li>
    <li><b>Nada peringatan memakai warna warn, bukan merah rugi</b> — merah dikunci untuk angka uang.</li>
  </ul>`,
}));

add('pola/profil.html', page({
  card: 'Pola layar',
  title: 'Profil',
  sub: 'Identitas, dua saldo, lalu pengaturan. Saldo Real dan Demo dipisah tegas supaya tidak pernah tertukar saat memutuskan.',
  body: phone(screenProfil),
  notes: `<ul>
    <li><b>Dua kartu saldo berdampingan, bukan bertumpuk</b> — perbandingan Real vs Demo adalah alasan utama halaman ini dibuka.</li>
    <li><b>Lencana "Mode REAL aktif"</b> menjawab pertanyaan yang paling sering masuk ke dukungan.</li>
    <li><b>Keluar memakai gaya ghost</b>, bukan merah: itu aksi biasa, bukan tindakan merusak.</li>
  </ul>`,
}));

/* ═══════════════ TULIS ═══════════════ */

add('tokens.css', TOKENS_CSS);
add('components.css', COMPONENTS_CSS);

add('README.md', `# STC AutoTrade — Design System

Dihasilkan oleh \`design-system/_build.mjs\`. **Jangan menyunting berkas di folder
ini secara langsung** — ubah generatornya lalu jalankan:

\`\`\`
node design-system/_build.mjs
\`\`\`

\`tokens.css\` dan \`components.css\` dipakai aplikasi; sisanya halaman pratinjau.

## Kenapa terpisah dari koala

Identitas visualnya berbeda. Koala memakai eucalyptus yang diturunkan
saturasinya; STC memakai **emerald** yang lebih tajam (\`#059669\` terang /
\`#2DD4A7\` gelap) — warna yang memang sudah dipakai aplikasinya. Menyalin token
koala akan mengganti merek STC, bukan merapikannya.

## Aturan yang mengikat

- **Aksen ≠ untung.** Emerald merek dipakai untuk aksi; hijau untung dan merah
  rugi dikunci hanya untuk angka uang.
- **Angka memakai \`tabular-nums\`** supaya kolom tidak bergoyang saat berubah.
- **Font sistem**, nol byte diunduh.
- Kontras dihitung di generator, bukan ditebak — lihat catatan di
  \`fondasi/warna.html\`.
`);

for (const [p, c] of Object.entries(files)) {
  const full = path.join(OUT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c);
  console.log(' ', p);
}
console.log(`\n  ${Object.keys(files).length} berkas dihasilkan`);

// Salin token & komponen ke aplikasi supaya sumbernya satu: generator ini.
// Tanpa langkah ini, CSS di src/app/ds/ menyimpang diam-diam dari pratinjaunya
// dan design system berhenti menggambarkan aplikasi yang sebenarnya.
const APP_DS = path.join(OUT, '..', 'src', 'app', 'ds');
fs.mkdirSync(APP_DS, { recursive: true });
for (const f of ['tokens.css', 'components.css']) {
  fs.copyFileSync(path.join(OUT, f), path.join(APP_DS, f));
  console.log('  -> src/app/ds/' + f);
}
