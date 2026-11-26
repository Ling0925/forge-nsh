# Forge NSH Workbench

一个使用 **Native Shell（NSH）0.7.1** 编写的深色三栏 Forge 工作台。视觉布局参考 T3Code：左侧会话栏、中间 transcript/composer、右侧连接/审批/工作区/活动检查器。后端不是 mock：页面通过同源反向代理连接到一个随服务启动的、固定版本 Forge Core 子进程。

A dark, three-pane Forge workbench written with **Native Shell (NSH) 0.7.1**, visually inspired by T3Code. It uses a real pinned Forge Core subprocess behind a same-origin reverse proxy—there is no mocked session or event data.

## 安全警告 / Security warning

> **只把本服务放在受信任局域网或本机使用。**
>
> 默认公开监听 `0.0.0.0:21888`。这是明文 HTTP；当前初始版本**没有配对、登录、访问令牌或传输加密**。任何能访问该地址的人都可能创建会话、启动运行、批准工具并访问被授予的工作区。不要暴露到公网，不要指向包含密钥或不可信修改风险的生产工作区。
>
> **Trusted LAN only.** The public listener is plaintext HTTP on `0.0.0.0:21888`, with no pairing, authentication or encryption in this initial version. Anyone who can reach it may use the configured workspace. Do not expose it to the Internet.

## 架构 / Architecture

```text
浏览器 Browser
   │  http(s) static + /api/* + WebSocket /api/events
   ▼
forge-nsh launcher (Node.js, public 0.0.0.0:21888)
   ├─ serves .nsh/out/forge-nsh with application/wasm, compression and CSP
   ├─ rewrites Host/Origin for Forge Core's strict same-origin checks
   └─ proxies HTTP RPC and WebSocket frames
         ▼
embedded pinned Forge Core (loopback 127.0.0.1:<ephemeral>)
   └─ sessions, run host, approvals, workspace file APIs, event replay ring
```

- `vendor/forge-core` 是 Git submodule，固定到公开提交 `f4bdb7b240477ef4a26ebc870e4e012b4dbc0f0c`。
- Core 只绑定 loopback，并使用临时空闲端口；浏览器永远不直接访问 Core 端口。
- NSH 应用通过 `UrlScheme.url()` 推导当前页面 origin，因此从 `127.0.0.1` 或局域网 IP 打开都会使用同源 API/WS 地址。
- 启动器转发请求时重写 `Host` 与 `Origin`，满足 Core 对 Host authority、Origin、`Content-Type` 和 WebSocket 握手的一致性强校验。
- `vendor/forge-core` is a pinned Git submodule. Core binds only to loopback on an ephemeral port; the browser talks only to the launcher.

## 快速开始 / Quick start

要求 / Requirements:

- Node.js `>=22.23.1 <23`
- pnpm `11.18.0`（建议用 Corepack）
- NSH CLI `0.7.1` 在 `PATH` 中
- Linux/macOS shell 环境

```sh
git clone --recurse-submodules <this-repo-url>
cd forge-nsh

# 安装 submodule 内 Core 依赖、构建 Core、检查并打包 NSH Web 应用
pnpm build

# 前台运行（默认端口 21888，默认工作区为当前目录）
pnpm serve -- --workspace /absolute/path/to/workspace

# 或后台运行
pnpm start -- --workspace /absolute/path/to/workspace \
  --forge-home /absolute/private/forge-home
pnpm status
```

打开 / Open:

```text
http://127.0.0.1:21888
http://<your-lan-ip>:21888
```

停止 / Stop:

```sh
pnpm stop
```

### 重要目录 / Important paths

- 日志：`./.forge-nsh/forge-nsh.log`
- PID：`./.forge-nsh/forge-nsh.pid`
- 打包输出：`./.nsh/out/forge-nsh/`（生成物，不提交）
- Core 构建输出：`vendor/forge-core/dist/`（生成物，不提交）

`FORGE_HOME` 存放 Forge 设置、密钥引用和会话数据。Core 会要求它是私有目录；建议不要手工放入仓库公开区域，也不要把真实密钥用于烟测。

## 验证 / Verification

```sh
pnpm check
pnpm smoke
```

`pnpm check` 覆盖 NSH TypeScript 检查和三个 Node 脚本的语法检查。`pnpm smoke` 使用临时工作区和临时 `FORGE_HOME`，启动一个端口为 0 的临时服务，并验证：

- `/healthz`；
- 静态 HTML、压缩资产路径、`application/wasm` 与 WASM magic bytes；
- CSP 包含 `script-src 'self' 'wasm-unsafe-eval'`；
- `/api/connect` 握手；
- 代理后的 `getHostState`、`updateSettings`、`createSession`、`getSession`、`listSessions`、`getSettings`、`listWorkspaceEntries`、`readWorkspaceFile` RPC；
- 代理后的 `/api/events` WebSocket upgrade、首批事件帧和 cursor ack。

它不调用真实模型 Provider，不读取用户真实 Forge 配置。

## 当前范围 / Current scope

已实现 / Implemented:

- T3Code 风格深色三栏响应式布局；
- 真实 Core connect/RPC/WebSocket 客户端、cursor 重放与重连；
- 会话列表、选择、草稿、新会话创建入口；
- transcript 空态、用户/助手/工具消息、流式文本和 reasoning 展示；
- composer、发送状态、运行取消入口；
- Host 运行状态、pending approval 批准/拒绝；
- 工作区根目录条目和文件元信息预览入口；
- 右侧活动 feed 显示工具、审批、错误和生命周期事件；
- 公开静态服务、API 反代、WS 反代、后台服务管理与 smoke test。

## 已知限制 / Known limitations

- 这是初始版本，不是 T3Code 或 Forge Web UI 的功能等价物。
- 无认证/配对/加密；仅适合本机或受信任 LAN。
- 未实现设置编辑、模型选择、图片附件、plan mode、checkpoint/diff、input queue、super-agent、MCP/plugin、usage dashboard 或移动审批。
- 工作区面板当前只列根目录条目，尚不是完整文件树/编辑器。
- 消息分页、diff 增量快照和长 transcript 的高级恢复逻辑比 Forge Web UI 简化。
- NSH Web 的组件模型不是 React；本仓库不使用 React、Vite 或 DOM 层 UI。
- 若 Forge 未配置 Provider/API Key，界面和会话存储仍可验证，但启动模型运行会失败并显示错误。
- `.nsh/`、Core `node_modules`/`dist`、日志、PID 与运行时状态均为本地生成物，不应提交。

## 开发说明 / Development notes

```sh
# 仅重建 Core（必要时 --force）
node scripts/build.mjs --core-only [--force]

# 仅检查并打包 NSH Web
node scripts/build.mjs --web-only

# 前台调试，固定 Core 端口（通常不需要）
node scripts/forge-nsh.mjs serve --port 21888 --workspace "$PWD" --core-port 23456
```

不要手工编辑 `.nsh/types`。不要提交 `.nsh/out`、`vendor/forge-core/node_modules` 或 `vendor/forge-core/dist`；它们由构建脚本重新生成。

## License / Scope note

本仓库是实验性工作台装配层。Forge Core 的代码与许可证以其上游仓库为准；此处只通过 pinned submodule 引用，不复制其源码。
