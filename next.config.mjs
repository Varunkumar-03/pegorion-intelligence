/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true, distDir: process.env.NEXT_DIST_DIR || '.next', experimental: { serverComponentsExternalPackages: ['unpdf'] } };
export default nextConfig;
