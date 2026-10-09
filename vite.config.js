import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the build works under
// https://astroidturtle.github.io/narwhal/ (or any other subpath).
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: { chunkSizeWarningLimit: 4000 },
});
