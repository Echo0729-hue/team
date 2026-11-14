import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const run = (file, args) => execFileSync(file, args, { stdio: "inherit", windowsHide: true });
const root = process.cwd();
const venvPython = path.join(root, ".venv-manim", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const runtimePython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const python = process.env.MANIM_PYTHON || venvPython;
if (!fs.existsSync(python)) {
  const bootstrap = process.env.MANIM_BOOTSTRAP_PYTHON || (fs.existsSync(runtimePython) ? runtimePython : process.platform === "win32" ? "python" : "python3");
  run(bootstrap, ["-m", "venv", path.join(root, ".venv-manim")]);
}
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", "scripts/manim/requirements.txt"]);

if (process.platform === "win32") {
  const targets = [
    { name: "tectonic", version: "0.17.0", url: "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip" },
  ];
  for (const target of targets) {
    const dir = path.join(root, ".tools", "manim", target.name);
    const exe = path.join(dir, `${target.name}.exe`);
    if (!fs.existsSync(exe)) {
      console.log(`Installing ${target.name} ${target.version}…`);
      fs.mkdirSync(dir, { recursive: true });
      const archive = path.join(root, ".tools", "manim", `${target.name}.zip`);
      const response = await fetch(target.url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
      const quote = (value) => `'${value.replaceAll("'", "''")}'`;
      run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(dir)} -Force`]);
    }
    run(exe, ["--version"]);
  }
  // TeX Live's standalone converter avoids requiring a system-wide MiKTeX installation.
  const texlive = path.join(root, ".tools", "manim", "texlive");
  fs.mkdirSync(texlive, { recursive: true });
  for (const [pkg, marker] of [["dvisvgm.windows", "bin/windows/dvisvgm.exe"], ["cm", "fonts/tfm/public/cm/cmr10.tfm"], ["amsfonts", "fonts/type1/public/amsfonts/cm/cmr10.pfb"]]) {
    if (fs.existsSync(path.join(texlive, marker))) continue;
    const response = await fetch(`https://mirror.ctan.org/systems/texlive/tlnet/archive/${pkg}.tar.xz`);
    if (!response.ok) throw new Error(`TeX Live download failed: ${response.status}`);
    const archive = path.join(root, ".tools", "manim", `${pkg}.tar.xz`);
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    run("tar.exe", ["-xf", archive, "-C", texlive]);
  }
  fs.writeFileSync(path.join(texlive, "texmf.cnf"), ["TFMFONTS = .;$TEXMF/fonts/tfm//", "T1FONTS = .;$TEXMF/fonts/type1//", "TEXFONTMAPS = .;$TEXMF/fonts/map//", "ENCFONTS = .;$TEXMF/fonts/enc//", ""].join("\n"));
  run(path.join(texlive, "bin", "windows", "dvisvgm.exe"), ["--version"]);
} else {
  // Install these with the host package manager before setup on Linux/macOS.
  run("tectonic", ["--version"]);
  run("dvisvgm", ["--version"]);
}
run(python, ["-c", "import manim; print('Manim', manim.__version__)"]);
console.log("Warming up the TeX font cache and checking a real Manim scene…");
run(process.execPath, ["--import", "tsx", "-e", 'import("./src/lib/manim.ts").then(async(m)=>{const e=await import("./src/remotion/effects.ts");console.log(await m.requestManim(e.createEffect("math-formula"),true).promise)})']);
console.log("Manim environment is ready. Restart the website after installing dependencies.");
