// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Avoid OneDrive file-locking scan delays during static export build
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
