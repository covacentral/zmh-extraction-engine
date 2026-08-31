/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
