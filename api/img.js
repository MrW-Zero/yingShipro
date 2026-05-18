const axios = require('axios');
module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) return res.status(400).send('invalid url');
  try {
    const resp = await axios.get(targetUrl, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': new URL(targetUrl).origin + '/', 'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8' } });
    res.setHeader('Content-Type', resp.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(resp.data);
  } catch (e) { res.status(404).end(); }
};
