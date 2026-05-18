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
  const wd = req.query.wd;
  if (!wd) return res.status(400).json({ code: 400, msg: '缺少搜索参数' });
  const source = req.query.source;
  let targets;
  if (source && SOURCES[source]) {
    targets = [[source, SOURCES[source]]];
  } else {
    targets = Object.entries(SOURCES);
  }
  const searchOne = async ([key, src]) => {
    try {
      const url = src.api + '?ac=videolist&wd=' + encodeURIComponent(wd);
      const resp = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
      if (data.code === 1 && Array.isArray(data.list)) {
        return data.list.map(item => ({ ...item, source_name: src.name, source_code: key }));
      }
    } catch (e) {}
    return [];
  };
  try {
    const results = await Promise.all(targets.map(searchOne));
    res.json({ code: 200, total: results.flat().length, list: results.flat() });
  } catch (e) {
    res.status(500).json({ code: 500, msg: '搜索失败' });
  }
};
