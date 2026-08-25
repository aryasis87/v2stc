// lib/saveQris.ts
// Simpan/unduh gambar QRIS lintas platform (web + APK/Capacitor).
//
// Di APK (WebView Android) tautan `<a download>` TIDAK berfungsi — WebView
// Capacitor tak punya DownloadListener, jadi klik tak melakukan apa-apa.
// Solusi tanpa plugin native: Web Share API level 2 (berbagi FILE), didukung
// WebView Android modern & mobile web → memunculkan lembar "Simpan ke Galeri /
// Files / kirim ke e-wallet". Fallback ke unduhan blob klasik untuk desktop.
export async function saveQris(url: string, filename: string): Promise<void> {
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    const blob = await resp.blob();
    const type = blob.type || 'image/jpeg';
    const file = new File([blob], filename, { type });

    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    // Prioritas: Web Share dgn file (berfungsi di APK Android & mobile web).
    if (nav?.share && nav?.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'QRIS Pembayaran' });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return; // user membatalkan
        // selain itu jatuh ke fallback unduhan
      }
    }

    // Fallback: unduhan blob klasik (desktop/browser).
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
  } catch {
    // Upaya terakhir: buka gambar agar bisa disimpan manual (tekan lama).
    try { window.open(url, '_blank'); } catch { /* noop */ }
  }
}
