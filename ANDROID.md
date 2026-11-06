# 打包成安卓 APK

网页版可直接用浏览器打开；想要「别的应用在前台时也能收到消息」，必须装 APK——
浏览器被系统冻结后没有任何办法自救，只有原生层的前台服务 + 精确闹钟能做到。

仓库里只有 `www/` 和「我们改过的那几个原生文件」（`android-src/`）。
`android/` 目录由 Capacitor 官方模板生成，不入库。

## 一次性准备

- Node.js 20 或更高
- JDK 21
- Android SDK（Platform 35 + Build-Tools 35）
- 环境变量 `ANDROID_HOME` 指向 SDK 目录

## 首次打包

```bash
cd kismet
npm install                 # 装 Capacitor
npx cap add android         # 生成标准 android/ 工程
node scripts/overlay-android.js   # 用 android-src/ 覆盖成我们的版本
npx cap sync android
cd android
gradlew.bat assembleDebug   # Windows；macOS/Linux 用 ./gradlew
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

## 之后每次改完网页

```bash
cd kismet
npm run android:build       # 覆盖 + sync + 打包，一步到位
```

只改了 `www/` 下的东西时，`npx cap sync android` + `gradlew assembleDebug` 就够了；
改了 `android-src/` 里的 Java / Manifest，才需要先跑 `overlay-android.js`。

## android-src 覆盖了什么

| 文件 | 作用 |
| --- | --- |
| `MainActivity.java` | 注册插件；切后台后 `resumeTimers()` 让 WebView 的 JS 定时器继续跑 |
| `NotificationPlugin.java` | 发通知（按梦角分组、透传 data:base64 头像）、排期接口 |
| `MessageAlarmReceiver.java` | 核心：把「未来 3 格梦角说话」交给 AlarmManager，到点弹通知并记入待补投递 |
| `ForegroundService.java` | 前台服务 + WakeLock 续期 + 超时/被杀自愈；`sRunning` 供 Activity 判断 |
| `ForegroundPlugin.java` | 启停保活、电池优化 / 精确闹钟 / 悬浮窗 / 厂商白名单跳转 |
| `KeepAliveReceiver.java` | 每 5 分钟（主 + 60 秒后备）自愈唤醒 |
| `BootReceiver.java` | 开机 / 快启 / 升级后恢复服务并重排消息闹钟 |
| `KeepAliveActivity.java` | 任务被划掉瞬间的无窗口保活宿主 |
| `AndroidManifest.xml` | 权限、前台服务类型、四个 receiver |

## 后台消息是怎么保证送达的

三层，任一层活着就够：

1. **WebView 定时器**：`resumeTimers()` + WakeLock，页面在后台也继续跑 `runAutoSend`，
   消息直接进聊天，这是最理想的一条路；
2. **原生精确闹钟**：页面每 60 秒把「未来 3 格」重新交给 AlarmManager。页面活着时闹钟被
   不断推后、不会重复；页面被冻结或进程被杀后 JS 停止重排，闹钟到点自己弹通知，
   并把文案记进待投递队列，下次回前台由 JS 补进聊天；
3. **前台服务自愈**：服务被系统杀掉 / 划掉任务 / 重启手机，都会由 KeepAliveReceiver 或
   BootReceiver 重新拉起。

排期依赖「主动发消息给我」开着：没开就不会有主动消息，也就不排期。

## 装到手机后要给的权限

首次打开会引导，也可以手动补：

1. 通知权限（Android 13+ 必给，否则通知会被静默丢弃）
2. 电池优化 → 不限制
3. 精确闹钟 → 允许
4. 悬浮窗（可选，能显著提高进程被杀后重新拉起的成功率）
5. 厂商自启动白名单（小米 / 华为 / OPPO / vivo / 魅族 / 三星，设置页有直达按钮）

状态栏会常驻一条「正在后台运行」的通知，这是 Android 对前台服务的硬性要求，不能隐藏。

## 验证

- 设置 → 通知与保活 → 后台保活，页面里会显示「已排 3 格」；
- 按 Home 键切到桌面，等一个「主动发送间隔」，应该弹出对应梦角的通知（标题是梦角名，
  大图标是梦角头像）；
- 从通知点回来，那条消息应该已经出现在对应聊天里；
- 想立刻验收不要等：把「主动发送间隔」调到 1 分钟。

## 排错

- **通知不弹**：先看系统设置里通知是否被关、渠道「消息通知」是否被静音；再看电池优化是否豁免。
- **锁屏一会儿就断**：厂商省电策略杀进程，按上面第 5 条加白名单；部分机型还要关掉「睡眠模式」。
- **精确闹钟被拒**：`canScheduleExactAlarms()` 为 false 时会自动降级为非精确闹钟，
  Doze 下可能延迟十几分钟——去系统设置手动允许。
- **点了「关闭保活」后还能收到保活通知**：卸载重装即可；已加「用户主动关闭」标记，
  正常版本不会再被自愈链路拉起。
