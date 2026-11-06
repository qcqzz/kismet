#!/usr/bin/env node
/**
 * overlay-android.js — 把仓库里的 android-src/ 覆盖到 Capacitor 生成的 android/ 工程上。
 *
 * 用法（在 kismet 仓库根目录）：
 *   npm install
 *   npx cap add android          # 首次：生成标准 Android 工程
 *   node scripts/overlay-android.js
 *   npx cap sync android
 *   cd android && gradlew.bat assembleDebug
 *
 * 说明：仓库只保存"我们改过的那几个文件"，其余（gradle 脚本、资源、图标）都来自
 * `npx cap add android` 的官方模板，所以必须先生成再覆盖。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'android-src');
const DST = path.join(ROOT, 'android');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(DST)) {
  console.error('找不到 android/ 目录。先运行: npx cap add android');
  process.exit(1);
}

const files = walk(SRC);
let copied = 0;
for (const file of files) {
  const rel = path.relative(SRC, file);
  const target = path.join(DST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  copied++;
  console.log('  覆盖 ' + rel);
}
console.log('\n完成：' + copied + ' 个文件已覆盖到 android/');
console.log('接下来：npx cap sync android');
