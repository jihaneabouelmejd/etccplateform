/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http',  hostname: 'localhost',       port: '9000' },
      { protocol: 'https', hostname: '*.railway.app' },
      { protocol: 'https', hostname: '*.up.railway.app' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
