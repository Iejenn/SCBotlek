import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serveert de site op https://iejenn.github.io/SCBotlek/,
// dus alle paden moeten met /SCBotlek/ beginnen (lokaal blijft het /).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/SCBotlek/' : '/',
  plugins: [react()],
}))
