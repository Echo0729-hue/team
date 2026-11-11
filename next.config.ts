import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion 的打包器 / 渲染器依赖 esbuild 与平台原生二进制，
  // 必须保持为运行时的外部依赖，不能被打进 Next 的产物中。
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/compositor-win32-x64-msvc",
    "esbuild",
  ],
};

export default nextConfig;