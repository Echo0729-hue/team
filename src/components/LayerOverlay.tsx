"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageLayer, Layer, TextLayer } from "@/remotion/layers";

type Canvas = { width: number; height: number };

type LayerOverlayProps = {
  layers: Layer[];
  selectedId: string | null;
  canvas: Canvas;
  playing: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<TextLayer> & Partial<ImageLayer>) => void;
};

type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; originX: number; originY: number; frameWidth: number; frameHeight: number }
  | { mode: "scale"; id: string; startX: number; startY: number; originWidth: number; centerX: number; centerY: number; frameWidth: number }
  | { mode: "rotate"; id: string; centerX: number; centerY: number; startAngle: number; originRotation: number };

const SNAP_THRESHOLD = 0.012;

/**
 * 编辑层：只画选中框与参考线，真正的画面由 Remotion Player 渲染，
 * 因此预览看到的就是导出结果。坐标一律从画框矩形换算成 0~1 的视频坐标。
 */
export default function LayerOverlay({
  layers,
  selectedId,
  canvas,
  playing,
  onSelect,
  onChange,
}: LayerOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointerRef = useRef<{ id: number; target: Element } | null>(null);
  const [frameRect, setFrameRect] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [textHeights, setTextHeights] = useState<Record<string, number>>({});
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const end = useCallback(() => {
    dragRef.current = null;
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (pointer?.target.hasPointerCapture(pointer.id)) pointer.target.releasePointerCapture(pointer.id);
    setGuides({ x: false, y: false });
  }, []);

  useEffect(() => {
    window.addEventListener("blur", end);
    return () => { window.removeEventListener("blur", end); end(); };
  }, [end]);

  const capture = (event: React.PointerEvent): boolean => {
    if (pointerRef.current || event.button !== 0) return false;
    pointerRef.current = { id: event.pointerId, target: event.currentTarget };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    return true;
  };

  const measure = useCallback(() => {
    const root = rootRef.current;
    const frame = root?.parentElement;
    if (!root || !frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    setFrameRect((previous) =>
      Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
        ? previous
        : { width: rect.width, height: rect.height },
    );

    const scale = rect.width / canvas.width;
    const heights: Record<string, number> = {};
    frame.querySelectorAll<HTMLElement>("[data-layer-id]").forEach((element) => {
      const id = element.getAttribute("data-layer-id");
      if (!id) {
        return;
      }
      heights[id] = element.offsetHeight * scale;
    });
    setTextHeights((previous) => {
      const keys = Object.keys(heights);
      if (keys.length === Object.keys(previous).length && keys.every((key) => Math.abs(heights[key] - (previous[key] ?? -1)) < 0.5)) {
        return previous;
      }
      return heights;
    });
  }, [canvas.width]);

  useEffect(() => {
    measure();
    const timer = window.setInterval(measure, 400);
    const observer = new ResizeObserver(measure);
    if (rootRef.current?.parentElement) {
      observer.observe(rootRef.current.parentElement);
    }
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [measure]);

  const scale = frameRect.width > 0 ? frameRect.width / canvas.width : 0;

  const boxOf = (layer: Layer): { width: number; height: number } => {
    if (layer.kind === "image") {
      return { width: layer.width * canvas.width * scale, height: layer.height * canvas.height * scale };
    }
    return {
      width: layer.boxWidth * canvas.width * scale,
      height: textHeights[layer.id] ?? layer.fontSize * layer.lineHeight * scale,
    };
  };

  const begin = (event: React.PointerEvent, layer: Layer) => {
    if (playing || pointerRef.current) {
      return;
    }
    event.stopPropagation();
    onSelect(layer.id);
    if (layer.locked) {
      return;
    }

    const frame = rootRef.current?.parentElement;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (!capture(event)) return;

    if (event.shiftKey && layer.kind === "image") {
      const centerX = rect.left + layer.x * rect.width;
      const centerY = rect.top + layer.y * rect.height;
      dragRef.current = {
        mode: "rotate",
        id: layer.id,
        centerX,
        centerY,
        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
        originRotation: layer.rotation,
      };
      return;
    }

    dragRef.current = {
      mode: "move",
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: layer.x,
      originY: layer.y,
      frameWidth: rect.width,
      frameHeight: rect.height,
    };
  };

  const beginScale = (event: React.PointerEvent, layer: ImageLayer) => {
    if (playing || layer.locked || pointerRef.current) {
      return;
    }
    event.stopPropagation();
    const frame = rootRef.current?.parentElement;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (!capture(event)) return;
    dragRef.current = {
      mode: "scale",
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: layer.width,
      centerX: rect.left + layer.x * rect.width,
      centerY: rect.top + layer.y * rect.height,
      frameWidth: rect.width,
    };
  };

  const beginRotate = (event: React.PointerEvent, layer: Layer) => {
    if (playing || layer.locked || pointerRef.current) {
      return;
    }
    event.stopPropagation();
    const frame = rootRef.current?.parentElement;
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    const centerX = rect.left + layer.x * rect.width;
    const centerY = rect.top + layer.y * rect.height;
    if (!capture(event)) return;
    dragRef.current = {
      mode: "rotate",
      id: layer.id,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      originRotation: layer.rotation,
    };
  };

  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== pointerRef.current?.id) {
      return;
    }

    if (drag.mode === "move") {
      const nextX = drag.originX + (event.clientX - drag.startX) / drag.frameWidth;
      const nextY = drag.originY + (event.clientY - drag.startY) / drag.frameHeight;
      const snapX = Math.abs(nextX - 0.5) < SNAP_THRESHOLD;
      const snapY = Math.abs(nextY - 0.5) < SNAP_THRESHOLD;
      setGuides({ x: snapX, y: snapY });
      onChange(drag.id, {
        x: snapX ? 0.5 : Math.min(1.2, Math.max(-0.2, Math.round(nextX * 10000) / 10000)),
        y: snapY ? 0.5 : Math.min(1.2, Math.max(-0.2, Math.round(nextY * 10000) / 10000)),
      });
      return;
    }

    if (drag.mode === "scale") {
      const layer = layers.find((item) => item.id === drag.id);
      if (!layer || layer.kind !== "image") {
        return;
      }
      const startDistance = Math.max(8, Math.hypot(drag.startX - drag.centerX, drag.startY - drag.centerY));
      const distance = Math.max(8, Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY));
      const nextWidth = Math.min(1.5, Math.max(0.05, (drag.originWidth * distance) / startDistance));
      onChange(drag.id, {
        width: Math.round(nextWidth * 10000) / 10000,
        height: Math.round(((nextWidth * canvas.width) / layer.aspect / canvas.height) * 10000) / 10000,
      });
      return;
    }

    const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
    const degrees = drag.originRotation + ((angle - drag.startAngle) * 180) / Math.PI;
    const normalized = ((degrees + 180) % 360 + 360) % 360 - 180;
    onChange(drag.id, { rotation: Math.round(normalized) });
  };

  const endPointer = (event: React.PointerEvent) => {
    if (event.pointerId === pointerRef.current?.id) end();
  };

  if (playing) {
    return <div ref={rootRef} className="layer-overlay" aria-hidden="true" />;
  }

  return (
    <div
      ref={rootRef}
      className="layer-overlay"
      onPointerDown={() => onSelect(null)}
    >
      {guides.x ? <span className="guide guide-x" aria-hidden="true" /> : null}
      {guides.y ? <span className="guide guide-y" aria-hidden="true" /> : null}

      {layers.map((layer) => {
        if (layer.hidden) {
          return null;
        }
        const box = boxOf(layer);
        const selected = selectedId === layer.id;
        return (
          <div
            key={layer.id}
            className={`layer-box${selected ? " selected" : ""}${layer.locked ? " locked" : ""}`}
            style={{
              left: layer.x * frameRect.width - box.width / 2,
              top: layer.y * frameRect.height - box.height / 2,
              width: box.width,
              height: box.height,
              transform: `rotate(${layer.rotation}deg)`,
            }}
            onPointerDown={(event) => begin(event, layer)}
            onPointerMove={move}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onLostPointerCapture={endPointer}
          >
            {selected ? (
              <>
                <span className="layer-handle rotate" onPointerDown={(event) => beginRotate(event, layer)} title="旋转" />
                {layer.kind === "image" ? (
                  <span className="layer-handle scale" onPointerDown={(event) => beginScale(event, layer)} title="等比例缩放" />
                ) : null}
                <span className="layer-tag">{layer.name}</span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
