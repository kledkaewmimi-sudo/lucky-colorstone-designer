const EXPECTED_UAT_LIFF_ID = '2010525799-Sw5UFc6E';
const FALLBACK_TIMEOUT_MS = 15000;
const statusNode = document.getElementById('status');
const fallbackNode = document.getElementById('fallback');
let fallbackTimer = null;

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
    if (!configResponse.ok || liffId !== EXPECTED_UAT_LIFF_ID || typeof liff === 'undefined') {
      showFallback();
      return;
    }

    await liff.init({ liffId, withLoginOnExternalBrowser: true });
    if (liff.isLoggedIn()) {
      returnToDesigner();
      return;
    }

    // If LINE did not navigate after initialization, do not trap the customer here.
    fallbackTimer = window.setTimeout(showFallback, FALLBACK_TIMEOUT_MS);
  } catch {
    showFallback();
  }
})();

window.addEventListener('pagehide', () => {
  if (fallbackTimer) window.clearTimeout(fallbackTimer);
});
