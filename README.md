# OpenBlocks for TurboWarp

一个运行在 TurboWarp 编辑器里的 AI Agent 扩展。它可以和你对话、读取当前作品、直接拼装 Scratch 积木、创建角色和变量、添加造型、运行项目，并在修改前保存可撤销的快照。

界面参考 Kilo Code 的右侧停靠式 Agent 侧栏：深色主题、对话流、工具调用卡片、任务计划和底部输入框。没有右下角悬浮按钮。

## 功能

- **对话式创作**：用自然语言描述游戏、动画或功能，AI 会规划并逐步实现。
- **直接拼积木**：通过 `add_script` 工具把 JSON 积木 DSL 转换成真正的 Scratch 积木，支持堆叠、C 型分支、变量、列表、广播、菜单和嵌套 reporter。
- **脚本自动错位**：同一批或后续新增的顶层脚本会按已有脚本高度自动放到下方，避免积木重叠。
- **积木级编辑**：`delete_block` / `edit_block` / `insert_block` / `move_block` 支持单个积木的删除、原地修改、插入和移动，不再只能整段脚本删除重建。
- **多角色协作**：所有积木、变量、造型、声音工具都接受 `target`，可以在多个角色和舞台之间分别操作，并用广播/全局变量协调。
- **变量/造型/声音管理**：支持重命名和删除；删除变量/广播会清理或重连引用它的积木，重命名造型/声音会同步积木引用。
- **撤回并编辑**：鼠标悬停用户消息会显示编辑按钮；撤回该消息及其后的所有对话，并尝试恢复发送前的项目快照，把原文放回输入框。
- **读取项目上下文**：自动注入角色、变量、造型、脚本数量摘要；需要细节时 AI 会调用 `get_project` 读取脚本。
- **积木目录检索**：内置 Scratch 3 / TurboWarp 常用积木目录，AI 不确定 opcode 或输入名时会查询 `get_block_catalog`。
- **角色 / 变量 / 造型 / 舞台操作**：创建、删除、重命名角色，设置坐标、大小、方向，创建变量和列表，添加 SVG / PNG 造型，切换背景，设置舞台属性。
- **运行与导出**：点击绿旗、停止全部脚本、导出 `.sb3`。
- **撤销快照**：每次 AI 修改前保存项目快照，侧栏右上角可一键恢复。
- **本地演示模式**：没有 API Key 也能体验完整流程：读取项目 → 更新计划 → 创建脚本 → 运行 → 更新计划。
- **流式输出**：支持 OpenAI 兼容接口的 SSE 流式回复和工具调用。
- **自动重试**：遇到 429 / 500 / 502 / 503 / 504 或网络错误时自动指数退避重试，默认 3 次，可在设置中调整。
- **对话持久化**：按项目指纹保存对话；项目被替换或重置时自动清理旧对话，避免历史与当前作品错位。
- **运行时验证**：`get_runtime_state` 读取变量值、列表、角色坐标、克隆数、线程、FPS、计时器和监视器；`wait_until` 轮询条件；`verify_project` 可“运行→等待→读取状态→截图→停止”。
- **舞台截图**：`capture_stage` 通过渲染器生成 PNG，并在工具卡片中直接预览。
- **项目搜索和引用分析**：`search_project` 跨角色搜索积木、变量、造型、声音；`find_references` 在重命名/删除前查看影响范围。
- **扩展积木目录**：`get_block_catalog` 现在会合并已加载扩展的积木，不再只覆盖核心积木。
- **持久化检查点**：快照同时写入 IndexedDB，刷新页面后仍可通过 `list_checkpoints` / `restore_checkpoint` 恢复；支持撤销和重做。
- **Token 统计**：侧栏显示本会话累计 token；长对话会自动截断旧上下文。
- **造型/声音管理**：新增重命名、删除、重排；删除变量/广播会清理引用积木。

## 界面

- 扩展加载后自动打开右侧侧栏。
- 关闭后，右侧屏幕边缘会出现一个竖向 `AI` 标签，点击重新打开。
- `Ctrl+Shift+A` 切换侧栏。
- 顶部按钮：撤销、重做、设置、清空对话、关闭。
- 底部输入框显示当前 Agent 模式和模型；点击模型徽章可直接打开设置。
- 工具调用以可展开卡片显示参数和结果；截图类工具会直接显示图片预览；多步骤任务显示在计划卡中。

## 快速开始

