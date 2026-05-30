import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sakura: '#f4a7b9',
        indigo: { 950: '#0f0f2d' },
      },
    },
  },
  plugins: [],
}

export default config
