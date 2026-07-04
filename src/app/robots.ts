import type { MetadataRoute } from 'next'

// Statis — wajib untuk output: 'export'
export const dynamic = 'force-static'

/*
 * Domain ini (aplikasi login-gated) sengaja di-noindex via meta robots di
 * layout.tsx. Crawl HARUS diizinkan penuh — TANPA Disallow — karena halaman
 * yang diblokir crawl tidak pernah terlihat noindex-nya oleh Googlebot dan
 * justru bisa nyangkut di indeks sebagai "Indexed, though blocked by
 * robots.txt". Tanpa sitemap: domain noindex tidak boleh mengundang indeks.
 * Situs SEO satu-satunya: https://stcautotrade.id
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
  }
}
