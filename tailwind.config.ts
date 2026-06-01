import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#0f172a',
          hover: '#1e293b',
          active: '#1d4ed8',
          text: '#94a3b8',
          'text-active': '#f1f5f9',
        },
      },
    },
  },
  plugins: [],
}

export default config
