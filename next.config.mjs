/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Прод-сборка не должна падать на стиле ESLint — типы проверяет tsc.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
