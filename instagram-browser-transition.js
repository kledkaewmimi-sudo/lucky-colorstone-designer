export const CAMPAIGN_PARAM_PATTERN = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|ref)$/i;

export function detectBrowserContext(userAgent = '') {
  const ua = String(userAgent || '');
  const isInstagram = /Instagram/i.test(ua);
  const isOtherInApp = !isInstagram && /(FBAN|FBAV|FB_IAB|Twitter|X\/)/i.test(ua);
  const isLine = /Line\/|LIFF/i.test(ua);
  const platform = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : (/Android/i.test(ua) ? 'android' : 'desktop');
  const isChrome = !isInstagram && /(Chrome|CriOS)\//i.test(ua) && !/(Edg|OPR)\//i.test(ua);
  const isSafari = !isInstagram && /Safari\//i.test(ua) && !/(Chrome|CriOS|Android)\//i.test(ua);
  return { isInstagram, isOtherInApp, isLine, platform, isChrome, isSafari };
}

export function buildExternalDestination({ origin, pathname = '/', search = '' } = {}) {
  const base = new URL(pathname || '/', origin);
  const safe = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search || '')) {
    if (CAMPAIGN_PARAM_PATTERN.test(key)) safe.append(key, value);
  }
  base.search = safe.toString();
  base.hash = '';
  return base.toString();
}

export function buildAndroidChromeIntent(targetUrl) {
  const url = new URL(targetUrl);
  const fallback = encodeURIComponent(url.toString());
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

export function buildIosSafariAttempt(targetUrl) {
  // Prototype only. Apple does not document x-safari-https as a supported
  // way to force Safari from an arbitrary WebView; callers must always show
  // the manual fallback when this does not cause a navigation.
  return `x-safari-${targetUrl}`;
}
