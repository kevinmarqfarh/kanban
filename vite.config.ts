import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules\/@supabase/, priority: 20 },
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 15 },
            { name: 'drag-and-drop', test: /node_modules\/@dnd-kit/, priority: 10 },
          ],
        },
      },
    },
  },
})
