import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Wuhan_3D_visual_byAntigravity/' : '/',
  build: {
    target: 'esnext',
  },
}));
