import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel Services does not provision the /_next/image optimization
  // endpoint, so serve images directly from /public.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