### 方式 A：本地服务器（推荐）

TurboWarp 只允许从 `http://localhost:8000/` 或 `https://extensions.turbowarp.org/` 自动加载非沙箱扩展。项目自带一个静态服务器，默认端口 `8000`。

```bash
npm install
npm run build
npm run serve
```

然后在 TurboWarp 编辑器中：

1. 打开 `https://turbowarp.org/editor`。
2. 点击左下角“添加扩展”或使用扩展加载对话框。
3. 选择“从 URL 加载”，输入：

```text
http://localhost:8000/dist/ai-agent.js
```

也可以直接打开：

```text
https://turbowarp.org/editor?extension=http://localhost:8000/dist/ai-agent.js
```

### 方式 B：直接加载文件

1. 打开 TurboWarp 编辑器的扩展加载对话框。
2. 选择本地文件 `dist/ai-agent.js`。
3. 勾选“在不使用沙箱的情况下运行扩展”（Run extension without sandbox）。

扩展需要非沙箱环境才能访问 VM、DOM 和网络。以沙箱方式加载会直接报错。

### 开发模式

```bash
npm run dev
```

会同时启动 esbuild watch 和 `http://localhost:8000/` 静态服务器。修改 `src/` 后刷新编辑器即可。

## 配置 AI

打开侧栏右上角设置，选择服务商并填写配置：

