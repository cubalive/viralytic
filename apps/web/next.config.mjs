import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@viralytic/db', '@viralytic/shared', '@viralytic/ai', '@viralytic/scrapers'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
};
export default nextConfig;
