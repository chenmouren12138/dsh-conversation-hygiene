/**
 * Client half of @local/dsh-conversation-hygiene.
 *
 * One session-lifecycle surface:
 * - the existing session "more" menu gains a DSH-style destructive
 *   "移入回收站" item (the rest of that menu is untouched);
 * - an icon-only trash entry sits at the right edge of the sidebar content,
 *   aligned with the top "新会话" button and separated from the account row;
 * - the centered trash dialog lists tombstones only, reveals checkboxes on
 *   row hover, and restores the selected set or moves it to the system recycle
 *   bin.
 *
 * The dialog renders in `shell.overlay`, the host's own frame-wide layer.
 * It reuses the host's theme tokens, DSH MenuItemButton geometry, and the exact
 * DSH trash icon path. No chat DOM is inspected or modified.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-conversation-hygiene',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-conversation-hygiene'
    const BASE = '/dsh-conversation-hygiene'

    const ZH = {
      'meta.title': 'dsh-conversation-hygiene',
      'meta.description': 'DSH 会话回收站：软删除会话并保留原工作区信息，支持勾选单条/批量恢复到原工作区，以及删除或清空回收站。',
      'footer.trash': '回收站',
      'footer.trashAria': '打开会话回收站',
      'menu.moveToTrash': '移入回收站',
      'menu.moveToTrashHint': '写墓碑并从列表隐藏，可从回收站恢复',
      'common.close': '关闭',
      'common.cancel': '取消',
      'common.confirm': '确认',
      'common.loading': '正在读取…',
      'common.failed': '操作失败',
      'common.selectAll': '全选',
      'common.clearSelection': '取消全选',
      'toast.moved': '已移入回收站：{title}',
      'toast.restored': '已恢复 {count} 个会话到原工作区',
      'toast.purged': '已删除 {count} 个会话',
      'toast.purgedAll': '已清空回收站，共 {count} 个会话',
      'toast.restorePartial': '已恢复 {count} 个，失败 {failed} 个',
      'toast.purgePartial': '已删除 {count} 个，失败 {failed} 个',
      'trash.title': '回收站',
      'trash.subtitle': '已删除的会话，悬浮勾选后可恢复或删除。',
      'trash.empty': '回收站是空的',
      'trash.emptyHint': '从左侧会话的“⋯”菜单选择“移入回收站”。',
      'trash.workspace': '原工作区',
      'trash.status.active': '可恢复',
      'trash.status.restoring': '恢复中断，待重试',
      'trash.status.missing': '产物缺失',
      'trash.count': '共 {count} 个会话',
      'trash.selected': '已选 {count} 个',
      'trash.purgeAll': '清空回收站',
      'trash.restore': '恢复',
      'trash.delete': '删除',
      'trash.confirmPurgeMany.title': '删除所选会话？',
      'trash.confirmPurgeOne.title': '删除这个会话？',
      'trash.confirmPurgeAll.title': '清空回收站？',
      'trash.confirmPurgeAll.desc': '将删除回收站中的 {count} 个会话及其产物。',
      'trash.asymmetryWarning': '清空后 DSH 内无法逐条恢复；请先确认是否需要恢复。',
      'error.session_live': '会话仍有进行中的回合，请先停止任务后再移入回收站。',
      'error.session_not_found': '找不到该会话。',
      'error.workspace_unknown': '该会话不属于任何工作区，无法记录原工作区。',
      'error.payload_missing': '找不到会话的物理存储目录。',
      'error.payload_conflict': '回收站中已存在同 ID 的会话目录。',
      'error.payload_move_failed': '移动会话目录失败。',
      'error.tombstone_write_failed': '写入墓碑记录失败。',
      'error.workspace_missing': '原工作区已被删除，无法恢复；不会自动降级到默认工作区。',
      'error.workspace_path_missing': '原工作区目录已不存在，无法恢复；不会自动降级到默认工作区。',
      'error.workspace_not_writable': '原工作区当前不可写。',
      'error.target_conflict': '原位置已存在同 ID 会话，恢复被拒绝。',
      'error.restore_failed': '恢复失败，墓碑仍保留在回收站。',
      'error.purge_failed': '删除失败，未移除墓碑。',
      'error.batch_limit_exceeded': '超过单次批量上限。',
      'error.duplicate_selection': '选择中包含重复项。',
      'error.empty_selection': '请至少选择一项。',
      'error.confirmation_required': '需要二次确认。',
      'error.count_mismatch': '回收站数量已变化，请刷新后重新确认。',
      'error.domain_disabled': '该能力已在插件配置中关闭。',
      'error.invalid_request': '请求参数不完整。',
      'error.invalid_session_id': '缺少会话标识。',
      'error.invalid_body': '请求体格式不正确。',
      'error.body_too_large': '请求体过大。',
      'error.invalid_json': '请求体不是合法 JSON。',
      'error.method_not_allowed': '请求方法不被支持。',
      'error.forbidden': '该接口只接受本机同源请求。',
      'error.internal_error': '插件内部错误。',
      'error.timeout': '请求超时。',
      'error.network': '无法连接到会话卫生服务。',
    }

    const EN = {
      'meta.title': 'dsh-conversation-hygiene',
      'meta.description': 'DSH session trash: soft-delete sessions with their original workspace, restore one or many to that workspace, and delete or empty the trash.',
      'footer.trash': 'Trash',
      'footer.trashAria': 'Open the session trash',
      'menu.moveToTrash': 'Move to trash',
      'menu.moveToTrashHint': 'Write a tombstone and hide it; restorable from trash',
      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.loading': 'Loading…',
      'common.failed': 'The operation failed',
      'common.selectAll': 'Select all',
      'common.clearSelection': 'Clear selection',
      'toast.moved': 'Moved to trash: {title}',
      'toast.restored': 'Restored {count} sessions to their original workspaces',
      'toast.purged': 'Deleted {count} sessions',
      'toast.purgedAll': 'Trash emptied: {count} sessions deleted',
      'toast.restorePartial': 'Restored {count}; {failed} failed',
      'toast.purgePartial': 'Deleted {count}; {failed} failed',
      'trash.title': 'Trash',
      'trash.subtitle': 'Deleted sessions. Hover to select, then restore or delete.',
      'trash.empty': 'The trash is empty',
      'trash.emptyHint': 'Choose “Move to trash” from a session’s “⋯” menu.',
      'trash.workspace': 'Original workspace',
      'trash.status.active': 'Restorable',
      'trash.status.restoring': 'Interrupted restore, retry',
      'trash.status.missing': 'Payload missing',
      'trash.count': '{count} sessions',
      'trash.selected': '{count} selected',
      'trash.purgeAll': 'Empty trash',
      'trash.restore': 'Restore',
      'trash.delete': 'Delete',
      'trash.confirmPurgeMany.title': 'Delete the selected sessions?',
      'trash.confirmPurgeOne.title': 'Delete this session?',
      'trash.confirmPurgeAll.title': 'Empty the trash?',
      'trash.confirmPurgeAll.desc': 'All {count} sessions and their payloads will be deleted.',
      'trash.asymmetryWarning': 'After emptying, DSH cannot restore individual sessions. Confirm any restores first.',
      'error.session_live': 'The session still has a running Turn. Stop it before moving the session to trash.',
      'error.session_not_found': 'The session was not found.',
      'error.workspace_unknown': 'The session is not owned by a workspace, so its origin cannot be recorded.',
      'error.payload_missing': 'The physical session directory was not found.',
      'error.payload_conflict': 'A session directory with this id already exists in trash.',
      'error.payload_move_failed': 'Moving the session directory failed.',
      'error.tombstone_write_failed': 'Writing the tombstone failed.',
      'error.workspace_missing': 'The original workspace was deleted; restore is refused and never falls back to the default workspace.',
      'error.workspace_path_missing': 'The original workspace directory no longer exists; restore is refused.',
      'error.workspace_not_writable': 'The original workspace is not writable.',
      'error.target_conflict': 'A session with this id already exists at the original location; restore was refused.',
      'error.restore_failed': 'Restore failed; the tombstone remains in trash.',
      'error.purge_failed': 'Deletion failed; the tombstone was kept.',
      'error.batch_limit_exceeded': 'The batch limit was exceeded.',
      'error.duplicate_selection': 'The selection contains duplicates.',
      'error.empty_selection': 'Select at least one item.',
      'error.confirmation_required': 'A second confirmation is required.',
      'error.count_mismatch': 'The trash changed after confirmation; refresh and confirm again.',
      'error.domain_disabled': 'This capability is disabled in the plugin config.',
      'error.invalid_request': 'The request is incomplete.',
      'error.invalid_session_id': 'The session id is missing.',
      'error.invalid_body': 'The request body has an invalid shape.',
      'error.body_too_large': 'The request body is too large.',
      'error.invalid_json': 'The request body is not valid JSON.',
      'error.method_not_allowed': 'The request method is not supported.',
      'error.forbidden': 'This endpoint accepts only local same-origin requests.',
      'error.internal_error': 'Internal plugin error.',
      'error.timeout': 'The request timed out.',
      'error.network': 'Cannot reach the conversation-hygiene service.',
    }

    const CSS = `
.chg-footerWrap{position:relative;width:100%;height:0;display:flex;justify-content:flex-end;pointer-events:none}
.chg-footer{position:absolute;right:2px;top:14px;z-index:20;width:28px;height:28px;box-sizing:border-box;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;align-items:center;justify-content:center;padding:0;display:inline-flex;pointer-events:auto}
.chg-footer:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
.chg-footer:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.chg-footer[data-rail="true"]{position:fixed;left:12px;right:auto;top:auto;bottom:12px;width:28px;height:28px}
/* The account row keeps its own padding and avatar/label rhythm; only its
   right edge is pulled in enough to leave a gap before the trash icon. */
