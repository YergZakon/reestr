/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Прод-сборка не должна падать на стиле ESLint — типы проверяет tsc.
  eslint: { ignoreDuringBuilds: true },
  // src/instrumentation.ts — старт облачного воркера подач вместе с сервером.
  experimental: { instrumentationHook: true },
  // instrumentation компилируется и для edge-runtime; динамический импорт воркера
  // (pg → node:fs/net/tls) webpack трейсит статически. Для edge подставляем пустые
  // заглушки — в рантайме edge-ветка выходит раньше (проверка NEXT_RUNTIME).
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime === "edge") {
      // Вырезаем модуль воркера из edge-бандла instrumentation (тянет pg → node:fs/net):
      // IgnorePlugin матчит СЫРОЙ request до paths-резолюции. В edge-рантайме импорт
      // не выполняется (register() выходит по NEXT_RUNTIME до import).
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@\/lib\/worker\/loop$/ }));
    }
    return config;
  },
};

export default nextConfig;
