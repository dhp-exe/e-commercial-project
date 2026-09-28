/** @type {import('next').NextConfig} */
const nextConfig = {
  // DECISION: Standalone output for Docker deployments and future SSR/ISR.
  // Produces a self-contained Node.js server at .next/standalone/server.js.
  output: 'standalone',

  // Replicate Vite dev proxy behavior
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:5001/api/:path*' },
      { source: '/uploads/:path*', destination: 'http://localhost:5001/uploads/:path*' },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.dhpstore.studio' },
      { protocol: 'http', hostname: 'localhost', port: '5001' },
    ],
  },
};

export default nextConfig;
