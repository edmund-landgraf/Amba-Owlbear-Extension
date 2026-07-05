import { defineConfig } from "vite";

export default defineConfig({
  server: {
    cors: {
      origin: [
        "https://www.owlbear.rodeo",
        "https://owlbear.rodeo"
      ],
    },
  },
});