import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> one self-contained dist/index.html (JS, CSS, audio and fonts inlined)
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    // ship the code exactly as written (bundled, not rewritten): this was a
    // refactor, and minifiers reorder CSS declarations and rename JS locals
    minify: false,
    cssMinify: false,
  },
});
