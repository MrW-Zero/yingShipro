const axios = require('axios');
const SOURCES = {
  bfzy:     { api: 'https://bfzyapi.com/api.php/provide/vod',                name: '暴风资源' },
  zuida:    { api: 'https://api.zuidapi.com/api.php/provide/vod',            name: '最大资源' },
  bdzy:     { api: 'https://api.apibdzy.com/api.php/provide/vod',            name: '百度云资源' },
  s360:     { api: 'https://360zyzz.com/api.php/provide/vod',                name: '360资源' },
  lzi:      { api: 'https://cj.lziapi.com/api.php/provide/vod',              name: '量子资源' },
  guangsu:  { api: 'https://api.guangsuapi.com/api.php/provide/vod',        name: '光速资源' },
  xinlang:  { api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',  name: '新浪资源' },
  jyzy:     { api: 'https://jyzyapi.com/provide/vod',                        name: '金鹰资源' },
  wujin:    { api: 'https://api.wujinapi.me/api.php/provide/vod',            name: '无尽资源' },
  maotai:   { api: 'https://caiji.maotaizy.cc/api.php/provide/vod',          name: '茅台资源' },
  rycj:     { api: 'https://cj.rycjapi.com/api.php/provide/vod',             name: '如意资源' },
  ffzy:     { api: 'http://ffzy5.tv/api.php/provide/vod',                    name: '非凡资源' },
};
module.exports = async (req, res) => {
  const id = req.query.id;
  const source = req.query.source;
  if (!id) return res.status(400).json({ code: 400, msg: '缺少视频ID' });
  const src = source && SOURCES[source] ? SOURCES[source] : null;
  if (!src) return res.status(400).json({ code: 400, msg: '无效的资源站' });
  try {
    const url = src.api + '?ac=videolist&ids=' + id;
    const resp = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    if (data.code !== 1 || !data.list || data.list.length === 0) {
      return res.json({ code: 404, msg: '未找到', episodes: [], videoInfo: null });
    }
    const vod = data.list[0];
    let episodes = [];
    if (vod.vod_play_url) {
      const playSources = vod.vod_play_url.split('$$$');
      const firstSource = playSources[0] || '';
      const parts = firstSource.split('#');
      episodes = parts.map(p => {
        const [name, url] = p.split('$');
        let finalUrl = (url || '').trim();
        if (finalUrl.startsWith('http') && !finalUrl.includes('.m3u8') && !finalUrl.includes('.ts') && !finalUrl.includes('.mp4')) {
          finalUrl = finalUrl.replace(/\/$/, '') + '/index.m3u8';
        }
        return { name: (name || '').trim(), url: finalUrl };
      }).filter(ep => ep.url && ep.url.startsWith('http'));
    }
    res.json({
      code: 200, episodes,
      videoInfo: { title: vod.vod_name, desc: vod.vod_content || '', type: vod.type_name || '', year: vod.vod_year || '', area: vod.vod_area || '', director: vod.vod_director || '', actor: vod.vod_actor || '', remarks: vod.vod_remarks || '', pic: vod.vod_pic || '', source_name: src.name }
    });
  } catch (e) {
    res.status(500).json({ code: 500, msg: '获取详情失败' });
  }
};
