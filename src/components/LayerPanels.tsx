"use client";

import { useCallback, useRef, useState } from "react";
import {
  LAYER_FONTS,
  LAYER_LIMITS,
  imageHeightForWidth,
  type ImageFit,
  type ImageLayer,
  type Layer,
  type LayerFontId,
  type TextAlign,
  type TextLayer,
} from "@/remotion/layers";
import { VIDEO_CONFIG } from "@/remotion/params";

export type UploadItem = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
};

const formatSize = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;

/* ------------------------------ 左侧：素材 + 图层 ------------------------------ */

type AssetsPanelProps = {
  uploads: UploadItem[];
  layers: Layer[];
  selectedId: string | null;
  uploading: boolean;
  uploadError: string | null;
  onUpload: (files: FileList | File[]) => void;
  onAddImage: (upload: UploadItem) => void;
  onDeleteUpload: (upload: UploadItem) => void;
  onAddText: () => void;
  onSelect: (id: string | null) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
};

export function LayerAssetsPanel({
  uploads,
  layers,
  selectedId,
  uploading,
  uploadError,
  onUpload,
  onAddImage,
  onDeleteUpload,
  onAddText,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onMove,
  onDelete,
}: AssetsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files.length > 0) {
        onUpload(event.dataTransfer.files);
      }
    },
    [onUpload],
  );

  return (
    <div className="editor-panel">
      <div className="editor-section">
        <div className="editor-section-head">
          <h3>图片素材</h3>
          <span className="card-note">{uploads.length} 张</span>
        </div>

        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              inputRef.current?.click();
            }
          }}
        >
          {uploading ? <span className="spinner dark" aria-hidden="true" /> : null}
          <span className="dropzone-title">{uploading ? "上传中…" : "点击或拖拽上传图片"}</span>
          <span className="dropzone-hint">支持 JPG / PNG / WebP，单张不超过 10 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files?.length) {
                onUpload(event.target.files);
                event.target.value = "";
              }
            }}
          />
        </div>

        {uploadError ? (
          <div className="alert error" role="alert">
            {uploadError}
          </div>
        ) : null}

        {uploads.length > 0 ? (
          <div className="upload-grid">
            {uploads.map((upload) => (
              <figure key={upload.id} className="upload-item">
                <img src={upload.url} alt={upload.name} />
                <figcaption>
                  <span className="upload-name" title={upload.name}>
                    {upload.name}
                  </span>
                  <span className="upload-meta">
                    {upload.width}×{upload.height} · {formatSize(upload.size)}
                  </span>
                </figcaption>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddImage(upload)}>
                  添加到画面
                </button>
                <button type="button" className="btn-text" onClick={() => onDeleteUpload(upload)} aria-label={`删除图片 ${upload.name}`}>
                  删除图片
                </button>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      <div className="editor-section">
        <div className="editor-section-head">
          <h3>图层</h3>
          <div className="head-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onAddText}>
              + 文字
            </button>
          </div>
        </div>

        {layers.length === 0 ? (
          <p className="hint-line">还没有图层。上传图片点「添加到画面」，或新增一个文字图层。</p>
        ) : (
          <ul className="layer-list">
            {[...layers].reverse().map((layer, reverseIndex) => {
              const index = layers.length - 1 - reverseIndex;
              return (
                <li
                  key={layer.id}
                  className={`layer-row${selectedId === layer.id ? " selected" : ""}${layer.hidden ? " hidden" : ""}`}
                  onClick={() => onSelect(layer.id)}
                >
                  <span className="layer-thumb">
                    {layer.kind === "image" ? <img src={layer.src} alt="" /> : <span className="layer-thumb-text">T</span>}
                  </span>
                  <span className="layer-info">
                    <span className="layer-name" title={layer.name}>
                      {layer.name}
                    </span>
                    <span className="layer-meta">
                      {layer.kind === "image" ? "图片" : "文字"} · {((layer.endFrame - layer.startFrame) / VIDEO_CONFIG.fps).toFixed(1)}s
                    </span>
                  </span>
                  <span className="layer-orders">
                    <button
                      type="button"
                      className="icon-btn tiny"
                      title="上移一层"
                      aria-label={`上移 ${layer.name}`}
                      disabled={index === layers.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(layer.id, 1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny"
                      title="下移一层"
                      aria-label={`下移 ${layer.name}`}
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(layer.id, -1);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`icon-btn tiny${layer.hidden ? " active" : ""}`}
                      title={layer.hidden ? "显示" : "隐藏"}
                      aria-label={layer.hidden ? `显示 ${layer.name}` : `隐藏 ${layer.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleHidden(layer.id);
                      }}
                    >
                      {layer.hidden ? "◌" : "◉"}
                    </button>
                    <button
                      type="button"
                      className={`icon-btn tiny${layer.locked ? " active" : ""}`}
                      title={layer.locked ? "解锁" : "锁定"}
                      aria-label={layer.locked ? `解锁 ${layer.name}` : `锁定 ${layer.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleLocked(layer.id);
                      }}
                    >
                      {layer.locked ? "🔒" : "🔓"}
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny danger"
                      title="删除图层"
                      aria-label={`删除 ${layer.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(layer.id);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 右侧：图层属性 ------------------------------ */

type InspectorProps = {
  canvas: { width: number; height: number };
  layer: Layer | null;
  durationSeconds: number;
  onChange: (patch: Partial<TextLayer> & Partial<ImageLayer>) => void;
};

const NumberField = ({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) => (
  <label className="num-field">
    <span>{label}</span>
    <span className="num-input">
      <input
        className="input"
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onChange(Math.min(max, Math.max(min, parsed)));
          }
        }}
      />
      {suffix ? <em>{suffix}</em> : null}
    </span>
  </label>
);

export function LayerInspector({ layer, durationSeconds, onChange, canvas }: InspectorProps) {
  if (!layer) {
    return (
      <div className="editor-panel">
        <div className="inspector-empty">
          <h3>未选中图层</h3>
          <p>在画面中点击文字或图片，或在左侧图层列表选择；拖动可调整位置，拖右下角可等比缩放。</p>
          <ul>
            <li>画布坐标与视频原始分辨率一一对应，缩放窗口不会偏移</li>
            <li>按住 Shift 拖动图片框可旋转（或使用「旋转」数值）</li>
            <li>播放预览时编辑边框会自动隐藏</li>
          </ul>
        </div>
      </div>
    );
  }

  const isText = layer.kind === "text";
  const maxSeconds = durationSeconds;

  return (
    <div className="editor-panel inspector">
      <div className="editor-section-head">
        <h3>{isText ? "文字属性" : "图片属性"}</h3>
        <span className="card-note">{layer.locked ? "已锁定" : layer.hidden ? "已隐藏" : "编辑中"}</span>
      </div>

      <div className="inspector-body">
        {isText ? (
          <>
            <div className="field">
              <label className="label" htmlFor="layer-text">
                文字内容（可换行）
              </label>
              <textarea
                id="layer-text"
                maxLength={LAYER_LIMITS.textMaxLength}
                className="textarea"
                rows={4}
                value={(layer as TextLayer).text}
                onChange={(event) => onChange({ text: event.target.value })}
              />
            </div>

            <div className="field">
              <span className="label">字体</span>
              <select
                className="input"
                value={(layer as TextLayer).fontId}
                onChange={(event) => onChange({ fontId: event.target.value as LayerFontId })}
              >
                {LAYER_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <div className="label-row">
                <span className="label">字号</span>
                <span className="value-badge">{(layer as TextLayer).fontSize}px</span>
              </div>
              <input
                className="range"
                type="range"
                min={LAYER_LIMITS.fontSizeMin}
                max={LAYER_LIMITS.fontSizeMax}
                value={(layer as TextLayer).fontSize}
                onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
              />
            </div>

            <div className="field">
              <span className="label">粗细与样式</span>
              <div className="row-gap">
                <div className="segmented">
                  <button
                    type="button"
                    className={(layer as TextLayer).fontWeight === 400 ? "active" : ""}
                    onClick={() => onChange({ fontWeight: 400 })}
                  >
                    常规
                  </button>
                  <button
                    type="button"
                    className={(layer as TextLayer).fontWeight === 700 ? "active" : ""}
                    onClick={() => onChange({ fontWeight: 700 })}
                  >
                    加粗
                  </button>
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    className={(layer as TextLayer).italic ? "active" : ""}
                    onClick={() => onChange({ italic: !(layer as TextLayer).italic })}
                  >
                    斜体
                  </button>
                </div>
              </div>
            </div>

            <div className="field">
              <span className="label">对齐</span>
              <div className="segmented">
                {(["left", "center", "right"] as TextAlign[]).map((align) => (
                  <button
                    key={align}
                    type="button"
                    className={(layer as TextLayer).align === align ? "active" : ""}
                    onClick={() => onChange({ align })}
                  >
                    {align === "left" ? "左对齐" : align === "center" ? "居中" : "右对齐"}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-grid">
              <label className="color-field">
                <span>颜色</span>
                <input
                  className="input hex-input"
                  value={(layer as TextLayer).color}
                  onChange={(event) => onChange({ color: event.target.value.toUpperCase() })}
                />
                <input
                  type="color"
                  className="color-picker"
                  aria-label="文字颜色"
                  value={(layer as TextLayer).color}
                  onChange={(event) => onChange({ color: event.target.value.toUpperCase() })}
                />
              </label>
              <NumberField
                label="不透明度"
                value={Math.round((layer as TextLayer).opacity * 100)}
                min={5}
                max={100}
                suffix="%"
                onChange={(value) => onChange({ opacity: value / 100 })}
              />
            </div>

            <div className="field-grid">
              <NumberField
                label="行高"
                value={(layer as TextLayer).lineHeight}
                min={LAYER_LIMITS.lineHeightMin}
                max={LAYER_LIMITS.lineHeightMax}
                step={0.05}
                onChange={(value) => onChange({ lineHeight: value })}
              />
              <NumberField
                label="字间距"
                value={(layer as TextLayer).letterSpacing}
                min={LAYER_LIMITS.letterSpacingMin}
                max={LAYER_LIMITS.letterSpacingMax}
                suffix="px"
                onChange={(value) => onChange({ letterSpacing: value })}
              />
            </div>

            <div className="field">
              <span className="label">描边</span>
              <div className="field-grid">
                <label className="color-field">
                  <span>颜色</span>
                  <input
                    className="input hex-input"
                    value={(layer as TextLayer).strokeColor}
                    onChange={(event) => onChange({ strokeColor: event.target.value.toUpperCase() })}
                  />
                  <input
                    type="color"
                    className="color-picker"
                    aria-label="描边颜色"
                    value={(layer as TextLayer).strokeColor}
                    onChange={(event) => onChange({ strokeColor: event.target.value.toUpperCase() })}
                  />
                </label>
                <NumberField
                  label="宽度"
                  value={(layer as TextLayer).strokeWidth}
                  min={0}
                  max={LAYER_LIMITS.strokeWidthMax}
                  step={0.5}
                  suffix="px"
                  onChange={(value) => onChange({ strokeWidth: value })}
                />
              </div>
            </div>

            <div className="field">
              <label className="switch-row compact">
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={(layer as TextLayer).shadow.enabled}
                    onChange={(event) =>
                      onChange({ shadow: { ...(layer as TextLayer).shadow, enabled: event.target.checked } })
                    }
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                </span>
                <span className="switch-text">
                  <strong>阴影</strong>
                  <span>让文字在复杂背景上更清晰</span>
                </span>
              </label>
              {(layer as TextLayer).shadow.enabled ? (
                <>
                  <label className="color-field">
                    <span>颜色</span>
                    <input
                      className="input hex-input"
                      value={(layer as TextLayer).shadow.color}
                      onChange={(event) =>
                        onChange({ shadow: { ...(layer as TextLayer).shadow, color: event.target.value.toUpperCase() } })
                      }
                    />
                    <input
                      type="color"
                      className="color-picker"
                      aria-label="阴影颜色"
                      value={(layer as TextLayer).shadow.color}
                      onChange={(event) =>
                        onChange({ shadow: { ...(layer as TextLayer).shadow, color: event.target.value.toUpperCase() } })
                      }
                    />
                  </label>
                  <div className="field-grid three">
                    <NumberField
                      label="X 偏移"
                      value={(layer as TextLayer).shadow.offsetX}
                      min={-40}
                      max={40}
                      onChange={(value) => onChange({ shadow: { ...(layer as TextLayer).shadow, offsetX: value } })}
                    />
                    <NumberField
                      label="Y 偏移"
                      value={(layer as TextLayer).shadow.offsetY}
                      min={-40}
                      max={40}
                      onChange={(value) => onChange({ shadow: { ...(layer as TextLayer).shadow, offsetY: value } })}
                    />
                    <NumberField
                      label="模糊"
                      value={(layer as TextLayer).shadow.blur}
                      min={0}
                      max={60}
                      onChange={(value) => onChange({ shadow: { ...(layer as TextLayer).shadow, blur: value } })}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <span className="label">适配方式</span>
              <div className="segmented">
                {(["contain", "cover"] as ImageFit[]).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    className={(layer as ImageLayer).fit === fit ? "active" : ""}
                    onClick={() => {
                      const image = layer as ImageLayer;
                      if (fit === "cover") {
                        onChange({ fit, width: 1, height: 1 });
                      } else {
                        onChange({
                          fit,
                          width: 0.6,
                          height: imageHeightForWidth(0.6, image.aspect, canvas),
                        });
                      }
                    }}
                  >
                    {fit === "contain" ? "完整显示" : "填满画面"}
                  </button>
                ))}
              </div>
              <p className="field-hint">「填满画面」会把图片铺满整块画布并裁掉多余部分。</p>
            </div>

            <div className="field">
              <div className="label-row">
                <span className="label">不透明度</span>
                <span className="value-badge">{Math.round(layer.opacity * 100)}%</span>
              </div>
              <input
                className="range"
                type="range"
                min={5}
                max={100}
                value={Math.round(layer.opacity * 100)}
                onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
              />
            </div>

            <div className="field">
              <span className="label">尺寸</span>
              <div className="field-grid">
                <NumberField
                  label="宽度"
                  value={Math.round((layer as ImageLayer).width * 100)}
                  min={5}
                  max={150}
                  suffix="%"
                  onChange={(value) => {
                    const image = layer as ImageLayer;
                    onChange({
                      width: value / 100,
                      height: imageHeightForWidth(value / 100, image.aspect, canvas),
                    });
                  }}
                />
                <NumberField
                  label="高度"
                  value={Math.round((layer as ImageLayer).height * 100)}
                  min={5}
                  max={150}
                  suffix="%"
                  onChange={(value) => onChange({ height: value / 100 })}
                />
              </div>
            </div>
          </>
        )}

        <div className="field">
          <span className="label">位置与旋转</span>
          <div className="field-grid three">
            <NumberField
              label="X"
              value={Math.round(layer.x * 1000) / 10}
              min={-20}
              max={120}
              suffix="%"
              onChange={(value) => onChange({ x: value / 100 })}
            />
            <NumberField
              label="Y"
              value={Math.round(layer.y * 1000) / 10}
              min={-20}
              max={120}
              suffix="%"
              onChange={(value) => onChange({ y: value / 100 })}
            />
            <NumberField
              label="旋转"
              value={layer.rotation}
              min={-180}
              max={180}
              suffix="°"
              onChange={(value) => onChange({ rotation: value })}
            />
          </div>
          {isText ? (
            <NumberField
              label="文本框宽度"
              value={Math.round((layer as TextLayer).boxWidth * 100)}
              min={8}
              max={100}
              suffix="%"
              onChange={(value) => onChange({ boxWidth: value / 100 })}
            />
          ) : null}
        </div>

        <div className="field">
          <span className="label">显示时段</span>
          <div className="field-grid">
            <NumberField
              label="开始"
              value={layer.startFrame / VIDEO_CONFIG.fps}
              min={0}
              max={maxSeconds}
              step={0.1}
              suffix="s"
              onChange={(value) => onChange({ startFrame: Math.round(value * VIDEO_CONFIG.fps) })}
            />
            <NumberField
              label="结束"
              value={layer.endFrame / VIDEO_CONFIG.fps}
              min={0}
              max={maxSeconds}
              step={0.1}
              suffix="s"
              onChange={(value) => onChange({ endFrame: Math.round(value * VIDEO_CONFIG.fps) })}
            />
          </div>
          <p className="field-hint">默认覆盖整个视频时段；结束时间不能早于开始时间（服务端会兜底）。</p>
        </div>
      </div>
    </div>
  );
}
