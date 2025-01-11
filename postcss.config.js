/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: [
    'tailwindcss',
    'autoprefixer',
    'postcss-nesting',
    'postcss-flexbugs-fixes',
    [
      'postcss-preset-env',
      {
        autoprefixer: {
          flexbox: 'no-2009',
        },
        stage: 3,
        features: {
          'custom-properties': false,
          'nesting-rules': true,
        },
      },
    ],
  ].concat(process.env.NODE_ENV === 'production' ? ['cssnano'] : []),
};
