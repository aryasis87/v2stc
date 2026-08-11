// lib/aksesFitur.ts
// ─────────────────────────────────────────────────────────────────────
// Bentuk baku akses fitur berbayar: siapa yang berhak, SEJAK kapan, dan
// SAMPAI kapan. Dipakai AI Signal dan Fast Reversal.
//
// Bentuk tersimpan (app_config):
//   { "<stockity_user_id>": { "sejak": <epoch ms>, "sampai": <epoch ms|null> } }
//   `sampai: null` berarti tidak kedaluwarsa.
//
// KENAPA HARUS BACA DUA BENTUK: data lama masih beredar dan tidak boleh
// terputus saat rilis.
//   - AI Signal lama : ["183763481", "183777383", ...]   (array, tanpa waktu)
//   - Fast Reversal  : { "183203894": 1788705168639 }    (angka = kedaluwarsa)
// Keduanya dibaca sebagai entri sah. Entri lama TIDAK diberi kedaluwarsa
// mendadak — kalau diberi, pelanggan yang sudah membayar bisa kehilangan akses
// di hari rilis tanpa peringatan. Kedaluwarsa mulai berlaku saat admin
// menyimpan ulang lewat panel, yang menulis bentuk baru.
// ─────────────────────────────────────────────────────────────────────

export interface EntriAkses {
  /** Kapan diaktifkan (epoch ms). null = tidak diketahui (data lama). */
  sejak: number | null;
  /** Kapan berakhir (epoch ms). null = tidak kedaluwarsa. */
  sampai: number | null;
}

export type PetaAkses = Record<string, EntriAkses>;

const angka = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Baca nilai app_config apa pun bentuknya menjadi PetaAkses. */
export function bacaPetaAkses(nilai: unknown): PetaAkses {
  let v: any = nilai;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return {}; }
  }
  if (!v) return {};

  // Bentuk LAMA AI Signal: array id, tanpa keterangan waktu.
  if (Array.isArray(v)) {
    const out: PetaAkses = {};
    for (const x of v) {
      const id = String(x ?? '').trim();
      if (id) out[id] = { sejak: null, sampai: null };
    }
    return out;
  }

  if (typeof v !== 'object') return {};

  const out: PetaAkses = {};
  for (const [idMentah, isi] of Object.entries(v)) {
    const id = String(idMentah).trim();
    if (!id) continue;
    if (isi && typeof isi === 'object' && !Array.isArray(isi)) {
      // Bentuk BARU.
      out[id] = {
        sejak: angka((isi as any).sejak),
        sampai: angka((isi as any).sampai),
      };
    } else {
      // Bentuk LAMA Fast Reversal: nilainya langsung kedaluwarsa.
      out[id] = { sejak: null, sampai: angka(isi) };
    }
  }
  return out;
}

/** Apakah entri masih berlaku sekarang. */
export function masihBerlaku(e: EntriAkses | undefined): boolean {
  if (!e) return false;
  return e.sampai === null || e.sampai > Date.now();
}

/** Buang entri yang sudah lewat, siap disimpan kembali. */
export function pangkasKedaluwarsa(peta: PetaAkses): PetaAkses {
  const out: PetaAkses = {};
  for (const [id, e] of Object.entries(peta)) {
    if (masihBerlaku(e)) out[id] = e;
  }
  return out;
}

/** Entri baru yang berlaku sejak sekarang selama `hari`. */
export function entriBaru(hari: number | null): EntriAkses {
  const now = Date.now();
  return {
    sejak: now,
    sampai: hari === null ? null : now + hari * 24 * 60 * 60 * 1000,
  };
}
