/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  devIndicators: false,
  output: 'standalone',
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
