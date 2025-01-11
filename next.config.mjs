const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  optimizeFonts: true,
  experimental: {
    optimizePackageImports: ['lodash', 'react-use'],
  },
  swcMinify: true,
  webpack(config) {
    config.resolve.alias.canvas = false;

    // Add rule for pdf.worker
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]',
      },
    });

    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
};

export default nextConfig;
