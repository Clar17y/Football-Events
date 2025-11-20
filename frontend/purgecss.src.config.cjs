// Purge CSS using source files (fast audit during dev)
// Outputs purged copies to `purgecss-src/` for review.
/** @type {import('purgecss').UserDefinedOptions} */
module.exports = {
  content: [
    'index.html',
    'public/**/*.html',
    'src/**/*.{js,jsx,ts,tsx,html}'
  ],
  css: [
    'src/**/*.css'
  ],
  safelist: {
    standard: [/^Mui/, /^ion-/, /^react-colorful__/, /^swiper-/]
  },
  defaultExtractor: (content) => content.match(/[A-Za-z0-9-_:/]+/g) || [],
  output: 'purgecss-src'
};

