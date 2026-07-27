/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // small Docker image; used by web/Dockerfile
};

export default nextConfig;
