import type { MetadataRoute } from 'next'

// Statis — wajib untuk output: 'export'
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Halaman privat (di balik login) tidak perlu di-index
      disallow: ['/dashboard', '/admin', '/profile', '/history', '/webview'],
    },
    sitemap: 'https://stcautotradepro.id/sitemap.xml',
    host: 'https://stcautotradepro.id',
  }
}
