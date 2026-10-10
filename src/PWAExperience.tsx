import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CloudOff, RefreshCw, Share2, X } from 'lucide-react';
import { hasNativeRuntime } from './api';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function PWAExperience() {
  const [online, setOnline] = useState(navigator.onLine);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const reloadOnActivation = useRef(false);
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const canInstall = !installed && (Boolean(prompt) || isiOS);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstalled = () => { setInstalled(true); setPrompt(null); setShowInstructions(false); };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || hasNativeRuntime || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    const onControllerChange = () => {
      if (reloadOnActivation.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaitingWorker(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (!cancelled && worker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(worker);
          }
        });
      });
    };
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      if (cancelled) return;
      registration = reg;
      watch(reg);
      void reg.update().catch(() => {});
    }).catch(() => {/* PWA is optional if registration is blocked. */});
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      // Registration is intentionally kept across SPA unmounts.
      void registration;
    };
  }, []);

  async function install() {
    if (!prompt) {
      setShowInstructions(true);
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      if (choice.outcome === 'dismissed') setDismissed(true);
    } catch {
      setPrompt(null);
      setShowInstructions(true);
    }
  }
  function activateUpdate() {
    if (!waitingWorker) return;
    if (!window.confirm('Tải lại Quản gia để cập nhật? Hãy đảm bảo dữ liệu đã đồng bộ trước khi tiếp tục.')) return;
    reloadOnActivation.current = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  return (
    <>
      {!online && <div className="pwa-network-status" role="alert"><CloudOff size={17} />
        <span>Mất kết nối Internet. Không nhập thêm giao dịch cho đến khi mạng ổn định; thay đổi chưa đồng bộ có thể bị mất.</span>
      </div>}
      {waitingWorker && <div className="pwa-update" role="status">
        <span>Quản gia có phiên bản mới.</span>
        <button type="button" onClick={activateUpdate}><RefreshCw size={15} /> Cập nhật</button>
        <button type="button" aria-label="Đóng" onClick={() => setWaitingWorker(null)}><X size={16} /></button>
      </div>}
      {canInstall && !dismissed && !waitingWorker && <div className="pwa-install" role="region" aria-label="Cài ứng dụng">
        <span className="pwa-install-mark">✓</span>
        <span className="pwa-install-label">Quản gia trên điện thoại</span>
        <button type="button" className="pwa-install-action" onClick={() => void install()}><ArrowDownToLine size={15} /> Cài đặt</button>
        <button type="button" className="pwa-close" aria-label="Ẩn gợi ý cài đặt" onClick={() => setDismissed(true)}><X size={16} /></button>
      </div>}
      {showInstructions && <div className="pwa-guide-backdrop" onClick={() => setShowInstructions(false)}>
        <section className="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="pwa-guide-close" onClick={() => setShowInstructions(false)} aria-label="Đóng"><X size={20}/></button>
          <span className="pwa-guide-icon"><Share2 size={28}/></span>
          <h2 id="pwa-guide-title">Cài Quản gia lên màn hình chính</h2>
          <p>Trên iPhone, mở trang này bằng Safari, bấm <strong>Chia sẻ</strong> <Share2 size={14} className="pwa-inline-icon"/> rồi chọn <strong>Thêm vào Màn hình chính</strong>.</p>
          <p>Nếu bạn đang dùng Chrome trên iPhone, hãy mở trang trong Safari trước. Không cần tải từ App Store.</p>
          <button type="button" className="pwa-guide-ok" onClick={() => setShowInstructions(false)}>Đã hiểu</button>
        </section>
      </div>}
    </>
  );
}
