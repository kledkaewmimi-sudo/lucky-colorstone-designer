module.exports = function liffConfigHandler(_request, response) {
  const liffId = String(process.env.UAT_LIFF_ID || '').trim();
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({ environment: 'uat', liffId });
};
