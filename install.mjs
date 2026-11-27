#!/usr/bin/env node
/**
 * agy-sidebar-enhance — Idempotent installer/uninstaller for chuanban user/custom.{js,css}
 *
 * Usage:
 *   node install.mjs install [--target-dir <userDir>] [--json]
 *   node install.mjs uninstall [--target-dir <userDir>] [--json]
 *   node install.mjs status [--target-dir <userDir>] [--json]
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_MARKER_START = '/* __AG_PLUGIN_SIDEBAR_ENHANCE_START__ */';
export const PLUGIN_MARKER_END = '/* __AG_PLUGIN_SIDEBAR_ENHANCE_END__ */';

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGET_DIR = join(homedir(), '.gemini', 'antigravity', 'theme-patch', 'user');

function writeAtomic(targetPath, content) {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = join(dir, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  writeFileSync(tmpPath, content, 'utf8');
  try {
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}
    if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
      writeFileSync(targetPath, content, 'utf8');
      return;
    }
    throw err;
  }
}

export function hasPluginBlock(text, startMarker = PLUGIN_MARKER_START, endMarker = PLUGIN_MARKER_END) {
  if (typeof text !== 'string') return false;
  const s = text.indexOf(startMarker);
  const e = text.indexOf(endMarker);
  return s !== -1 && e !== -1 && e > s;
}

export function upsertPluginBlock(
  existingText,
  blockContent,
  startMarker = PLUGIN_MARKER_START,
  endMarker = PLUGIN_MARKER_END
) {
  const raw = typeof existingText === 'string' ? existingText.replace(/^\uFEFF/, '') : '';
  const body = String(blockContent || '').trim();
  const wrapped = `${startMarker}\n${body}\n${endMarker}`;

  const s = raw.indexOf(startMarker);
  const e = raw.indexOf(endMarker);
  if (s !== -1 && e !== -1 && e > s) {
    const before = raw.slice(0, s);
    const after = raw.slice(e + endMarker.length);
    const out = `${before}${wrapped}${after}`;
    return out.endsWith('\n') ? out : `${out}\n`;
  }

  const trimmed = raw.trimEnd();
  if (!trimmed) {
    return `${wrapped}\n`;
  }
  return `${trimmed}\n\n${wrapped}\n`;
}

export function removePluginBlock(
  existingText,
  startMarker = PLUGIN_MARKER_START,
  endMarker = PLUGIN_MARKER_END
) {
  if (typeof existingText !== 'string' || !existingText) return { text: '', removed: false };
  const raw = existingText.replace(/^\uFEFF/, '');
  const s = raw.indexOf(startMarker);
  const e = raw.indexOf(endMarker);
  if (s === -1 || e === -1 || e <= s) {
    return { text: raw, removed: false };
  }
  const before = raw.slice(0, s).replace(/[ \t]*\n+$/, '');
  const after = raw.slice(e + endMarker.length).replace(/^\n+/, '');
  let joined = '';
  if (before && after) {
    joined = `${before}\n\n${after}`;
  } else if (before) {
    joined = `${before}\n`;
  } else if (after) {
    joined = after.endsWith('\n') ? after : `${after}\n`;
  }
  return { text: joined, removed: true };
}

function readConfigFlags(targetDir) {
  const cfgPath = join(targetDir, 'config.json');
  if (!existsSync(cfgPath)) {
    return { exists: false, customCssDisabled: false, customJsDisabled: false, patchDisabled: false };
  }
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
    return {
      exists: true,
      patchDisabled: cfg?.enabled === false,
      customCssDisabled: cfg?.modules?.customCss === false,
      customJsDisabled: cfg?.modules?.customJs === false
    };
  } catch {
    return { exists: true, customCssDisabled: false, customJsDisabled: false, patchDisabled: false };
  }
}

