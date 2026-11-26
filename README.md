# Forge NSH

Forge NSH 是一个初始的 NSH Web 工作台：同一进程启动嵌入的 Forge Core，提供受 T3 Code 启发的深色三栏界面，并默认监听局域网地址的 **21888** 端口。

## 架构

```text
浏览器
  │  HTTP / WebSocket，同源
  ▼
Forge NSH 网关（scripts/forge-nsh.mjs，LAN IPv4:21888）
  ├─ 静态托管 .nsh/out/<app>（application/wasm、严格 CSP）
  ├─ 反向代理 /api/*，重写 Host 与 Origin
  └─ 隧道代理 /api/events WebSocket
        ▼
Forge Core 子进程（vendor/forge-core，仅 127.0.0.1:<随机端口>）
```

- `vendor/forge-core` 是固定提交的 Git submodule，仓库代码不修改它。
- 前端由 NSH 0.7.1 从 `App.tsx` 与 `src/` 打包成 WebAssembly + JS 静态站点。
- UI 实现真实 Forge Web 协议：`POST /api/connect`、带 cursor ack 的 `/api/events` WebSocket、带 `X-Forge-Client` 与 UUID request id 的 `POST /api/rpc`。
- 已接入的 RPC：`listSessions`、`createSession`、`getSession`、`startRun`、`cancelRun` / `cancelSession`、`answerApproval`。

## 快速开始

要求：Node 22.23.x、pnpm 11.18+、已安装的 `nsh` 0.7.1。

```sh
git submodule update --init --recursive
npm run setup     # 安装并构建 vendor/forge-core，然后打包 NSH Web UI
npm run smoke     # 使用临时 FORGE_HOME 与临时 workspace 做端到端冒烟
npm start         # 后台启动，默认 http://<主 LAN IPv4>:21888
npm stop          # 停止后台服务
```

也可以前台运行并覆盖配置：

```sh
node scripts/forge-nsh.mjs \
  --workspace /path/to/project \
  --host 192.168.8.108 \
  --port 21888
```

常用环境变量：`FORGE_NSH_HOST`、`FORGE_NSH_PORT`、`FORGE_NSH_WORKSPACE`、`FORGE_NSH_RUN_DIR`、`FORGE_HOME`。

默认情况下服务把 Forge 状态放在仓库下的 `.forge-nsh/home`，不会读取你既有的真实 Forge 配置或密钥。若明确要复用既有 Provider 配置，请自行设置 `FORGE_HOME`；这样会让该 LAN 服务能使用其中保存的凭据，需自行评估风险。

## 安全边界：仅可信局域网

**不要把这个端口暴露到不可信网络。** 当前 Forge Core 使用 trusted-LAN 模式：

- 没有 TLS，HTTP 与 WebSocket 内容不加密；
- 没有设备配对或用户登录；
- 能访问 `http://<LAN IP>:21888` 的人即可创建会话并驱动 Forge Core；
- 网关只做同源、Host、Origin 与路径边界检查，它不是公网安全网关。

## 当前限制

这是一个 polished PoC，而不是完整 Forge Web UI 替代品：

- 工具调用和高级事件以紧凑摘要呈现，不提供完整 diff、文件树、浏览器工具、检查点或用量看板；
- Markdown 使用 NSH `TextView` 渲染， streaming 时启用 streaming caret；
- 没有会话重命名、归档、fork、compact、图片附件上传或 MCP/插件设置界面；
- WebSocket 断线后通过新的 `/api/connect` 重建连接并刷新快照，长时间离线期间的瞬时流式文本可能不会逐字恢复；
- 如果没有配置 Provider/API key，连接、空状态和 Inspector 仍可验证；Core 会拒绝创建会话，并在 composer 状态行显示该错误；
- 默认绑定服务启动时探测到的主 LAN IPv4，而不是 `0.0.0.0`；本机访问请使用输出的具体地址。

## 设计规范

界面目标规范、实施口径与迁移清单见 [`docs/DESIGN.md`](docs/DESIGN.md)。当前实现尚未完成迁移，冲突时以文档第 1–5 节为准。

## 开发

```sh
npm run check   # NSH/TypeScript 检查
npm run build   # Core build + NSH package
npm run smoke   # 临时状态目录的端到端检查
```

日志与 pid：`./.forge-nsh/service.log`、`./.forge-nsh/service.pid`。这两个路径以及 `.nsh/` 构建产物不会提交。
