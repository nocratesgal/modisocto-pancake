import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://modlynx.xyz',
  output: 'static',
  build: {
    inlineStylesheets: 'auto'
  }
});
