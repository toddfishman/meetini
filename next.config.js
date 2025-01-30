/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
      bodySizeLimit: '2mb'
    }
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't attempt to polyfill or mock these Node.js modules
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        http2: false,
        dns: false,
        child_process: false,
        http: false,
        https: false,
        os: false,
        path: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