export function getPluginStatus({ targetDir = DEFAULT_TARGET_DIR } = {}) {
  const jsPath = join(targetDir, 'custom.js');
  const cssPath = join(targetDir, 'custom.css');
  const jsText = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
  const cssText = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
  const cfgFlags = readConfigFlags(targetDir);
  return {
    targetDir,
    jsPath,
    cssPath,
    jsInstalled: hasPluginBlock(jsText),
    cssInstalled: hasPluginBlock(cssText),
    ...cfgFlags
  };
}

export function installPlugin({ targetDir = DEFAULT_TARGET_DIR, pluginDir = PLUGIN_DIR } = {}) {
  const srcJsPath = join(pluginDir, 'sidebar-enhance.js');
  const srcCssPath = join(pluginDir, 'sidebar-enhance.css');
  if (!existsSync(srcJsPath) || !existsSync(srcCssPath)) {
    throw new Error(`Plugin source files missing in ${pluginDir}`);
  }
  const srcJs = readFileSync(srcJsPath, 'utf8');
  const srcCss = readFileSync(srcCssPath, 'utf8');

  const dstJsPath = join(targetDir, 'custom.js');
  const dstCssPath = join(targetDir, 'custom.css');
  const prevJs = existsSync(dstJsPath) ? readFileSync(dstJsPath, 'utf8') : '';
  const prevCss = existsSync(dstCssPath) ? readFileSync(dstCssPath, 'utf8') : '';

  const nextJs = upsertPluginBlock(prevJs, srcJs);
  const nextCss = upsertPluginBlock(prevCss, srcCss);

  writeAtomic(dstJsPath, nextJs);
  writeAtomic(dstCssPath, nextCss);

  return {
    ok: true,
    action: 'install',
    targetDir,
    jsChanged: nextJs !== prevJs,
    cssChanged: nextCss !== prevCss,
    ...readConfigFlags(targetDir)
  };
}

export function uninstallPlugin({ targetDir = DEFAULT_TARGET_DIR } = {}) {
  const dstJsPath = join(targetDir, 'custom.js');
  const dstCssPath = join(targetDir, 'custom.css');

  let jsRemoved = false;
  let cssRemoved = false;

  if (existsSync(dstJsPath)) {
    const prevJs = readFileSync(dstJsPath, 'utf8');
    const res = removePluginBlock(prevJs);
    if (res.removed) {
      writeAtomic(dstJsPath, res.text);
      jsRemoved = true;
    }
  }

  if (existsSync(dstCssPath)) {
    const prevCss = readFileSync(dstCssPath, 'utf8');
    const res = removePluginBlock(prevCss);
    if (res.removed) {
      writeAtomic(dstCssPath, res.text);
      cssRemoved = true;
    }
  }

  return {
    ok: true,
    action: 'uninstall',
    targetDir,
    jsRemoved,
    cssRemoved
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let cmd = 'status';
  let targetDir = DEFAULT_TARGET_DIR;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'install' || a === 'uninstall' || a === 'status') {
      cmd = a;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--target-dir' && args[i + 1]) {
      targetDir = resolve(args[++i]);
    } else if (a === '-h' || a === '--help') {
      cmd = 'help';
    }
  }
  return { cmd, targetDir, json };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { cmd, targetDir, json } = parseArgs(process.argv);
  if (cmd === 'help') {
    console.log('Usage: node install.mjs <install|uninstall|status> [--target-dir <dir>] [--json]');
    process.exit(0);
  }
  try {
    const result =
      cmd === 'install'
        ? installPlugin({ targetDir })
        : cmd === 'uninstall'
          ? uninstallPlugin({ targetDir })
          : getPluginStatus({ targetDir });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (cmd === 'install') {
      console.log(`[agy-sidebar-enhance] Installed into ${result.targetDir} (jsChanged=${result.jsChanged}, cssChanged=${result.cssChanged})`);
      console.log('chuanban daemon will hot-reload in ~2.5s.');
    } else if (cmd === 'uninstall') {
      console.log(`[agy-sidebar-enhance] Uninstalled from ${result.targetDir} (jsRemoved=${result.jsRemoved}, cssRemoved=${result.cssRemoved})`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`[agy-sidebar-enhance] Error: ${err?.message || err}`);
    process.exit(1);
  }
}
