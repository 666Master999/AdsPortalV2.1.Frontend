import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (String(warning.message || '').includes('contains an annotation that Rollup cannot interpret')) {
          return
        }

        warn(warning)
      },
    },
  },
})
