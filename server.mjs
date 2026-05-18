import path from 'path';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: process.env.PORT || 8080,
  password: process.env.PASSWORD || process.env.password || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
  cacheMaxAge: process.env.CACHE_MAX_AGE || '1d',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  debug: process.env.DEBUG === 'true'
};

const log = (...args) => {
  if (config.debug) {
    console.log('[DEBUG]', ...args);
  }
};

const app = express();

app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function sha256Hash(input) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    resolve(hash.digest('hex'));
  });
}

async function renderPage(filePath, password) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (password !== '') {
    const sha256 = await sha256Hash(password);
    content = content.replace('{{PASSWORD}}', sha256);
  } else {
    content = content.replace('{{PASSWORD}}', '');
  }
  return content;
}

app.get(['/', '/index.html', '/player.html'], async (req, res) => {
  try {
    let filePath;
    switch (req.path) {
      case '/player.html':
        filePath = path.join(__dirname, 'player.html');
        break;
      default: // '/' 和 '/index.html'
        filePath = path.join(__dirname, 'index.html');
        break;
    }
    
    const content = await renderPage(filePath, config.password);
    res.send(content);
  } catch (error) {
    console.error('页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/s=:keyword', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password);
    res.send(content);
  } catch (error) {
    console.error('搜索页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];
    
    // 从环境变量获取阻止的主机名列表
    const blockedHostnames = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    
    // 从环境变量获取阻止的 IP 前缀
    const blockedPrefixes = (process.env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');
    
    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;
    
    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// 验证代理请求的鉴权
function validateProxyAuth(req) {
  const authHash = req.query.auth;
  const timestamp = req.query.t;
  
  // 获取服务器端密码哈希
  const serverPassword = config.password;
  if (!serverPassword) {
    console.error('服务器未设置 PASSWORD 环境变量，代理访问被拒绝');
    return false;
  }
  
  // 使用 crypto 模块计算 SHA-256 哈希
  const serverPasswordHash = crypto.createHash('sha256').update(serverPassword).digest('hex');
  
  if (!authHash || authHash !== serverPasswordHash) {
    console.warn('代理请求鉴权失败：密码哈希不匹配');
    console.warn(`期望: ${serverPasswordHash}, 收到: ${authHash}`);
    return false;
  }
  
  // 验证时间戳（10分钟有效期）
  if (timestamp) {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10分钟
    if (now - parseInt(timestamp) > maxAge) {
      console.warn('代理请求鉴权失败：时间戳过期');
      return false;
    }
  }
  
  return true;
}

app.get('/proxy/:encodedUrl', async (req, res) => {
  try {
    // 验证鉴权
    if (!validateProxyAuth(req)) {
      return res.status(401).json({
        success: false,
        error: '代理访问未授权：请检查密码配置或鉴权参数'
      });
    }

    const encodedUrl = req.params.encodedUrl;
    const targetUrl = decodeURIComponent(encodedUrl);

    // 安全验证
    if (!isValidUrl(targetUrl)) {
      return res.status(400).send('无效的 URL');
    }

    log(`代理请求: ${targetUrl}`);

    // 添加请求超时和重试逻辑
    const maxRetries = config.maxRetries;
    let retries = 0;
    
    const makeRequest = async () => {
      try {
        return await axios({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent
          }
        });
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          log(`重试请求 (${retries}/${maxRetries}): ${targetUrl}`);
          return makeRequest();
        }
        throw error;
      }
    };

    const response = await makeRequest();

    // 转发响应头（过滤敏感头）
    const headers = { ...response.headers };
    const sensitiveHeaders = (
      process.env.FILTERED_HEADERS || 
      'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');
    
    sensitiveHeaders.forEach(header => delete headers[header]);
    res.set(headers);

    // 管道传输响应流
    response.data.pipe(res);
  } catch (error) {
    console.error('代理请求错误:', error.message);
    if (error.response) {
      res.status(error.response.status || 500);
      error.response.data.pipe(res);
    } else {
      res.status(500).send(`请求失败: ${error.message}`);
    }
  }
});

// 资源站列表
const ALL_SOURCES = {
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

app.get('/api/sources', (req, res) => {
  const list = Object.entries(ALL_SOURCES).map(([key, v]) => ({ key, name: v.name }));
  res.json({ code: 200, sources: list });
});

// 服务端聚合搜索
app.get('/api/search', async (req, res) => {
  const wd = req.query.wd;
  if (!wd) return res.status(400).json({ code: 400, msg: '缺少搜索参数' });
  const source = req.query.source;
  let targets;
  if (source && ALL_SOURCES[source]) {
    targets = [[source, ALL_SOURCES[source]]];
  } else {
    targets = Object.entries(ALL_SOURCES);
  }
  const searchOne = async ([key, src]) => {
    try {
      const url = src.api + '?ac=videolist&wd=' + encodeURIComponent(wd);
      const resp = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': config.userAgent } });
      const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
      if (data.code === 1 && Array.isArray(data.list)) {
        return data.list.map(item => ({ ...item, source_name: src.name, source_code: key }));
      }
    } catch (e) { /* 跳过失败的源 */ }
    return [];
  };
  try {
    const results = await Promise.all(targets.map(searchOne));
    res.json({ code: 200, total: results.flat().length, list: results.flat() });
  } catch (e) {
    res.status(500).json({ code: 500, msg: '搜索失败' });
  }
});

// 服务端视频详情
app.get('/api/detail', async (req, res) => {
  const id = req.query.id;
  const source = req.query.source;
  if (!id) return res.status(400).json({ code: 400, msg: '缺少视频ID' });
  const src = source && ALL_SOURCES[source] ? ALL_SOURCES[source] : null;
  if (!src) return res.status(400).json({ code: 400, msg: '无效的资源站' });
  try {
    const url = src.api + '?ac=videolist&ids=' + id;
    const resp = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': config.userAgent } });
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
      videoInfo: {
        title: vod.vod_name, desc: vod.vod_content || vod.vod_blurb || '',
        type: vod.type_name || '', year: vod.vod_year || '', area: vod.vod_area || '',
        director: vod.vod_director || '', actor: vod.vod_actor || '',
        remarks: vod.vod_remarks || '', pic: vod.vod_pic || '', source_name: src.name
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, msg: '获取详情失败' });
  }
});

// 视频代理 - 处理 m3u8 和 ts 分片
app.get('/player-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('invalid url');
  }
  const isM3u8 = targetUrl.includes('.m3u8');
  const reqHeaders = {
    'User-Agent': config.userAgent,
    'Referer': new URL(targetUrl).origin + '/'
  };
  try {
    if (isM3u8) {
      const resp = await axios.get(targetUrl, { responseType: 'text', timeout: 15000, headers: reqHeaders });
      const urlObj = new URL(targetUrl);
      const origin = urlObj.origin;
      const base = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      function resolveUrl(raw) {
        if (!raw) return raw;
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
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
      res.set('Content-Type', resp.headers['content-type'] || 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(result.join('\n'));
    }
    // ts / key 等二进制内容
    const resp = await axios({
      method: 'get', url: targetUrl, responseType: 'stream', timeout: 15000, headers: reqHeaders
    });
    res.set('Content-Type', resp.headers['content-type'] || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    resp.data.pipe(res);
  } catch (e) {
    if (isM3u8) {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.send('#EXTM3U\n#EXT-X-ENDLIST\n');
    } else {
      res.status(404).end();
    }
  }
});

// 图片代理 - 解决豆瓣等图片防盗链问题
app.get('/img', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('invalid url');
  }
  try {
    const response = await axios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': config.userAgent,
        'Referer': new URL(targetUrl).origin + '/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (e) {
    res.status(404).end();
  }
});

app.use(express.static(path.join(__dirname), {
  maxAge: config.cacheMaxAge
}));

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

app.use((req, res) => {
  res.status(404).send('页面未找到');
});

// 启动服务器
app.listen(config.port, () => {
  console.log(`服务器运行在 http://localhost:${config.port}`);
  if (config.password !== '') {
    console.log('用户登录密码已设置');
  } else {
    console.log('警告: 未设置 PASSWORD 环境变量，用户将被要求设置密码');
  }
  if (config.debug) {
    console.log('调试模式已启用');
    console.log('配置:', { ...config, password: config.password ? '******' : '' });
  }
});
