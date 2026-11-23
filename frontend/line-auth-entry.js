const FALLBACK_TIMEOUT_MS = 15000;
const INIT_TIMEOUT_MS = 15000;
const statusNode = document.getElementById('status');
const fallbackNode = document.getElementById('fallback');
let fallbackTimer = null;
let initTimer = null;

function showFallback() {
  if (statusNode) statusNode.textContent = 'ไม่สามารถเริ่ม LINE Login อัตโนมัติได้ กรุณากลับไปหน้าออกแบบ';
  if (fallbackNode) fallbackNode.hidden = false;
}

function returnToDesigner() {
  window.location.replace('/');
}

window.addEventListener('error', showFallback);

(async () => {
  try {
    const configResponse = await fetch('/api/liff-config', { cache: 'no-store' });
    const config = await configResponse.json().catch(() => null);
    const liffId = String(config?.liffId || '').trim();
    if (!configResponse.ok || !liffId || typeof liff === 'undefined') {
      showFallback();
      return;
    }

    await Promise.race([
      liff.init({ liffId, withLoginOnExternalBrowser: true }),
      new Promise((_resolve, reject) => {
        initTimer = window.setTimeout(() => reject(new Error('LINE init timeout')), INIT_TIMEOUT_MS);
      })
    ]);
    if (initTimer) window.clearTimeout(initTimer);
    if (liff.isLoggedIn()) {
      returnToDesigner();
      return;
    }

    // LINE navigation can be delayed by the LINE app or the mobile browser.
    // Never trap the customer on this page if the platform does not redirect.
    fallbackTimer = window.setTimeout(showFallback, FALLBACK_TIMEOUT_MS);
  } catch {
    if (initTimer) window.clearTimeout(initTimer);
    showFallback();
  }
})();

window.addEventListener('pagehide', () => {
  if (fallbackTimer) window.clearTimeout(fallbackTimer);
  if (initTimer) window.clearTimeout(initTimer);
});
