import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(configDir, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  output: 'standalone',
  turbopack: {
    root: workspaceRoot
  },
  experimental: {
    // any other experimental features
  }
};

export default nextConfig;
