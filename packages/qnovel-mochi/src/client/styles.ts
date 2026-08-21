export const styles = `
.qnovel-mochi-menu{position:absolute;bottom:100%;left:0;margin-bottom:10px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.2);padding:6px;min-width:150px;font-family:system-ui,-apple-system,sans-serif;z-index:1}
.qnovel-mochi-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 11px;border:none;background:none;border-radius:8px;font-size:13px;color:#333;cursor:pointer;text-align:left}
.qnovel-mochi-menu-item:hover{background:#f1f2f4}
.qnovel-mochi-menu-item-danger{color:#e5484d}
.qnovel-mochi-menu-item-danger:hover{background:#fdeaea}
.qnovel-mochi-dot{width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,.12);flex:none}
.qnovel-mochi-sep{height:1px;background:rgba(0,0,0,.08);margin:4px 6px}
.qnovel-mochi-bubble{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:14px;background:#fff;color:#333;border-radius:10px;padding:7px 13px;font-size:12px;line-height:1.4;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.16);font-family:system-ui,-apple-system,sans-serif;max-width:220px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;transition:opacity .4s ease;opacity:1}
.qnovel-mochi-bubble::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:#fff}
.qnovel-mochi-bubble.qnovel-mochi-bubble-fade{opacity:0}
.qnovel-mochi-setting{display:flex;flex-direction:column;gap:14px;padding:2px 0}
.qnovel-mochi-setting-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.qnovel-mochi-setting-label{font-size:14px}
.qnovel-mochi-toggle{position:relative;width:40px;height:22px;border-radius:11px;border:none;background:#c7cbd1;cursor:pointer;transition:background .2s;padding:0;flex:none}
.qnovel-mochi-toggle-on{background:#4c8bf5}
.qnovel-mochi-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.qnovel-mochi-toggle-on .qnovel-mochi-toggle-knob{left:20px}
.qnovel-mochi-mode{display:flex;gap:6px}
.qnovel-mochi-mode-item{padding:4px 11px;border:1px solid rgba(128,128,128,.4);border-radius:8px;background:transparent;font-size:12px;cursor:pointer;color:inherit}
.qnovel-mochi-mode-item-active{background:#4c8bf5;border-color:#4c8bf5;color:#fff}
`
