/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },

  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://backend:8000';
    const hvacUrl = process.env.HVAC_API_URL || 'http://hvac-backend:8001';
    const kanbanUrl = process.env.KANBAN_API_URL || 'http://kanban-api:8010';
    const minioUrl = process.env.MINIO_URL || 'http://minio:9000';

    return [
      // ERP API
      { source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` },
      // HVAC API
      { source: '/api/hvac/:path*', destination: `${hvacUrl}/api/hvac/:path*` },
      // Public portal API
      { source: '/api/public/:path*', destination: `${backendUrl}/api/public/:path*` },
      // Kanban (merged into main backend — proxy kept for backwards compat during transition)
      { source: '/kanban-api/:path*', destination: `${backendUrl}/kanban-api/:path*` },
      // Django admin
      { source: '/admin/:path*', destination: `${backendUrl}/admin/:path*` },
      { source: '/hvac-admin/:path*', destination: `${hvacUrl}/hvac-admin/:path*` },
      // Static/media
      { source: '/static/:path*', destination: `${backendUrl}/static/:path*` },
      { source: '/media/:path*', destination: `${backendUrl}/media/:path*` },
      { source: '/hvac-media/:path*', destination: `${hvacUrl}/hvac-media/:path*` },
      { source: '/hvac-static/:path*', destination: `${hvacUrl}/hvac-static/:path*` },
      // MinIO files
      { source: '/files/:path*', destination: `${minioUrl}/files/:path*` },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'hvac-info.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'hvac-backend' },
    ],
  },
};

module.exports = nextConfig;
