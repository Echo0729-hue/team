// 独立的导出验证脚本：只用 @remotion/bundler + @remotion/renderer 渲染一个真实 MP4，
// 不经过 Next.js 服务，用来确认「模板 → 打包 → 渲染 → 编码」整条链路可用。
// 运行：npm run render:sample
import fs from "node:fs";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { DEFAULT_VIDEO_PROPS, VIDEO_CONFIG } from "../src/remotion/params.ts";
import { getBundleServer } from "../src/lib/bundleServer.ts";
import { getRenderPort } from "../src/lib/renderPort.ts";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "output");
const entryPoint = path.join(projectRoot, "src", "remotion", "index.ts");

const browserCandidates = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);

const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate));

const main = async () => {
  await fs.promises.mkdir(outputDir, { recursive: true });

  console.log("[1/3] 打包 Remotion 入口：", entryPoint);
  const { serveUrl } = await getBundleServer(entryPoint);
  const port = await getRenderPort();

  console.log("[2/3] 读取合成参数…", browserExecutable ? `浏览器：${browserExecutable}` : "使用 Remotion 自动下载的浏览器");
  const composition = await selectComposition({
    serveUrl,
    port,
    id: VIDEO_CONFIG.compositionId,
    inputProps: DEFAULT_VIDEO_PROPS,
    browserExecutable,
  });

  const outputLocation = path.join(outputDir, `sample-${Date.now()}.mp4`);
  let lastReported = -1;

  console.log("[3/3] 开始渲染：", `${composition.width}×${composition.height}`, `${composition.durationInFrames} 帧`, `@${composition.fps}fps`);
  await renderMedia({
    composition,
    serveUrl,
    port,
    codec: "h264",
    outputLocation,
    inputProps: DEFAULT_VIDEO_PROPS,
    browserExecutable,
    concurrency: 2,
    onProgress: ({ progress, renderedFrames }) => {
      const percent = Math.floor(progress * 100);
      if (percent !== lastReported && percent % 10 === 0) {
        lastReported = percent;
        console.log(`    渲染进度 ${percent}%（${renderedFrames}/${composition.durationInFrames} 帧）`);
      }
    },
  });

  const stat = await fs.promises.stat(outputLocation);
  console.log("完成:", outputLocation);
  console.log("文件大小:", (stat.size / 1024 / 1024).toFixed(2), "MB");
};

main().catch((error) => {
  console.error("渲染失败:", error);
  process.exitCode = 1;
});