| 服务商 | Base URL 示例 | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3.1` |
| 自定义 | 任意 OpenAI 兼容接口 | 你的模型名 |
| 本地演示 | 无需填写 | `openblocks-demo` |

说明：

- Base URL 通常需要包含 `/v1`；也可以直接填写完整的 `/chat/completions` 地址。
- 模型必须支持 OpenAI 风格的 function calling / tools，否则 AI 无法调用工具修改项目。
- API Key 默认保存在浏览器 `localStorage`。公共电脑上请取消“记住 API Key”。
- 设置里有“测试连接”按钮，会发送一个最小请求验证 Base URL、Key 和模型。
- “失败自动重试次数”默认为 3。接口繁忙时会显示“正在自动重试（1/3）…”，并优先遵守服务端返回的 `Retry-After`。

### CORS 注意事项

首次请求一个新的接口域名时，TurboWarp 会弹出“扩展安全警告”。点击“允许”即可，之后同一站点会自动允许；如果点了拒绝，请求可能一直等待或失败，刷新页面后重新请求即可。

浏览器直接请求 AI 接口会受到 CORS 限制：

- OpenAI 兼容服务需要允许浏览器跨域请求。
- 本地 Ollama 默认只监听本地且需要允许来源，可这样启动：

```bash
OLLAMA_ORIGINS=* ollama serve
```

- 如果服务商不允许浏览器直连，需要使用自建代理、Cloudflare Worker、OpenRouter 等允许浏览器请求的网关，或使用 TurboWarp 桌面版配合本地代理。
- 连接失败时，侧栏会显示错误和排查提示。

## 使用示例

在底部输入框输入：

- `做一个打砖块游戏，包含分数、生命和重新开始`
- `给当前角色加一个跟随鼠标的脚本`
- `做一个收集金币的小关卡，金币用克隆体`
- `解释当前项目的脚本结构`
- `把所有脚本里的变量名改成英文`
- `给角色画一个简单的飞船造型并切换过去`

AI 会先读取项目，必要时更新任务计划，然后调用工具。工具卡片会显示执行状态；失败时会显示错误，AI 会读取错误并尝试修复。

### 撤回并编辑

鼠标悬停任意一条用户消息，左侧会出现铅笔按钮。点击后确认：

- 删除这条用户消息及其后的所有对话。
- 按消息发送前记录的标记回滚项目快照，撤销这条消息之后 AI 做出的积木修改。
- 把这条消息的原文放回输入框，方便修改后重新发送。
- 如果快照已随页面刷新丢失，会提示无法自动恢复项目，但对话仍会撤回。

### 撤销

点击侧栏右上角的撤销按钮，确认后会把项目恢复到最近一次 AI 修改前的快照；旁边的重做按钮可以恢复撤销前的状态。每次 AI 修改还会异步写入 IndexedDB 检查点，刷新页面后可通过 AI 工具 `list_checkpoints` / `restore_checkpoint` 查看和恢复。

### 运行和导出

- 让 AI “运行项目”或调用 `run_project` 工具会点击绿旗。
- 让 AI “导出项目”会下载 `.sb3` 文件。
- 也可以使用扩展积木“撤销最近的 AI 修改”。

## 内置工具

| 工具 | 作用 |
| --- | --- |
| `get_project` | 读取项目摘要或可读脚本树 |
| `get_block_catalog` | 查询核心积木和已加载扩展积木的 opcode、输入、字段和菜单 |
| `get_runtime_state` | 读取运行时变量、列表、角色状态、克隆、线程、FPS、计时器 |
| `wait` | 等待指定秒数 |
| `wait_until` | 轮询运行时条件直到满足或超时 |
| `verify_project` | 运行项目、等待条件、读取状态、可选截图/停止 |
| `capture_stage` | 截取舞台 PNG 并在侧栏预览 |
| `search_project` | 跨角色搜索积木、变量、造型、声音 |
| `find_references` | 查找变量/广播/造型/声音/角色名的所有引用 |
| `create_sprite` | 创建带占位造型的角色 |
| `delete_sprite` | 删除角色（需确认） |
| `rename_sprite` | 重命名角色 |
| `set_sprite` | 设置坐标、方向、大小、可见、图层、造型 |
| `create_variable` | 创建变量、列表或广播 |
| `set_variable` | 设置变量或列表值 |
| `rename_variable` | 重命名变量、列表或广播 |
| `delete_variable` | 删除变量/列表/广播并清理引用积木 |
| `add_script` | 用积木 DSL 拼装脚本 |
| `delete_block` | 删除单个积木，可只删一块、删整条后续链或删整个脚本 |
| `edit_block` | 原地修改积木的字段、输入和 C 型分支 |
| `insert_block` | 在脚本中插入积木（after/before/substack/input） |
| `move_block` | 移动/重新连接已有积木 |
| `delete_script` | 删除指定顶层脚本（需确认） |
| `clear_scripts` | 清空角色脚本（需确认） |
| `add_costume` | 从 SVG 或 data URL 添加造型 / 背景 |
| `rename_costume` | 重命名造型/背景并同步积木引用 |
| `delete_costume` | 删除造型/背景并重定向引用 |
| `rename_sound` | 重命名声音 |
| `delete_sound` | 删除声音 |
| `reorder_costume` | 重排造型/背景 |
| `reorder_sound` | 重排声音 |
| `set_backdrop` | 切换背景 |
| `set_stage` | 设置舞台速度、音量、视频状态 |
| `run_project` | 点击绿旗 |
| `stop_project` | 停止全部脚本 |
| `export_project` | 导出 `.sb3` |
| `undo_last_change` | 恢复最近一次快照 |
| `redo_last_change` | 重做最近一次撤销 |
| `list_checkpoints` | 列出持久化检查点 |
| `save_checkpoint` | 保存命名检查点 |
| `restore_checkpoint` | 恢复持久化检查点 |
| `delete_checkpoint` | 删除持久化检查点 |
| `update_plan` | 更新侧栏任务计划 |

## 积木 DSL

`add_script` 接收一个或多个顶层脚本。每个脚本是一个积木对象：

```json
{
  "opcode": "event_whenflagclicked",
  "next": [
    {
      "opcode": "looks_sayforsecs",
      "inputs": { "MESSAGE": "你好！", "SECS": 2 }
    },
    {
      "opcode": "control_repeat",
      "inputs": { "TIMES": 10 },
      "substacks": {
        "SUBSTACK": [
          { "opcode": "motion_movesteps", "inputs": { "STEPS": 10 } },
          { "opcode": "motion_turnright", "inputs": { "DEGREES": 15 } }
        ]
      }
    }
  ]
}
```

规则：

- `next`：垂直堆叠的后续积木数组。
- `substacks`：C 型积木分支，例如 `SUBSTACK`、`SUBSTACK2`。
- `inputs`：输入值。可以是数字、字符串、嵌套 reporter、变量 / 列表 / 广播 / 颜色 / 菜单。
- `fields`：下拉字段，例如 `{"KEY_OPTION": "space"}`、`{"VARIABLE": "score"}`。
- 变量字段和 `{"variable": "score"}` 会自动解析变量 ID；缺失时默认在舞台上创建全局变量（可用 `auto_create_variables: false` 关闭）。
- 菜单输入直接传字符串，例如 `COSTUME: "costume1"`、`CLONE_OPTION: "_myself_"`；构建器会创建正确的隐藏菜单积木。
- 布尔输入必须使用 boolean reporter，例如 `operator_gt`、`operator_and`、`sensing_touchingobject`，不能直接传 `true` / `false`。

输入示例：

```json
{
  "opcode": "looks_say",
  "inputs": {
    "MESSAGE": {
      "opcode": "operator_join",
      "inputs": {
        "STRING1": "得分: ",
        "STRING2": { "variable": "score" }
      }
    }
  }
}
```

```json
{
  "opcode": "data_changevariableby",
  "fields": { "VARIABLE": "score" },
  "inputs": { "VALUE": 1 }
}
```

```json
{
  "opcode": "control_if",
  "inputs": {
    "CONDITION": {
      "opcode": "sensing_touchingobject",
      "inputs": { "TOUCHINGOBJECTMENU": "_mouse_" }
    }
  },
  "substacks": {
    "SUBSTACK": [
      { "opcode": "looks_say", "inputs": { "MESSAGE": "碰到鼠标了" } }
    ]
  }
}
```

更多细节见 [`docs/BLOCK_DSL.md`](docs/BLOCK_DSL.md)。

## 扩展积木

在积木面板的 **OpenBlocks** 分类中：

- `打开 AI 助手面板`
- `打开 AI 设置`
- `问 AI [PROMPT]`（reporter，等待 AI 返回最终文本）
- `让 AI 构建 [PROMPT]`（command，等待 AI 完成修改）
- `撤销最近的 AI 修改`
- `当前 AI 模型`
- `AI 正在工作？`

## 项目结构

```text
src/
  main.js             扩展注册和积木入口
  app.js              App 单例、设置和面板装配
  agent/
    agent.js          Agent 循环、事件、会话
    llm.js            OpenAI 兼容客户端、SSE 流式解析
    mock.js           本地演示模式
    prompt.js         系统提示词
    tools.js          工具定义和执行器
  vm/
    api.js            VM 桥接：角色、变量、造型、快照、导出
    builder.js        积木 DSL 编译器和块级编辑
    catalog.js        核心积木目录
    describe.js       脚本可读化/块 id 导出
    runtime.js        运行时状态、条件等待、舞台截图
    search.js         项目搜索和引用分析
    parts.js          变量/造型/声音重命名、删除、重排
    checkpoints.js    IndexedDB 持久化检查点
  ui/
    panel.js          侧栏 UI、设置、确认框、事件
    markdown.js       Markdown 渲染
    icons.js          SVG 图标
  styles.css          侧栏样式
