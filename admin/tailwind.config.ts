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
        void: 'var(--void)',
        base: 'var(--base)',
        s0: 'var(--s0)',
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        t4: 'var(--t4)',
        g4: 'var(--g4)',
        g5: 'var(--g5)',
        g6: 'var(--g6)',
        g7: 'var(--g7)',
        vi: 'var(--vi)',
        di: 'var(--di)',
        au: 'var(--au)',
        red: 'var(--red)',
        ora: 'var(--ora)',
      },
      borderColor: {
        b0: 'var(--b0)',
        b1: 'var(--b1)',
        b2: 'var(--b2)',
        b3: 'var(--b3)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        r2: 'var(--r2)',
        r4: 'var(--r4)',
        r5: 'var(--r5)',
        r6: 'var(--r6)',
        r8: 'var(--r8)',
      },
    },
  },
  plugins: [],
};

export default config;
