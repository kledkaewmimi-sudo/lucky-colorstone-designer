module.exports = function liffConfigHandler(_request, response) {
  const liffId = String(process.env.PRODUCTION_LIFF_ID || '2010525799-qImIuhla').trim();
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({ environment: 'production', liffId });
};
