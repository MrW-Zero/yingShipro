const axios = require('axios');
module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) return res.status(400).send('invalid url');
  const isM3u8 = targetUrl.includes('.m3u8');
  const reqHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': new URL(targetUrl).origin + '/' };
  try {
    if (isM3u8) {
      const resp = await axios.get(targetUrl, { responseType: 'text', timeout: 15000, headers: reqHeaders });
      const urlObj = new URL(targetUrl);
      const origin = urlObj.origin;
      const base = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      function resolveUrl(raw) {
        if (!raw) return raw;
        if (raw.startsWith('http')) return raw;
        if (raw.startsWith('/')) return origin + raw;
        return base + raw;
      }
      const lines = resp.data.split('\n');
      const result = [];
      const adPatterns = ['adjump', '/ads/', 'advertisement'];
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === '#EXT-X-DISCONTINUITY') continue;
        if (adPatterns.some(p => line.includes(p))) {
          if (result.length > 0 && result[result.length - 1].trim().startsWith('#EXTINF')) result.pop();
          continue;
        }
        if (line.startsWith('#EXT-X-KEY') && line.includes('URI="')) {
          line = line.replace(/URI="([^"]*)"/, (m, uri) => 'URI="' + resolveUrl(uri) + '"');
          result.push(line);
        } else if (line && !line.startsWith('#')) {
          result.push(resolveUrl(line));
        } else {
          result.push(lines[i]);
        }
      }
      res.setHeader('Content-Type', resp.headers['content-type'] || 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(result.join('\n'));
    }
    const resp = await axios.get(targetUrl, { responseType: 'arraybuffer', timeout: 15000, headers: reqHeaders });
    res.setHeader('Content-Type', resp.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(resp.data);
  } catch (e) {
    if (isM3u8) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send('#EXTM3U\n#EXT-X-ENDLIST\n');
    } else {
      res.status(404).end();
    }
  }
};
