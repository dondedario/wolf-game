import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Explicitly tell Turbopack that this app's root is the `wolf-game` folder.
   * This avoids it inferring the parent workspace root (where another
   * package-lock.json lives), which was causing the React Client Manifest
   * to point at the wrong path for `src/app/page.tsx`.
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
