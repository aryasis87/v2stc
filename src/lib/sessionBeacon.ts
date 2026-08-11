// lib/sessionBeacon.ts
// ─────────────────────────────────────────────────────────────────────
// Penyiar sesi — jembatan tipis antara halaman Beranda (satu-satunya yang
// benar-benar tahu keadaan sesi) dan cangkang aplikasi yang menampilkan pil
// sesi di semua tab.
//
// Kenapa modul, bukan React context: Beranda DILEPAS dari DOM saat pengguna
// berpindah tab, sehingga context-nya ikut hilang. Modul hidup selama proses,
// jadi pil tetap punya data terakhir tanpa memaksa Beranda tetap ter-render.
//
// Yang disimpan sengaja sedikit dan semuanya angka/teks pendek — ini papan
// pengumuman, bukan sumber kebenaran. Sumber kebenarannya tetap engine dan
// server; pil hanya menampilkan yang terakhir diketahui, lalu mengantar
// pengguna kembali ke Beranda untuk melihat keadaan sebenarnya.
// ─────────────────────────────────────────────────────────────────────

export interface SessionBeaconState {
  running: boolean;
  /** Label mode yang sedang berjalan, mis. "Fastrade FTT" */
  modeLabel: string;
  /** Kapan sesi mulai (ms epoch). 0 bila tidak diketahui. */
  startedAt: number;
  /** Laba rugi sesi dalam satuan sen (mengikuti konvensi engine) */
  pnlCents: number;
  /** Satuan mata uang tampilan, mis. "Rp" */
  currencyUnit: string;
  /** Kapan terakhir diperbarui Beranda (ms epoch) */
  updatedAt: number;
}

const EMPTY: SessionBeaconState = {
  running: false,
  modeLabel: '',
  startedAt: 0,
  pnlCents: 0,
  currencyUnit: 'Rp',
  updatedAt: 0,
};

let state: SessionBeaconState = { ...EMPTY };
const subscribers = new Set<(s: SessionBeaconState) => void>();

function emit(): void {
  subscribers.forEach(fn => {
    try { fn(state); } catch { /* satu pelanggan bermasalah tidak boleh menjatuhkan sisanya */ }
  });
}

export const sessionBeacon = {
  get(): SessionBeaconState { return state; },

  /**
   * Diperbarui Beranda setiap kali status sesi berubah.
   * `startedAt` diisi otomatis saat sesi berpindah dari berhenti → berjalan,
   * sehingga pemanggil tidak perlu mengurus stopwatch-nya sendiri.
   */
  publish(patch: Partial<SessionBeaconState>): void {
    const wasRunning = state.running;
    const next: SessionBeaconState = { ...state, ...patch, updatedAt: Date.now() };

    if (next.running && !wasRunning) {
      next.startedAt = patch.startedAt && patch.startedAt > 0 ? patch.startedAt : Date.now();
    }
    if (!next.running) next.startedAt = 0;

    // Hindari siaran yang tidak mengubah apa pun — pil tidak perlu bangun
    // hanya karena Beranda menyelesaikan satu putaran polling.
    const same =
      next.running === state.running &&
      next.modeLabel === state.modeLabel &&
      next.startedAt === state.startedAt &&
      next.pnlCents === state.pnlCents &&
      next.currencyUnit === state.currencyUnit;
    state = next;
    if (!same) emit();
  },

  clear(): void {
    if (!state.running && !state.modeLabel) return;
    state = { ...EMPTY, currencyUnit: state.currencyUnit, updatedAt: Date.now() };
    emit();
  },

  subscribe(fn: (s: SessionBeaconState) => void): () => void {
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  },
};
