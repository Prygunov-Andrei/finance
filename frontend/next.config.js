/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },

  async redirects() {
    // SEO: старые URL рейтинга /ratings/* → /rating-split-system/*
    // permanent: true = HTTP 301, поисковик переиндексирует и передаст вес.
    return [
      { source: '/ratings', destination: '/rating-split-system', permanent: true },
      { source: '/ratings/:path*', destination: '/rating-split-system/:path*', permanent: true },
    ];
  },

  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://backend:8000';
    const minioUrl = process.env.MINIO_URL || 'http://minio:9000';
    // Для локальной разработки: медиа новостей/HVAC берётся с прод-сервера,
    // т.к. файлы физически существуют только там.
    // На продакшне PROD_MEDIA_URL не задаётся — всё идёт через backendUrl.
    const prodMediaUrl = process.env.PROD_MEDIA_URL || backendUrl;

    return [
      // ERP API
      { source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` },
      // HVAC API
      { source: '/api/hvac/:path*', destination: `${backendUrl}/api/v1/hvac/public/:path*` },
      // Public portal API
      { source: '/api/public/:path*', destination: `${backendUrl}/api/public/:path*` },
      // Django admin
      { source: '/admin/:path*', destination: `${backendUrl}/admin/:path*` },
      { source: '/hvac-admin/:path*', destination: `${backendUrl}/api/v1/hvac/admin/:path*` },
      // Загруженные через редактор медиа — всегда локальный backend
      { source: '/media/news/uploads/:path*', destination: `${backendUrl}/media/news/uploads/:path*` },
      // Discovery media — с прод-сервера (файлы не существуют локально)
      { source: '/media/news/:path*', destination: `${prodMediaUrl}/media/news/:path*` },
      { source: '/hvac-media/:path*', destination: `${prodMediaUrl}/hvac-media/:path*` },
      { source: '/hvac-static/:path*', destination: `${prodMediaUrl}/hvac-static/:path*` },
      // Остальные media/static — локальный backend (product_images, projects и т.д.)
      { source: '/static/:path*', destination: `${backendUrl}/static/:path*` },
      { source: '/media/:path*', destination: `${backendUrl}/media/:path*` },
      // MinIO files
      { source: '/files/:path*', destination: `${minioUrl}/files/:path*` },
    ];
  },

  devIndicators: false,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'hvac-info.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'backend' },
    ],
  },
};

module.exports = nextConfig;
