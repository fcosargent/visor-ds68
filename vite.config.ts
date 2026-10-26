import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: la carpeta dist/ puede publicarse en cualquier subruta.
export default defineConfig({
  base: './',
  plugins: [react()],
});
