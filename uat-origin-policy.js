const UAT_ALLOWED_ORIGIN = 'https://uat.customize.luckycolorstone.com';

function readHeader(req, name) {
  return String(req?.headers?.[name] || req?.headers?.[name.toLowerCase()] || '').trim();
}

function isExactUatOriginRequest(req) {
  return readHeader(req, 'origin') === UAT_ALLOWED_ORIGIN;
}

function isAllowedUatHandoffReadRequest(req) {
  if (isExactUatOriginRequest(req)) return true;
  const sameOrigin = readHeader(req, 'sec-fetch-site') === 'same-origin';
  const referer = readHeader(req, 'referer');
  return sameOrigin && /^https:\/\/uat\.customize\.luckycolorstone\.com(?:\/|$)/i.test(referer);
}

module.exports = {
  UAT_ALLOWED_ORIGIN,
  isExactUatOriginRequest,
  isAllowedUatHandoffReadRequest
};
