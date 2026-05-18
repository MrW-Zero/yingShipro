const axios = require('axios');
module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.includes('douban.com')) return res.status(400).json({ code: 400, msg: 'invalid url' });
  try {
    const resp = await axios.get(targetUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://movie.douban.com/', 'Accept': 'application/json, text/plain, */*' } });
    res.json(resp.data);
  } catch (e) { res.status(500).json({ code: 500, msg: '豆瓣请求失败' }); }
};
