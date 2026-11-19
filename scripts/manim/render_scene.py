"""Fixed Manim scenes; user input is JSON data, never executable Python.

Output is an RGBA PNG sequence shared by the editor and Remotion export.
"""
import json
import math
import os
import sys
import subprocess
from pathlib import Path

from PIL import Image
import manim
import manim.utils.tex_file_writing as tex_io
from manim import (
    Scene, MathTex, TexTemplate, Axes, Dot, VGroup, Line, Write, Create,
    FadeIn, TransformMatchingShapes, MoveAlongPath, linear, smooth,
    tempconfig, UP, DOWN, LEFT, RIGHT,
)

spec_file, target = Path(sys.argv[1]), Path(sys.argv[2])
spec = json.loads(spec_file.read_text(encoding="utf-8"))
frames_dir = target / "frames"
frames_dir.mkdir(exist_ok=True)
frame_count = 0

# Manim's built-in compiler table has no Tectonic entry. Adapt only the
# compiler command; MathTex, dvisvgm, glyph paths and animation remain Manim's.
original_tex_command = tex_io.make_tex_compilation_command
def tex_command(compiler, output_format, tex_file, tex_dir):
    if compiler == "tectonic":
        return ["tectonic", "--untrusted", "--outfmt", "xdv", "--keep-logs", "--outdir", str(tex_dir), str(tex_file)]
    return original_tex_command(compiler, output_format, tex_file, tex_dir)
tex_io.make_tex_compilation_command = tex_command
original_convert = tex_io.convert_to_svg
def convert_to_svg(dvi_file, extension, page=1):
    font_root = Path(__file__).resolve().parents[2] / ".tools" / "manim" / "texlive" / "fonts"
    if not font_root.exists():
        return original_convert(dvi_file, extension, page)
    result = dvi_file.with_suffix(".svg")
    maps = [str(p) for p in (font_root / "map").rglob("*.map")]
    completed = subprocess.run(["dvisvgm", "--no-fonts", "--verbosity=0", f"--fontmap={','.join(maps)}", f"--page={page}", f"--output={result}", str(dvi_file)], capture_output=True, text=True)
    if completed.returncode or not result.exists():
        raise RuntimeError("公式矢量转换失败：" + completed.stderr.strip()[:180])
    return result
tex_io.convert_to_svg = convert_to_svg


class MathComponent(Scene):
    def setup(self):
        # Capture Manim's Cairo renderer directly, retaining transparent pixels.
        # No screen recording or realtime clock is involved.
        def write_frame(frame, num_frames=1):
            global frame_count
            image = Image.fromarray(frame).convert("RGBA")
            for _ in range(num_frames):
                image.save(frames_dir / f"{frame_count:05d}.png")
                frame_count += 1
        self.renderer.file_writer.write_frame = write_frame

    def formula(self, text, max_width=10.5):
        template = TexTemplate(
            tex_compiler="tectonic", output_format=".xdv",
            documentclass=r"\documentclass[preview]{standalone}",
            preamble=r"\usepackage{amsmath}\usepackage{amssymb}",
        )
        formula = MathTex(text, tex_template=template, color=spec["secondaryColor"])
        if formula.width < .01 or formula.height < .01:
            raise RuntimeError("公式字形未能加载，请重新配置数学字体。")
        formula.scale_to_fit_width(max_width)
        if formula.height > 3.6:
            formula.scale_to_fit_height(3.6)
        return formula

    def construct(self):
        speed = spec["speed"]
        primary, secondary = spec["color"], spec["secondaryColor"]
        strength = spec["intensity"]
        if spec["preset"] == "math-formula":
            source = self.formula(spec["text"])
            source.move_to(UP * 0.2)
            accent = Line(LEFT * min(5.5, source.width / 2 + .3), RIGHT * min(5.5, source.width / 2 + .3), color=primary, stroke_width=2 + strength * 5).next_to(source, DOWN, buff=.35)
            if spec["variant"] == "static":
                self.add(source, accent)
                self.wait(1 / 30, frozen_frame=False)
                return
            self.play(Write(source), run_time=1.5 / speed)
            self.play(Create(accent), run_time=.4 / speed)
            if spec["variant"] == "transform":
                self.wait(.5 / speed, frozen_frame=False)
                dest = self.formula(spec["targetText"]).move_to(source)
                self.play(TransformMatchingShapes(source, dest), run_time=1.3 / speed)
            self.wait(.4, frozen_frame=False)
            return

        a, frequency, offset = spec["amplitude"], spec["frequency"], spec["offset"]
        parabola = spec["variant"] == "parabola"
        fn = (lambda x: a * x * x + offset) if parabola else (lambda x: a * math.sin(frequency * x) + offset)
        # Include all sampled values in the actual axis range; no clipped, misleading curve.
        x_min, x_max = (-2.5, 2.5) if parabola else (-math.pi * 2, math.pi * 2)
        y_values = [fn(x_min + (x_max - x_min) * i / 240) for i in range(241)]
        y_min, y_max = min(-1, math.floor(min(y_values)) - .5), max(1, math.ceil(max(y_values)) + .5)
        step = max(1, math.ceil((y_max - y_min) / 5))
        axes = Axes(x_range=[x_min, x_max, 1 if parabola else math.pi], y_range=[y_min, y_max, step],
                    x_length=11.8, y_length=3.8, tips=True,
                    axis_config={"color": secondary, "stroke_width": 2, "include_ticks": True, "tip_width": .13, "tip_height": .13})
        axes.shift(DOWN * .3)
        labels = axes.get_axis_labels(self.formula("x", .3), self.formula("y", .3))
        equation = (rf"y = {a:g}x^2 {offset:+g}" if parabola else rf"y = {a:g}\sin({frequency:g}x) {offset:+g}")
        caption = self.formula(equation, 7).scale(.6).to_edge(UP, buff=.2)
        curve = axes.plot(fn, x_range=[x_min, x_max, (x_max-x_min)/240], color=primary, stroke_width=2.5 + strength * 4, use_smoothing=True)
        dot = Dot(curve.get_start(), radius=.06 + strength * .03, color=secondary)
        self.play(Create(axes), FadeIn(labels), Write(caption), run_time=.65 / speed)
        self.add(dot)
        self.play(Create(curve, rate_func=linear), MoveAlongPath(dot, curve, rate_func=linear), run_time=2.2 / speed)
        self.wait(.4, frozen_frame=False)


try:
    with tempconfig({
        "renderer": "cairo", "pixel_width": 960, "pixel_height": 480,
        "frame_width": 14.2222222222, "frame_height": 7.1111111111,
        "frame_rate": 30, "transparent": True, "background_opacity": 0,
        "media_dir": str(target / "work"), "disable_caching": True,
        "write_to_movie": False, "save_last_frame": False,
        "progress_bar": "none", "verbosity": "WARNING",
    }):
        scene = MathComponent()
        scene.render()
    if frame_count < 1:
        raise RuntimeError("Manim 未生成动画帧。")
    manifest = {"renderer": "manim", "version": manim.__version__, "frames": frame_count,
                "fps": 30, "width": 960, "height": 480}
    temporary = target / "manifest.tmp"
    temporary.write_text(json.dumps(manifest), encoding="utf-8")
    os.replace(temporary, target / "manifest.json")
    print(json.dumps(manifest))
except Exception as error:
    print(f"MANIM_ERROR: {str(error).splitlines()[0]}", file=sys.stderr)
    raise