html:has(.chg-footer:not([data-rail="true"])) [class*="_5Qcc8a_trigger"]{width:calc(100% - 52px) !important}
.chg-footer::after{content:attr(data-tooltip);position:absolute;right:0;bottom:calc(100% + 7px);z-index:30;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .12s ease,transform .12s ease;padding:4px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px;box-shadow:0 8px 24px rgba(0,0,0,.26)}
.chg-footer:hover::after,.chg-footer:focus-visible::after{opacity:1;transform:none}
.chg-menuItemWrap{position:relative}
.chg-menuItem{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left}
.chg-menuItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.chg-menuItem:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);outline:none}
.chg-menuItem[data-danger="true"],.chg-menuItem[data-danger="true"] .chg-menuItemIcon{color:var(--dsw-alias-state-error-primary)}
.chg-menuItem[data-danger="true"]:hover:not(:disabled),.chg-menuItem[data-danger="true"]:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.chg-menuItemIcon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.chg-menuItemIcon svg{width:14px;height:14px}
.chg-menuItemLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chg-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;pointer-events:auto;animation:chg-fade .14s ease-out}
.chg-overlay::before{content:"";position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);-webkit-backdrop-filter:var(--dsw-mask-blur);pointer-events:none}
.chg-dialog{position:relative;z-index:1;width:800px;height:min(800px,calc(100vh - 2 * max(24px,var(--dsh-frame-overlay-top,24px))));max-width:calc(100vw - 48px);display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:none;border-radius:var(--dsw-radius-panel);box-shadow:var(--dsw-elevation-prominent);overflow:hidden;animation:chg-rise .16s ease-out}
.chg-dialog[data-size="confirm"]{width:min(440px,100%);height:auto;max-height:calc(100vh - 48px);gap:20px;padding:0 0 24px}
.chg-dialog[data-size="confirm"] .chg-head{padding:22px 14px 12px 24px;border-bottom:0;align-items:center}
.chg-dialog[data-size="confirm"] .chg-title{font-size:16px;line-height:24px;font-weight:500}
.chg-dialog[data-size="confirm"] .chg-close{width:28px;height:28px}
.chg-dialog[data-size="confirm"] .chg-body{padding:0 24px;margin-top:20px}
.chg-dialog[data-size="confirm"] .chg-body:empty{display:none}
.chg-dialog[data-size="confirm"] .chg-foot{padding:0 24px;border-top:0;justify-content:flex-end;gap:8px}
.chg-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.chg-headMain{flex:1;min-width:0}
.chg-title{font-size:16px;line-height:24px;font-weight:650;letter-spacing:.01em;margin:0}
.chg-subtitle{font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);margin:4px 0 0;max-width:62ch}
.chg-close{flex:none;margin-left:auto;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.chg-close:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent));color:var(--dsw-alias-label-primary)}
.chg-close:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.chg-body{padding:14px 20px 18px;overflow-y:auto;min-height:0;flex:1;display:flex;flex-direction:column;gap:12px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.chg-foot{position:relative;display:flex;align-items:center;gap:8px;padding:12px 20px;border-top:1px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.chg-footLeft{display:flex;align-items:center;gap:8px;white-space:nowrap}
.chg-footLeft .chg-rowMeta{line-height:28px}
.chg-footActions{display:flex;align-items:center;gap:8px}
.chg-footRight{margin-left:auto}
.chg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--dsw-radius-sm);border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.chg-btn:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
.chg-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.chg-btn[disabled]{opacity:.4;cursor:not-allowed}
.chg-btn[data-variant="dangerSoft"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary)}
.chg-btn[data-variant="dangerSoft"]:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 24%,var(--dsw-alias-bg-layer-1))}
.chg-btn[data-variant="ghost"]{color:var(--dsw-alias-label-secondary);padding:0 8px}
.chg-btn[data-variant="ghost"]:hover{color:var(--dsw-alias-label-primary)}
.chg-btn[data-variant="dangerGhost"]{color:var(--dsw-alias-state-error-primary);padding:0 8px}
.chg-btn[data-variant="dangerGhost"]:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.chg-spacer{flex:1}
.chg-banner{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:19px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary)}
.chg-banner[data-kind="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 46%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,var(--dsw-alias-bg-layer-1))}
.chg-banner[data-kind="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 46%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
.chg-empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:44px 16px;text-align:center;color:var(--dsw-alias-label-secondary)}
.chg-emptyTitle{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);font-weight:600}
.chg-emptyHint{font-size:12.5px;line-height:19px;max-width:44ch}
.chg-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.chg-trashRow{display:flex;align-items:flex-start;gap:11px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;content-visibility:auto;contain-intrinsic-size:auto 72px}
.chg-trashRow:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 5%,transparent))}
.chg-trashRow[data-selected="true"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1))}
.chg-check{flex:none;width:15px;height:15px;margin-top:3px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;opacity:0;transition:opacity .12s ease}
.chg-trashRow:hover .chg-check,.chg-trashRow:focus-within .chg-check,.chg-trashRow[data-selected="true"] .chg-check{opacity:1}
.chg-rowMain{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.chg-rowTop{display:flex;align-items:flex-start;gap:10px;min-width:0}
.chg-rowTitle{flex:1;min-width:0;font-size:13.5px;line-height:21px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chg-rowBadges{flex:none;display:flex;align-items:center;gap:4px;margin-left:auto}
.chg-rowTag{flex:none}
.chg-rowWorkspace{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chg-rowMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.chg-rowPreview{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.chg-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.chg-chip[data-tone="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-warn-primary)}
.chg-chip[data-tone="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-error-primary)}
.chg-chip[data-tone="ok"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 42%,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-success-primary)}
.chg-summary{display:flex;align-items:center;gap:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:7px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.chg-summary .chg-btn{padding:0 8px}
.chg-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2400;display:flex;align-items:center;gap:8px;max-width:min(680px,calc(100vw - 32px));padding:9px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:19px;box-shadow:0 16px 44px rgba(0,0,0,.32);pointer-events:auto;animation:chg-toastIn .16s ease-out}
.chg-toast[data-kind="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 48%,var(--dsw-alias-border-l1))}
.chg-toast[data-kind="success"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 42%,var(--dsw-alias-border-l1))}
.chg-toastDot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-brand-primary)}
.chg-toast[data-kind="error"] .chg-toastDot{background:var(--dsw-alias-state-error-primary)}
.chg-toast[data-kind="success"] .chg-toastDot{background:var(--dsw-alias-state-success-primary)}
.chg-visuallyHidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@keyframes chg-fade{from{opacity:0}to{opacity:1}}
@keyframes chg-rise{from{opacity:0;transform:translateY(7px) scale(.99)}to{opacity:1;transform:none}}
@keyframes chg-toastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media (hover:none){.chg-check{opacity:1}}
@media (max-width:640px){.chg-head,.chg-body,.chg-foot{padding-left:14px;padding-right:14px}}
@media (prefers-reduced-motion:reduce){.chg-overlay,.chg-dialog,.chg-toast,.chg-check{animation:none;transition:none}}
`

    /* ---------------------------------- store --------------------------------- */

    function createStore() {
      let value = {
        capabilities: null,
        trash: null,
        trashOpen: false,
        toast: null,
      }
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        set(patch) {
          value = { ...value, ...patch }
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    }

    /* ----------------------------------- api ---------------------------------- */

    async function request(path, options = {}) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      try {
        const response = await fetch(`${BASE}${path}`, {
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        let payload = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }
        if (!response.ok || payload?.ok !== true) {
          const error = new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          error.code = payload?.error?.code ?? 'network'
          error.details = payload?.error?.details
          error.status = response.status
          throw error
        }
        return payload.data
      } catch (error) {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error('request timed out')
          timeoutError.code = 'timeout'
          throw timeoutError
        }
        if (error?.code === undefined) error.code = 'network'
        throw error
      } finally {
        clearTimeout(timeout)
      }
    }

    function localizeError(error, t) {
      const key = `error.${error?.code ?? 'internal_error'}`
      const text = typeof t === 'function' ? t(key) : key
      if (typeof text === 'string' && text !== key) return text
      return error?.message || (typeof t === 'function' ? t('common.failed') : 'failed')
    }

    function messageFor(error, t) {
      return localizeError(error, t)
    }

    function applyState(store, data) {
      if (data?.state !== undefined) {
        store.set({
          capabilities: data.state.capabilities,
          trash: data.state.trash,
        })
        return
      }
      if (data?.capabilities !== undefined) {
        store.set({ capabilities: data.capabilities, trash: data.trash })
      }
    }

    async function refreshState(store) {
      try {
        const data = await request('/state')
        store.set({ capabilities: data.capabilities, trash: data.trash })
      } catch {
        // Keep the last known list; an open dialog reports its own errors.
      }
    }

    function notify(store, kind, text) {
      store.set({ toast: { id: `${Date.now()}-${Math.random()}`, kind, text } })
    }

    function openTrash(store) {
      store.set({ trashOpen: true })
      void refreshState(store)
    }

    /* ---------------------------------- icons --------------------------------- */

    function Svg({ children, size = 16, className, strokeWidth = 1 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false',
        strokeWidth,
        className,
      }, children)
    }

    function TrashIcon({ size = 16 }) {
      return h(Svg, { size },
        h('path', { d: 'M1.28149 3.88831H14.7187', stroke: 'currentColor' }),
        h('path', { d: 'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833', stroke: 'currentColor' }),
        h('path', { d: 'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831', stroke: 'currentColor' }),
        h('path', { d: 'M6.44946 6.98926V11.1238', stroke: 'currentColor' }),
        h('path', { d: 'M9.55054 6.98926V11.1238', stroke: 'currentColor' }))
    }

    function CloseIcon() {
      return h(Svg, { size: 15 },
        h('path', {
          d: 'm4 4 8 8M12 4l-8 8',
          stroke: 'currentColor',
          strokeWidth: 1.45,
          strokeLinecap: 'round',
        }))
    }

    /* --------------------------------- dialogs -------------------------------- */

    function focusableWithin(root) {
      if (!root) return []
      const nodes = root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')
      return [...nodes].filter((node) => node instanceof HTMLElement && node.getClientRects().length > 0)
    }

    function Dialog({ title, subtitle, children, footer, onClose, busy = false, size = 'default', level = 0, t }) {
      const rootRef = React.useRef(null)
      const titleId = React.useId()
      const subtitleId = React.useId()
      const onCloseRef = React.useRef(onClose)
      const busyRef = React.useRef(busy)
      onCloseRef.current = onClose
      busyRef.current = busy

      React.useEffect(() => {
        const previous = document.activeElement
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const root = rootRef.current
        const first = focusableWithin(root)[0]
        if (first) first.focus()
        else root?.focus()
        const onKeyDown = (event) => {
          if (!root || !root.contains(event.target)) return
          if (event.key === 'Escape' && !busyRef.current) {
            event.preventDefault()
            event.stopPropagation()
            onCloseRef.current?.()
            return
          }
          if (event.key !== 'Tab') return
          const nodes = focusableWithin(root)
          if (nodes.length === 0) {
            event.preventDefault()
            root?.focus()
            return
          }
          const current = document.activeElement
          const index = nodes.indexOf(current)
          if (event.shiftKey && (index <= 0 || current === root)) {
            event.preventDefault()
            nodes[nodes.length - 1].focus()
          } else if (!event.shiftKey && (index === -1 || index === nodes.length - 1)) {
            event.preventDefault()
            nodes[0].focus()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          document.body.style.overflow = previousOverflow
          if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
        }
      }, [])

      return h('div', {
        className: 'chg-overlay',
        style: { zIndex: 1000 + level },
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !busy) onClose?.()
        },
      },
      h('div', {
        ref: rootRef,
        className: 'chg-dialog',
        'data-size': size,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        'aria-describedby': subtitle ? subtitleId : undefined,
        tabIndex: -1,
      },
      h('header', { className: 'chg-head' },
        h('div', { className: 'chg-headMain' },
          h('h2', { className: 'chg-title', id: titleId }, title),
          subtitle ? h('p', { className: 'chg-subtitle', id: subtitleId }, subtitle) : null),
        h('button', {
          type: 'button',
          className: 'chg-close',
          'aria-label': t('common.close'),
          onClick: onClose,
          disabled: busy,
        }, h(CloseIcon))),
      h('div', { className: 'chg-body' }, children),
      footer ? h('footer', { className: 'chg-foot' }, footer) : null))
    }

    function ConfirmDialog({ title, description, warning, confirmLabel, busy = false, error, onConfirm, onClose, t }) {
      return h(Dialog, {
        title,
        subtitle: description,
        onClose,
        busy,
        size: 'confirm',
        level: 2,
        t,
        footer: [
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'chg-btn',
            onClick: onClose,
            disabled: busy,
          }, t('common.cancel')),
          h('button', {
            key: 'confirm',
            type: 'button',
            className: 'chg-btn',
            'data-variant': 'dangerSoft',
            onClick: onConfirm,
            disabled: busy,
          }, busy ? t('common.loading') : (confirmLabel ?? t('common.confirm'))),
        ],
      },
      warning ? h('div', { className: 'chg-banner', 'data-kind': 'warn' }, warning) : null,
      error ? h('div', { className: 'chg-banner', 'data-kind': 'error', role: 'alert' }, error) : null)
    }

    function Toast({ toast, onDone }) {
      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(onDone, toast.kind === 'error' ? 7000 : 4200)
        return () => clearTimeout(timer)
      }, [toast?.id])
      if (!toast) return null
      return h('div', {
        className: 'chg-toast',
        'data-kind': toast.kind,
        role: toast.kind === 'error' ? 'alert' : 'status',
        'aria-live': toast.kind === 'error' ? 'assertive' : 'polite',
      }, h('span', { className: 'chg-toastDot', 'aria-hidden': 'true' }), h('span', null, toast.text))
    }

    /* ------------------------------ sidebar foot ------------------------------ */

    function TrashFooterAction({ wide, t, store }) {
      const state = useStore(store)
      const enabled = state.capabilities?.sessionLifecycle !== false
      React.useEffect(() => {
        void refreshState(store)
      }, [])
      if (!enabled) return null
      return h('div', { className: 'chg-footerWrap' },
        h('button', {
          type: 'button',
          className: 'chg-footer',
          'data-rail': wide ? undefined : 'true',
          'data-tooltip': t('footer.trash'),
          'aria-label': t('footer.trashAria'),
          'aria-haspopup': 'dialog',
          'aria-expanded': state.trashOpen,
          onClick: () => openTrash(store),
        }, h(TrashIcon, { size: 16 })))
    }

    /* ----------------------------- session menu ------------------------------- */

    function MoveToTrashMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, t, store } = props
      const state = useStore(store)
      const setMenuOpen = typeof useMenuOpenState === 'function' ? useMenuOpenState()[1] : () => {}
      if (state.capabilities?.sessionLifecycle === false) return null
      return h('div', { className: 'chg-menuItemWrap' },
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'chg-menuItem',
          'data-danger': 'true',
          title: t('menu.moveToTrashHint'),
          onClick: async () => {
            setMenuOpen(false)
            try {
              const data = await request('/trash/delete', {
                method: 'POST',
                body: { sessionId },
              })
              applyState(store, data)
              notify(store, 'success', t('toast.moved', { title: displayTitle || sessionId }))
            } catch (error) {
              notify(store, 'error', messageFor(error, t))
            }
          },
        },
        h('span', { className: 'chg-menuItemIcon' }, h(TrashIcon, { size: 14 })),
        h('span', { className: 'chg-menuItemLabel' }, t('menu.moveToTrash'))))
    }

    /* -------------------------------- trash modal ----------------------------- */

    function TrashRow({ item, selected, onToggle, t }) {
      const statusTone = item.status === 'missing' ? 'error' : item.status === 'restoring' ? 'warn' : 'ok'
      return h('li', null,
        h('div', {
          className: 'chg-trashRow',
          'data-selected': selected ? 'true' : undefined,
          onClick: () => onToggle(item),
        },
        h('input', {
          type: 'checkbox',
          className: 'chg-check',
          checked: selected,
          onClick: (event) => event.stopPropagation(),
          onChange: () => onToggle(item),
        }),
        h('span', { className: 'chg-rowMain' },
          h('span', { className: 'chg-rowTop' },
            h('span', { className: 'chg-rowTitle', title: item.title }, item.title || item.sessionId),
            h('span', { className: 'chg-rowBadges' },
              h('span', { className: 'chg-chip chg-rowTag', 'data-tone': statusTone }, t(`trash.status.${item.status}`)))),
          h('span', { className: 'chg-rowWorkspace' },
            `${t('trash.workspace')}：${item.originalWorkspaceTitle || item.originalWorkspaceId}`),
          item.preview ? h('span', { className: 'chg-rowPreview' }, item.preview) : null)))
    }

    function TrashModal({ store, onClose, t }) {
      const state = useStore(store)
      const trash = state.trash
      const [selected, setSelected] = React.useState(() => new Set())
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [confirm, setConfirm] = React.useState(null)
      const [loading, setLoading] = React.useState(!trash)

      const reload = React.useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const data = await request('/state')
          applyState(store, data)
        } catch (reason) {
          setError(messageFor(reason, t))
        } finally {
          setLoading(false)
        }
      }, [store, t])

      React.useEffect(() => {
        void reload()
      }, [reload])

      const items = React.useMemo(() => trash?.items ?? [], [trash])
      const selectedItems = items.filter((item) => selected.has(item.sessionId))
      const allSelected = items.length > 0 && selectedItems.length === items.length

      React.useEffect(() => {
        setSelected((current) => new Set([...current].filter((id) => items.some((item) => item.sessionId === id))))
      }, [items])

      const toggle = (item) => {
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(item.sessionId)) next.delete(item.sessionId)
          else next.add(item.sessionId)
          return next
        })
      }

      const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(items.map((item) => item.sessionId)))
      }

      const restoreSelected = async (sessionIds) => {
        setBusy(true)
        setError('')
        try {
          const data = await request('/trash/restore', {
            method: 'POST',
            body: { sessionIds },
          })
          applyState(store, data)
          setSelected(new Set())
          if (data.failed > 0) {
            notify(store, 'error', t('toast.restorePartial', { count: data.restored, failed: data.failed }))
          } else {
            notify(store, 'success', t('toast.restored', { count: data.restored }))
          }
        } catch (reason) {
          setError(messageFor(reason, t))
        } finally {
          setBusy(false)
        }
      }

      const purgeSelected = async (sessionIds) => {
        setBusy(true)
        setError('')
        try {
          const data = await request('/trash/purge', {
            method: 'POST',
            body: { sessionIds, confirm: true },
          })
          applyState(store, data)
          setSelected(new Set())
          setConfirm(null)
          if (data.failed?.length > 0) {
            notify(store, 'error', t('toast.purgePartial', { count: data.count, failed: data.failed.length }))
          } else {
            notify(store, 'success', t('toast.purged', { count: data.count }))
          }
        } catch (reason) {
          setError(messageFor(reason, t))
        } finally {
          setBusy(false)
        }
      }

      const purgeAll = async () => {
        setBusy(true)
        setError('')
        try {
          const data = await request('/trash/purge-all', {
            method: 'POST',
            body: { confirm: true, expectedCount: trash?.count ?? 0 },
          })
          applyState(store, data)
          setSelected(new Set())
          setConfirm(null)
          if (data.failed?.length > 0) {
            notify(store, 'error', t('toast.purgePartial', { count: data.count, failed: data.failed.length }))
          } else {
            notify(store, 'success', t('toast.purgedAll', { count: data.count }))
          }
        } catch (reason) {
          setError(messageFor(reason, t))
        } finally {
          setBusy(false)
        }
      }

      const selectedIds = selectedItems.map((item) => item.sessionId)
      const selectedOne = selectedItems.length === 1 ? selectedItems[0] : null
      const limit = state.capabilities?.batchLimit ?? 20

      const dialog = h(Dialog, {
        title: t('trash.title'),
        subtitle: t('trash.subtitle'),
        onClose,
        busy,
        t,
        footer: [
          h('div', { key: 'left', className: 'chg-footLeft' },
            h('button', {
              type: 'button',
              className: 'chg-btn',
              'data-variant': 'ghost',
              disabled: busy || items.length === 0,
              onClick: toggleAll,
            }, allSelected ? t('common.clearSelection') : t('common.selectAll')),
            h('span', { className: 'chg-rowMeta' }, t('trash.selected', { count: selectedItems.length }))),
          h('div', { key: 'actions', className: 'chg-footActions chg-footRight' },
            h('button', {
              type: 'button',
              className: 'chg-btn',
              disabled: busy || selectedItems.length === 0 || selectedItems.length > limit,
              onClick: () => restoreSelected(selectedIds),
            }, t('trash.restore')),
            h('button', {
              type: 'button',
              className: 'chg-btn',
              'data-variant': 'dangerSoft',
              disabled: busy || selectedItems.length === 0 || selectedItems.length > limit,
              onClick: () => setConfirm({ kind: 'purge-ids', ids: selectedIds, one: selectedOne }),
            }, t('trash.delete'))),
        ],
      },
      error ? h('div', { className: 'chg-banner', 'data-kind': 'error', role: 'alert' }, error) : null,
      h('div', { className: 'chg-summary' },
        h('span', null, t('trash.count', { count: trash?.count ?? 0 })),
        h('span', { className: 'chg-spacer' }),
        h('button', {
          type: 'button',
          className: 'chg-btn',
          'data-variant': 'dangerGhost',
          disabled: busy || items.length === 0,
          onClick: () => setConfirm({ kind: 'purge-all' }),
        }, t('trash.purgeAll'))),
      loading && items.length === 0 ? h('div', { className: 'chg-empty' }, t('common.loading')) : null,
      !loading && items.length === 0
        ? h('div', { className: 'chg-empty' },
          h('div', { className: 'chg-emptyTitle' }, t('trash.empty')),
          h('div', { className: 'chg-emptyHint' }, t('trash.emptyHint')))
        : h('ul', { className: 'chg-list' }, items.map((item) => h(TrashRow, {
          key: item.sessionId,
          item,
          selected: selected.has(item.sessionId),
          onToggle: toggle,
          t,
        }))))

      return h(React.Fragment, null,
        dialog,
        confirm?.kind === 'purge-all' ? h(ConfirmDialog, {
          title: t('trash.confirmPurgeAll.title'),
          description: t('trash.confirmPurgeAll.desc', { count: trash?.count ?? 0 }),
          warning: t('trash.asymmetryWarning'),
          confirmLabel: t('trash.purgeAll'),
          busy,
          error,
          onConfirm: purgeAll,
          onClose: () => {
            if (!busy) setConfirm(null)
          },
          t,
        }) : null,
        confirm?.kind === 'purge-ids' ? h(ConfirmDialog, {
          title: confirm.one
            ? t('trash.confirmPurgeOne.title')
            : t('trash.confirmPurgeMany.title'),
          confirmLabel: t('trash.delete'),
          busy,
          error,
          onConfirm: () => purgeSelected(confirm.ids),
          onClose: () => {
            if (!busy) setConfirm(null)
          },
          t,
        }) : null)
    }

    /* -------------------------------- overlay host ---------------------------- */

    function OverlayHost({ store, t }) {
      const state = useStore(store)
      return h(React.Fragment, null,
        state.trashOpen ? h(TrashModal, { store, t, onClose: () => store.set({ trashOpen: false }) }) : null,
        h(Toast, {
          toast: state.toast,
          onDone: () => {
            if (store.getSnapshot().toast?.id === state.toast?.id) store.set({ toast: null })
          },
        }))
    }

    /* ---------------------------------- styles -------------------------------- */

    function installStyles(ctx, css) {
      const styles = ctx.get('styles')
      if (styles && typeof styles.insert === 'function') return styles.insert(css)
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-conversation-hygiene'
      tag.dataset.pluginCss = '@local/dsh-conversation-hygiene/hygiene.css'
      tag.textContent = css
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const store = createStore()

        ctx.effect(() => installStyles(ctx, CSS), 'dsh-conversation-hygiene: styles')
        ctx.effect(
          () => ctx.locale.register(NS, { zh: ZH, en: EN }),
          'dsh-conversation-hygiene: dictionaries',
        )
        ctx.effect(() => {
          void refreshState(store)
          return undefined
        }, 'dsh-conversation-hygiene: initial state')
        ctx.effect(() => {
          const timer = setInterval(() => {
            void refreshState(store)
          }, 30000)
          return () => clearInterval(timer)
        }, 'dsh-conversation-hygiene: state refresh')

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'conversation-hygiene-trash',
          order: 120,
          locale: NS,
        }, (props) => h(TrashFooterAction, { ...props, store })))

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'conversation-hygiene-trash',
          order: 500,
          locale: NS,
        }, (props) => h(MoveToTrashMenuItem, { ...props, store })))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'conversation-hygiene-dialogs',
          order: 40,
          locale: NS,
        }, (props) => h(OverlayHost, { ...props, store })))
      },
    }
  },
})
