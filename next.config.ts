import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  outputFileTracingExcludes: {
    '*': [
      './automation-profile/**/*',
      './dist-electron/**/*',
      './electron/**/*',
    ],
  },
};

export default nextConfig;
