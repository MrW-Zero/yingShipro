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
module.exports = (req, res) => {
  const list = Object.entries(SOURCES).map(([key, v]) => ({ key, name: v.name }));
  res.json({ code: 200, sources: list });
};
