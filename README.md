# dsh-conversation-hygiene

DSH 会话回收站插件：软删除会话并保留原工作区信息，支持勾选单条/批量恢复到原工作区，以及删除或清空回收站。

## 使用

安装后完全重启 DSH 进程并硬刷新页面。

- 左侧会话行“⋯”菜单 → **移入回收站**：保留原菜单其余项不变；本项使用 DSH `MenuItemButton` 几何、14px 线性删除图标与红色危险色。
- 账号行上方、与顶部“新会话”按钮右边缘对齐的 **删除图标**：保留与账号行的垂直间距，不覆盖账号悬浮框；鼠标悬浮显示“回收站”，点击打开居中回收站。
- 回收站只展示已删除的会话列表：
  - 鼠标悬浮行显示勾选框；
  - 勾选后点 **恢复**；只选一条即为单条恢复，多选即批量恢复；
  - 勾选后点右下角 **删除** 可删除选中数据；
  - 支持 **全选 / 取消全选**，全选与已选数量位于底部左侧；
  - 每条记录展示原工作区；
  - **清空回收站** 位于会话数量行右侧，与会话数量水平对齐。
- **删除/清空**会把 DSH 中该会话的存储目录移入当前电脑的系统回收站（Windows 的“回收站”），不会直接永久擦除；删除后 DSH 侧不再显示该会话，也不会被重新放回原工作区。
- 工作区中的项目文件不属于单条会话记录，本插件不会自动移动它们；只处理 DSH 的会话存储目录。

恢复回到会话原来的工作区；原工作区被删除、原路径缺失或不可写时恢复失败并返回原因码，不会自动降级到默认工作区。

## 数据位置

默认使用 `DSH_HOME`：

- 墓碑库：`<DSH_HOME>/trash/tombstones.json`
- 回收站产物：`<DSH_HOME>/trash/sessions/<sessionId>/`
- 审计：`<DSH_HOME>/conversation-hygiene/audit.jsonl`

均可在 `cordis.patch.yml` 的 `Config` 中覆盖；`sessionLifecycle.enabled` 可整体关闭入口。

## 配置

```yaml
- id: dsh-conversation-hygiene
  config:
    sessionLifecycle:
      enabled: true
      batchLimit: 20
      trashRoot: ''
      sessionRoot: ''
      projectionCacheRoot: ''
    audit:
      enabled: true
      path: ''
```

空路径表示使用上表中的默认位置。

## 技术实现

- **DSH / Cordis 插件架构**：Host 端通过命名导出 `name`、`inject`、`Config`、`apply` 注册；`cordis.patch.yml` 插入一个 Host 行。
- **Host（Node.js ESM）**：使用 `node:fs/promises`、`node:path` 操作 DSH 会话目录；`workspaceRegistry` 负责归档/取消归档，`sessionPersistence` 与 `sessionQuery` 读取会话元数据与标题。
- **系统回收站**：Windows 下通过 `node:child_process` 调用 PowerShell 的 `Microsoft.VisualBasic.FileIO.FileSystem`，以 `SendToRecycleBin` 把会话目录移入系统回收站；失败时保留墓碑并返回错误。
- **同源 HTTP 桥**：Host 通过 `webServer.register` 暴露 `/dsh-conversation-hygiene/*`，仅接受回环地址与同源请求，返回 JSON，无第三方 Web 框架。
- **Client（React）**：使用 DSH 的 `window.__ModuleLoader__` 加载，`React.createElement` 手写无 JSX 组件；通过 `ctx.slots.inject` / `ctx.slots.register` 挂载到 `sidebar.footer.action`、`sidebar.workspaces.session.menu.item`、`shell.overlay`。
- **状态与样式**：插件内轻量 store + React hooks；CSS 通过 `styles.insert` 注入，使用 DSH 设计 token（圆角、表面、阴影、遮罩、危险色），无 Tailwind、无打包器。
- **持久化**：墓碑 JSON 采用临时文件 + rename 原子写入，并用 Promise 锁串行化；审计日志为 append-only JSONL。

## 开发

插件是纯 JavaScript，无构建步骤：

```powershell
node --check index.js
node --check client.js
```

安装：

```js
plugin_manager({
  action: 'install_bundle',
  target: 'D:/DSH_Harness/DSH_Plugin/dsh-conversation-hygiene',
})
```

不要同时把包加入 `dsh.profile.bundles` 与手动 `insert`，否则会双加载。
