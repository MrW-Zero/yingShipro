// 服务端聚合搜索 - 所有请求走 localhost
async function searchByAPIAndKeyWord(apiId, query) {
    try {
        const url = '/api/search?wd=' + encodeURIComponent(query) + '&source=' + apiId;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return [];
        const data = await response.json();
        if (!data || !data.list || !Array.isArray(data.list)) return [];

        return data.list;
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}

// 从服务端获取资源站列表
async function loadSourcesFromServer() {
    try {
        const resp = await fetch('/api/sources');
        const data = await resp.json();
        if (data.code === 200 && Array.isArray(data.sources)) {
            data.sources.forEach(s => {
                if (!API_SITES[s.key]) {
                    API_SITES[s.key] = { api: '', name: s.name };
                }
            });
            return data.sources;
        }
    } catch (e) {
        console.warn('获取资源站列表失败:', e);
    }
    return [];
}