build.mjs             esbuild 打包
serve.mjs             localhost:8000 静态服务器
dev.mjs               watch + serve
```

打包产物：`dist/ai-agent.js`（以及 sourcemap）。

## 安全说明

- 扩展以**非沙箱**方式运行，拥有与编辑器页面相同的权限。只加载你信任的扩展代码。
- API Key 保存在本机浏览器；使用公共电脑时不要勾选“记住 API Key”。
- AI 可能修改或删除作品内容。默认开启“破坏性操作前询问”；重要作品请先保存或导出。
- 每次 AI 修改前会保存内存快照，但刷新页面后快照丢失。
- 建议在 AI 修改后检查积木和运行结果，再保存作品。

## 限制

- 需要模型支持 tools / function calling。
- 浏览器 CORS 可能导致部分服务商无法直连。
- 自定义积木（procedures）和复杂 mutation 支持有限；AI 可通过 `mutation` 字段传入原始结构，但建议优先使用普通脚本。
- 暂不支持添加/导入声音、声音编辑、造型编辑器操作（裁剪/缩放/翻转/滤镜）、积木注释、变量/列表监视器定位。
- 截图会显示在侧栏，但默认不会作为图片输入发给语言模型；需要视觉模型直接“看”截图的能力尚未接入。
- 没有修改前 diff/apply-reject 流程；修改会立即落地，可依赖撤销/重做和检查点回滚。
- 没有多智能体/并行子任务、MCP/插件市场、云端协作、多会话管理和主题/i18n。
- 自定义积木仍以原始 `mutation` 透传为主，没有专门的高层自定义积木创建工具。
- 大型项目的脚本树会被截断；AI 可以按角色分批读取。
- 内存快照在刷新后丢失，但写入 IndexedDB 的检查点会保留最近 10 个。
- 流式工具调用的兼容性取决于服务商；如果流式模式异常，可在设置中关闭“流式输出”。

## License

MIT
