import { defineConfig } from 'vite';

import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    reactRouter(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    allowedHosts: [
      '.ngrok-free.app',
      'pes.plune.life'
    ]
  }
})
