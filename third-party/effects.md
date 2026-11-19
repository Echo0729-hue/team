# 效果组件的实现与依赖

- 网页画面：原生 HTML / SVG，由 Remotion 按帧驱动。
- 手绘画面：本项目绘制的固定多层矢量笔触，通过路径长度逐帧显示，无随机时钟及异步 canvas 绘制。
- 三维画面：[Three.js](https://threejs.org/)，使用几何、欧拉旋转及透视相机，把真实三维边线投影到 SVG；不依赖 WebGL，不加载外部模型。MIT 授权，见 `three.LICENSE.txt`。
- 数学画面：[Manim Community](https://www.manim.community/) 0.20.1（MIT，见 `manim.LICENSE.txt`）在独立 Python 环境中实际渲染。使用 `MathTex`、`Write`、`TransformMatchingShapes`、`Axes`、`Create` 和 `MoveAlongPath`，输出 960×480、30 fps 的透明 PNG 序列；预览与 Remotion 成片读取同一份序列。KaTeX 仅用于编辑器检查公式语法，不再绘制数学画面。
- 公式工具链：[Tectonic](https://tectonic-typesetting.github.io/) 0.17.0 生成 XDV，再由 [TeX Live](https://www.tug.org/texlive/) 的 dvisvgm 3.6 转为 Manim 使用的字形路径。Windows 安装脚本把工具与 Computer Modern / AMS 字体保存在 `.tools/manim/`；Tectonic 首次运行下载并缓存 TeX 宏包。Tectonic 按其 MIT 授权使用；dvisvgm 按 GPL-3.0-or-later 授权分发，字体及 TeX Live 包保留各自包内许可。项目不将这些二进制或字库提交到 Git；分发运行环境时需保留对应许可。Manim 编译命令提供 Tectonic 适配，不改变 MathTex 的字形、动画或 Cairo 渲染实现。
- 时间线与导出：沿用项目现有的 [Remotion](https://www.remotion.dev/)，镜头效果包装共同的视觉树，配音轨道独立保留。Remotion 的商业使用条件沿用其原有授权。

当前数学动画已接入真正的 Manim 运行环境。手绘效果仍是原生矢量笔触，尚未接入 p5.js / p5.brush；时间线继续使用 Remotion，未接入 HyperFrames。当前不接受任意 Python 场景代码，所有用户参数以 JSON 输入固定场景。
