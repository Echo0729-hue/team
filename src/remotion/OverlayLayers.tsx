import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import type { Layer } from "./layers";
import { getLayerFontStack } from "./layers";

/**
 * 图层渲染：按中心点 + 旋转定位，字号/间距/描边按画布宽度等比缩放。
 * 编辑画布、网页预览与最终导出都使用这个组件，因此位置与样式完全一致。
 */
export const OverlayLayers: React.FC<{ layers: Layer[] }> = ({ layers }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const unit = width / 1080;

  const visible = layers.filter(
    (layer) => !layer.hidden && frame >= layer.startFrame && frame < layer.endFrame,
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {visible.map((layer) => {
        const base: React.CSSProperties = {
          position: "absolute",
          left: `${layer.x * 100}%`,
          top: `${layer.y * 100}%`,
          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
          opacity: layer.opacity,
        };

        if (layer.kind === "image") {
          return (
            <div
              key={layer.id}
              data-layer-id={layer.id}
              style={{
                ...base,
                width: layer.width * width,
                height: layer.height * height,
                overflow: "hidden",
              }}
            >
              <Img
                src={layer.src}
                style={{ width: "100%", height: "100%", objectFit: layer.fit, display: "block" }}
              />
            </div>
          );
        }

        const textShadow = layer.shadow.enabled
          ? `${layer.shadow.offsetX * unit}px ${layer.shadow.offsetY * unit}px ${layer.shadow.blur * unit}px ${layer.shadow.color}`
          : undefined;

        return (
          <div
            key={layer.id}
            data-layer-id={layer.id}
            style={{
              ...base,
              width: layer.boxWidth * width,
              fontFamily: getLayerFontStack(layer.fontId),
              fontSize: layer.fontSize * unit,
              fontWeight: layer.fontWeight,
              fontStyle: layer.italic ? "italic" : "normal",
              color: layer.color,
              textAlign: layer.align,
              lineHeight: layer.lineHeight,
              letterSpacing: layer.letterSpacing * unit,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              textShadow,
              WebkitTextStroke:
                layer.strokeWidth > 0 ? `${layer.strokeWidth * unit}px ${layer.strokeColor}` : undefined,
              paintOrder: "stroke fill",
            }}
          >
            {layer.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};