/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    // ⚠️ 중요: 에러가 있어도 무시하고 빌드함
    ignoreBuildErrors: true,
  },
  eslint: {
    // ⚠️ 중요: 에러가 있어도 무시하고 빌드함
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
