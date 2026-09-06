import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth', 'googleapis'],
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default nextConfig;
