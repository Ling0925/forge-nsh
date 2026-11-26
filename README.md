# Forge NSH

Forge NSH 是一个用 **NSH 0.7.1** 编写的 Forge Web 工作台。仓库内嵌固定版本的 Forge Core，由一个 Node.js 启动器在本机启动 Core、托管编译后的 NSH Web 包，并把浏览器 API 与 WebSocket 流量安全地转发到 loopback 上的 Core。

这是初始验证版本：界面、会话列表、实时事件、运行控制与审批链路都使用真实 Forge Core 协议；它不是静态 mock。

## 架构

```text
浏览器
  │  HTTP / WebSocket（同源）
  ▼
scripts/forge-nsh.mjs
  ├─ 静态托管 dist/web/forge-nsh
  ├─ 代理 /api/* 到 Forge Core
  ├─ 代理并升级 /api/events WebSocket
  └─ 重写 Host / Origin，满足 Core 的同源检查
       │
       ▼
vendor/forge-core/dist/web/serve.js
  loopback 127.0.0.1:<空闲端口>
```

- `vendor/forge-core` 是 Git 子模块，固定在任务要求的提交 `f4bdb7b240477ef4a26ebc870e4e012b4dbc0f0c`。
- Core 只监听 `127.0.0.1`，不直接暴露到局域网。
- 启动器默认监听机器的主 LAN IPv4 地址和端口 `21888`。
- 静态响应带有 WebAssembly 所需 CSP：
  `script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ws: wss:; img-src 'self' blob: data:`
- `.wasm` 文件使用正确的 `application/wasm` MIME 类型；NSH 产生的 `.br` / `.gz` 预压缩资产会按 `Accept-Encoding` 自动使用。

## 环境要求

- Node.js `>=22.23.1 <23`
- pnpm `11.x`
- NSH CLI `0.7.1`
- Git

首次安装：

```sh
pnpm run setup
pnpm run build
```

`setup` 会初始化子模块、安装并编译固定版本的 Forge Core。`build` 会重新编译 Core，并执行：

```sh
nsh package App.tsx --target web --out dist/web
```

## 启动、停止与检查

```sh
pnpm start
```

启动成功后终端会输出类似：

```text
[forge-nsh] ready: http://192.168.x.x:21888
```

停止服务：

```sh
pnpm stop
```

运行隔离 smoke 测试：

```sh
pnpm run smoke
```

smoke 测试使用仓库 `tmp/` 下自动创建并清理的临时 `FORGE_HOME` 与临时 workspace，不读取真实 provider 配置或密钥，也不会向真实模型服务发送请求。它会检查：

1. 静态首页可由启动器访问；
2. CSP 包含 WebAssembly 与 WebSocket 所需规则；
3. `.wasm` 资产返回 `application/wasm`；
4. `POST /api/connect` 通过代理返回真实 `clientId`、事件 cursor 和 workspace；
5. `POST /api/rpc` + `X-Forge-Client` 可调用 `listSessions`。

也可以显式指定监听地址、端口、workspace 和状态目录：

```sh
node scripts/forge-nsh.mjs \
  --host 192.168.1.20 \
  --port 21888 \
  --workspace /path/to/project \
  --forge-home /path/to/private/state
```

未显式指定时，`FORGE_HOME` 默认为 `~/.local/share/forge-nsh`。Forge Core 会自行创建并以私有权限保护该目录；不要预先放松其权限。

## 界面能力

当前工作台包含：

- 左侧会话列表、工作区摘要与“新会话”入口；
- 中央对话 transcript、Markdown 渲染、流式文本与基础工具活动提示；
- 底部 composer、停止运行按钮与审批卡片；
- 右侧 Inspector，显示连接、事件 cursor、workspace、模型、run 与消息数量；
- Core 断线后的自动重连；事件流按 cursor ack 推进。

协议实现位于 `App.tsx`：它调用 `POST /api/connect`，使用 `/api/rpc` 调用 `listSessions`、`createSession`、`getSession`、`startRun`、取消与审批接口，并通过 `WebSocket /api/events?clientId&cursor` 接收真实事件。

## 安全边界

这是面向**可信局域网**的验证服务，不是公网服务：

- HTTP 不加密，不要暴露到不可信网络；
- 默认不使用 wildcard `0.0.0.0` / `::` 地址；
- 启动器只接受与监听地址完全一致的 HTTP `Host`；
- 转发到 Core 前会重写 `Host` 与 `Origin`，并移除外部传入的 forwarding 头；
- 真实模型的可用性取决于所使用 `FORGE_HOME` 中的 Forge 配置；仓库本身不包含任何密钥。

## 当前限制

- 工具结果只显示压缩摘要；尚未实现完整 diff、文件树、checkpoint 或富工具卡片。
- 不支持在 UI 中编辑 provider 设置、切换 workspace、上传图片或管理 archive。
- 审批界面覆盖主要 command approval 流程，但尚未覆盖全部未来 approval 类型。
- NSH Web 运行时尚新；个别排版能力与浏览器原生 DOM 不完全等同。
- 本项目是初始 proof of concept，未声称达到生产级 Forge Web UI 的功能完整度。

## 仓库结构

```text
App.tsx                 NSH 工作台界面与 Core 客户端协议
App.test.tsx            NSH 渲染 smoke test
nsh.json                NSH 应用元数据
theme.json              深色工作台主题 token
scripts/forge-nsh.mjs   Core 启动器、静态服务器与反向代理
scripts/smoke.mjs       隔离端到端 smoke 验证
vendor/forge-core       固定 Forge Core 子模块
dist/web/forge-nsh      生成产物（不提交）
```
