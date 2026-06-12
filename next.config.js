/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',      // ← tambahkan ini
  trailingSlash: true,   // ← tambahkan ini
  images: {
    unoptimized: true,   // ← wajib untuk static export
  },
};
module.exports = nextConfig;