// utils/notify.ts
export type NotifyState = 'success' | 'error';

let containerEl: HTMLElement | null = null;
let styleInjected = false;

const isClient = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function injectStyleOnce() {
  if (!isClient() || styleInjected) return;
  const style = document.createElement('style');
  style.id = 'nuxt-notify-style';
  style.textContent = `
  .nuxt-notify-container {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 9999;
    pointer-events: none;
  }
  .nuxt-notify-toast {
    pointer-events: auto;
    min-width: 240px;
    max-width: 380px;
    background: var(--notify-bg, #111827);
    color: var(--notify-fg, #F9FAFB);
    border-left: 4px solid transparent;
    border-radius: 10px;
    box-shadow: 0 10px 20px rgba(0,0,0,.2), 0 6px 6px rgba(0,0,0,.1);
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    transform: translateX(120%);
    opacity: 0;
    will-change: transform, opacity;
  }
  .nuxt-notify-toast.success { border-left-color: #10B981; }
  .nuxt-notify-toast.error   { border-left-color: #EF4444; }

  @media (prefers-color-scheme: light) {
    .nuxt-notify-toast {
      --notify-bg: #FFFFFF;
      --notify-fg: #111827;
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
    }
  }

  .nuxt-notify-toast.show {
    animation: nuxt-notify-in 240ms cubic-bezier(.2,.7,.3,1) forwards;
  }
  .nuxt-notify-toast.hide {
    animation: nuxt-notify-out 200ms cubic-bezier(.2,.7,.3,1) forwards;
  }
  @keyframes nuxt-notify-in {
    from { transform: translateX(120%); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  @keyframes nuxt-notify-out {
    from { transform: translateX(0); opacity: 1; }
    to   { transform: translateX(120%); opacity: 0; }
  }

  .nuxt-notify-icon {
    line-height: 1;
    font-size: 16px;
    margin-top: 2px;
  }
  .nuxt-notify-message {
    white-space: pre-wrap;
    line-height: 1.35;
    word-break: break-word;
    flex: 1;
  }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

function ensureContainer(): HTMLElement | null {
  if (!isClient()) return null;
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement('div');
  containerEl.className = 'nuxt-notify-container';
  document.body.appendChild(containerEl);
  return containerEl;
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m] as string));
}

/**
 * 右上角通知
 * @param message 文本内容
 * @param state 'success' | 'error'
 */
export function notify(message: string, state: NotifyState) {
  if (!isClient()) return; // SSR 安全 no-op

  injectStyleOnce();
  const root = ensureContainer();
  if (!root) return;

  const toast = document.createElement('div');
  toast.className = `nuxt-notify-toast ${state}`;
  toast.setAttribute('role', state === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');

  const icon = state === 'success' ? '✓' : '⚠️';
  toast.innerHTML = `
    <span class="nuxt-notify-icon">${icon}</span>
    <div class="nuxt-notify-message">${escapeHtml(message)}</div>
  `;

  root.appendChild(toast);

  // 触发入场动画
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // 停留时长（根据文本长度略微调整）
  const duration = Math.max(1800, Math.min(8000, 3000 + message.length * 25));

  const removeToast = () => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    toast.addEventListener(
      'animationend',
      () => {
        toast.remove();
        if (root.childElementCount === 0) {
          root.remove();
          containerEl = null;
        }
      },
      { once: true }
    );
  };

  const timer = setTimeout(removeToast, duration);

  // 点击立即关闭
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    removeToast();
  });
}