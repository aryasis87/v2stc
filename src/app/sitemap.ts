import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

const BASE = 'https://stcautotradepro.id'

// Hanya halaman publik (trailingSlash: true → URL pakai trailing slash)
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE}/`,          lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/register/`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/login/`,    lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
