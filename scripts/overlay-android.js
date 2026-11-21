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
// 版本号统一以 package.json 的 version 为准：覆盖时同步到 app/build.gradle，
// 免得每次改版本都要手动改两个地方。
const appGradle = path.join(DST, 'app', 'build.gradle');
if (fs.existsSync(appGradle)) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const versionName = String(pkg.version || '0.0');
  const nums = versionName.split('.').map(function (n) { return parseInt(n, 10) || 0; });
  const versionCode = nums[0] * 10000 + (nums[1] || 0) * 100 + (nums[2] || 0);
  let gradle = fs.readFileSync(appGradle, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
  gradle = gradle.replace(/versionName\s+"[^"]*"/, 'versionName "' + versionName + '"');
  fs.writeFileSync(appGradle, gradle);
  console.log('  版本号 versionName ' + versionName + ' / versionCode ' + versionCode);
}

console.log('\n完成：' + copied + ' 个文件已覆盖到 android/');
console.log('接下来：npx cap sync android');
