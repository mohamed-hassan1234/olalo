import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export: every route is pre-rendered HTML served from a CDN; the 3D layer is a client-only island.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@lattice/shared'],
  productionBrowserSourceMaps: false,
};

export default nextConfig;
