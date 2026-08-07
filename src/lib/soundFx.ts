// lib/soundFx.ts
// ─────────────────────────────────────────────────────────────────────
// Efek suara hasil trading — dibunyikan saat sebuah order menghasilkan
// PROFIT atau LOSS. Berkasnya ada di /public (profit.mp3 & loss.mp3).
//
// Catatan penting:
//   • Peramban/WebView memblokir pemutaran otomatis sebelum ada interaksi
//     pengguna. Karena itu elemen audio disiapkan & "dihangatkan" saat user
//     menekan tombol (mis. Mulai Bot) lewat primeSounds().
//   • Kegagalan memutar TIDAK boleh mengganggu trading — semua dibungkus
//     try/catch dan diabaikan diam-diam.
//   • Preferensi on/off disimpan di localStorage agar tetap saat aplikasi
//     dibuka lagi.
// ─────────────────────────────────────────────────────────────────────

const PREF_KEY = 'stc_sound_enabled';

type Kind = 'profit' | 'loss';

const SRC: Record<Kind, string> = {
  profit: '/profit.mp3',
  loss:   '/loss.mp3',
};

const cache: Partial<Record<Kind, HTMLAudioElement>> = {};

/** Apakah efek suara dinyalakan (bawaan: ya) */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; }
}

/** Nyalakan/matikan efek suara */
export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* abaikan */ }
}

function getAudio(kind: Kind): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  try {
    let el = cache[kind];
    if (!el) {
      el = new Audio(SRC[kind]);
      el.preload = 'auto';
      el.volume = 0.7;
      cache[kind] = el;
    }
    return el;
  } catch { return null; }
}

/**
 * Siapkan audio saat ada interaksi pengguna (dipanggil dari tombol Mulai Bot).
 * Tanpa ini, pemutaran pertama sering diblokir kebijakan autoplay.
 */
export function primeSounds(): void {
  if (typeof window === 'undefined') return;
  (['profit', 'loss'] as Kind[]).forEach((k) => {
    const el = getAudio(k);
    if (!el) return;
    try {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { el.pause(); el.currentTime = 0; el.muted = false; })
         .catch(() => { el.muted = false; });
      } else { el.pause(); el.currentTime = 0; el.muted = false; }
    } catch { /* abaikan */ }
  });
}

/** Bunyikan efek hasil trading. Aman dipanggil kapan pun. */
export function playResultSound(kind: Kind): void {
  if (!isSoundEnabled()) return;
  const el = getAudio(kind);
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* diblokir — abaikan */ });
  } catch { /* abaikan */ }
}

/** Pilih suara dari hasil order: WIN → profit, LOSE/LOSS → loss, DRAW → diam. */
export function playForResult(result?: string | null): void {
  const r = String(result ?? '').toUpperCase();
  if (r === 'WIN') playResultSound('profit');
  else if (r === 'LOSE' || r === 'LOSS') playResultSound('loss');
}

// Log hasil bisa masuk berkali-kali (polling ulang, gabung log server &
// perangkat). Tanpa penjaga ini suara akan berbunyi berulang untuk order yang
// sama. Daftar dibatasi agar tidak tumbuh terus.
const played = new Set<string>();
const playedOrder: string[] = [];

/** Bunyikan sekali saja untuk satu order (dikenali dari `id`). */
export function playForResultOnce(id: string | undefined, result?: string | null): void {
  const r = String(result ?? '').toUpperCase();
  if (r !== 'WIN' && r !== 'LOSE' && r !== 'LOSS') return;
  const key = `${id ?? ''}|${r}`;
  if (!id || played.has(key)) return;
  played.add(key);
  playedOrder.push(key);
  if (playedOrder.length > 400) {
    // buang separuh entri terlama (pakai array agar tak perlu iterasi Set)
    const drop = playedOrder.splice(0, 200);
    for (let i = 0; i < drop.length; i++) played.delete(drop[i]);
  }
  playForResult(r);
}
