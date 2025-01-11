import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cl1: 'rgb(var(--cl1) / <alpha-value>)',
        cl2: 'rgb(var(--cl2) / <alpha-value>)',
        cl3: 'rgb(var(--cl3) / <alpha-value>)',
        cl4: 'rgb(var(--cl4) / <alpha-value>)',
        cl5: 'rgb(var(--cl5) / <alpha-value>)',
        cl6: 'rgb(var(--cl6) / <alpha-value>)',
        cl7: 'rgb(var(--cl7) / <alpha-value>)',
        cl8: 'rgb(var(--cl8) / <alpha-value>)',
        cl9: 'rgb(var(--cl9) / <alpha-value>)',
        cl10: 'rgb(var(--cl10) / 0.2)',
        cl11: 'rgb(var(--cl11) / 0.1)',
        cl12: 'rgb(var(--cl12) / <alpha-value>)',
        cl13: 'rgb(var(--cl13) / 0.08)',
        cl14: 'rgb(var(--cl14) / <alpha-value>)',
        cl15: 'rgb(var(--cl15) / <alpha-value>)',
        cl16: 'rgb(var(--cl16) / <alpha-value>)',
        'primary-color': 'rgb(var(--cl1) / <alpha-value>)',
        'warning-color': 'rgb(var(--warning-color) / <alpha-value>)',
        'error-color': 'rgb(var(--error-color) / <alpha-value>)',
        'body-bg-color': 'rgb(var(--cl8) / <alpha-value>)',
        'body-color': 'rgb(var(--body-color) / <alpha-value>)',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('@tailwindcss/typography')],
};
export default config;
