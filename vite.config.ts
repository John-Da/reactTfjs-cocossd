import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/reactTfjs-cocossd/',
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          tf: ["@tensorflow/tfjs", "@tensorflow-models/coco-ssd"],
        },
      },
    },
  },
})
