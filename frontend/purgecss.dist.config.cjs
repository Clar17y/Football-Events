// Purge CSS against built assets (use after `vite build`)
// This rewrites CSS files inside `dist/assets/` — run on a branch.
/** @type {import('purgecss').UserDefinedOptions} */
module.exports = {
  content: [
    'dist/**/*.html',
    'dist/assets/**/*.js'
  ],
  css: [
    'dist/assets/**/*.css'
  ],
  safelist: {
    standard: [/^Mui/, /^ion-/, /^react-colorful__/, /^swiper-/]
  },
  defaultExtractor: (content) => content.match(/[A-Za-z0-9-_:/]+/g) || [],
  output: 'dist/assets' // overwrite built CSS with purged versions
};

