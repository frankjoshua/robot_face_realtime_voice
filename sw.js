// sw.js - Service Worker for fake MCP HTTP endpoint

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
    console.log('Service Worker installing');
    self.skipWaiting();
});

// Activate event - claim all clients immediately
self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil((async () => {
        try {
            await self.clients.claim();
        } catch (_) {}
        // Proactively check for required config and alert if missing
        try {
            const url = await __env('WEBHOOK_URL');
            if (!url || !String(url).trim()) {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                for (const client of clients) {
                    client.postMessage({
                        type: 'ui.alert',
                        text: 'Webhook URL is not configured. Provide params.url or set WEBHOOK_URL in env.js.'
                    });
                }
                console.log('[sw][env] WEBHOOK_URL missing at activation');
            } else {
                console.log('[sw][env] WEBHOOK_URL found at activation');
            }
        } catch (e) {
            console.log('[sw][env] activation check failed:', e?.message || e);
        }
    })());
});

// Fetch event - intercept requests to /mcp and handle CORS
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle CORS preflight requests
    if (event.request.method === 'OPTIONS' && url.pathname === '/mcp') {
        event.respondWith(new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        }));
        return;
    }
    
    // Intercept POST requests to /mcp path
    if (event.request.method === 'POST' && url.pathname === '/mcp') {
        event.respondWith(handleMcpRequest(event.request));
    }
    // Let all other requests pass through
});

// Simple .env loader for Service Worker (reads plain text key=value)
let __ENV_CACHE = null;
async function __loadEnvOnce() {
    if (__ENV_CACHE !== null) return __ENV_CACHE;
    // Try env.js (JS), env.json (JSON), env (key=value), then .env (key=value)
    const map = {};
    // 0) env.js via importScripts (preferred)
    try {
        // Allow env.js to set either self.ENV/self.__ENV__ objects or top-level globals
        let loaded = false;
        try { importScripts('env.js'); loaded = true; console.log('[sw][env] loaded env.js'); } catch (e1) {
            console.log('[sw][env] failed env.js relative:', e1?.message || e1);
        }
        if (!loaded) {
            try { importScripts('/env.js'); loaded = true; console.log('[sw][env] loaded /env.js'); } catch (e2) {
                console.log('[sw][env] failed /env.js absolute:', e2?.message || e2);
            }
        }
        // Cache-busting retries in case of stale caches
        if (!loaded) {
            const bust = 'v=' + Date.now();
            try { importScripts('env.js?' + bust); loaded = true; console.log('[sw][env] loaded env.js?'+bust); } catch (e3) {
                console.log('[sw][env] failed env.js?bust:', e3?.message || e3);
            }
            if (!loaded) {
                try { importScripts('/env.js?' + bust); loaded = true; console.log('[sw][env] loaded /env.js?'+bust); } catch (e4) {
                    console.log('[sw][env] failed /env.js?bust:', e4?.message || e4);
                }
            }
        }
        const jsEnv = (self.ENV && typeof self.ENV === 'object') ? self.ENV
                     : (self.__ENV__ && typeof self.__ENV__ === 'object') ? self.__ENV__
                     : null;
        if (jsEnv) {
            Object.assign(map, jsEnv);
            try { console.log('[sw][env] ENV keys:', Object.keys(jsEnv)); } catch (_) {}
        }
        // Also support simple global assignments, e.g., `self.WEBHOOK_URL = "..."` or `var WEBHOOK_URL = "..."`
        const globals = ['WEBHOOK_URL', 'OPENAI_API_KEY', 'OPEN_AI_KEY'];
        for (const k of globals) {
            if (typeof self[k] === 'string' && self[k]) {
                map[k] = self[k];
                try { console.log('[sw][env] global', k, 'present'); } catch (_) {}
            }
        }
        if (Object.keys(map).length > 0) {
            __ENV_CACHE = map;
            return __ENV_CACHE;
        }
    } catch (_) {}
    // 1) env.json
    try {
        const resJson = await fetch('env.json', { cache: 'no-store' });
        if (resJson.ok) {
            const json = await resJson.json();
            if (json && typeof json === 'object') {
                Object.assign(map, json);
                __ENV_CACHE = map;
                return __ENV_CACHE;
            }
        }
    } catch (_) {}
    // 2) env (no dot)
    try {
        const resEnv = await fetch('env', { cache: 'no-store' });
        if (resEnv.ok) {
            const text = await resEnv.text();
            for (const rawLine of text.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#')) continue;
                const eq = line.indexOf('=');
                if (eq === -1) continue;
                const key = line.slice(0, eq).trim();
                const val = line.slice(eq + 1).trim();
                if (key) map[key] = val;
            }
            __ENV_CACHE = map;
            return __ENV_CACHE;
        }
    } catch (_) {}
    // 3) .env (dotfile)
    try {
        const resDot = await fetch('.env', { cache: 'no-store' });
        if (resDot.ok) {
            const text = await resDot.text();
            for (const rawLine of text.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#')) continue;
                const eq = line.indexOf('=');
                if (eq === -1) continue;
                const key = line.slice(0, eq).trim();
                const val = line.slice(eq + 1).trim();
                if (key) map[key] = val;
            }
        }
    } catch (_) {}
    __ENV_CACHE = map; // possibly empty
    return __ENV_CACHE;
}
async function __env(key) {
    const env = await __loadEnvOnce();
    return env[key];
}

// Handle MCP requests - Real MCP protocol implementation
async function handleMcpRequest(request) {
    try {
        // Parse the JSON request body
        const requestData = await request.json();
        const { id, method, params } = requestData;
        
        console.log('MCP request:', { id, method, params });
        
        // (ui.print removed)

        // Handle eyes.set_mood method - set the expression of Baxter eyes via MCP
        if (method === 'eyes.set_mood') {
            const mood = params?.mood || 'neutral';
            const allowed = new Set(['neutral', 'happy', 'sad', 'angry']);
            if (!allowed.has(mood)) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: id,
                    error: {
                        code: -32602,
                        message: 'Invalid params: mood must be one of neutral|happy|sad|angry'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({
                    type: 'eyes.set_mood',
                    mood,
                    timestamp: new Date().toISOString()
                });
            }

            const responseData = {
                jsonrpc: '2.0',
                id: id,
                result: {
                    content: [
                        { type: 'text', text: `Mood set to: ${mood}` }
                    ]
                }
            };

            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        // Handle face.set method - switch visual theme (baxter|hal)
        if (method === 'face.set') {
            const name = params?.name || 'baxter';
            const allowed = new Set(['baxter', 'hal', 'eve']);
            if (!allowed.has(name)) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: id,
                    error: {
                        code: -32602,
                        message: 'Invalid params: name must be one of baxter|hal'
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: 'face.set', name, timestamp: new Date().toISOString() });
            }

            const responseData = {
                jsonrpc: '2.0',
                id: id,
                result: {
                    content: [ { type: 'text', text: `Face set to: ${name}` } ]
                }
            };
            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        // Handle voice.disconnect method - disconnect voice session on all clients
        if (method === 'voice.disconnect') {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: 'voice.disconnect', timestamp: new Date().toISOString() });
            }

            const responseData = {
                jsonrpc: '2.0',
                id: id,
                result: {
                    content: [ { type: 'text', text: 'Voice disconnect broadcast' } ]
                }
            };
            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        // Handle webhook.post method - POST JSON to external webhook
        if (method === 'webhook.post') {
            const envUrl = await __env('WEBHOOK_URL');
            const providedUrl = (params && typeof params.url === 'string' && params.url.trim()) ? params.url.trim() : null;
            let url = providedUrl || ((typeof envUrl === 'string' && envUrl.trim()) ? envUrl.trim() : null);

            // If no URL available, try reloading env once in case SW cached before env.js existed
            if (!url) {
                try { __ENV_CACHE = null; } catch (_) {}
                try {
                    const reEnv = await __env('WEBHOOK_URL');
                    if (!providedUrl && typeof reEnv === 'string' && reEnv.trim()) {
                        url = reEnv.trim(); // Set the URL for the main execution path
                    }
                } catch (_) {}

                // If still no URL available after retry, return error
                if (!url) {
                    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                    for (const client of clients) {
                        client.postMessage({
                            type: 'ui.alert',
                            text: 'Webhook URL is not configured. Provide params.url or set WEBHOOK_URL in env.js.'
                        });
                    }
                    return new Response(JSON.stringify({
                        jsonrpc: '2.0',
                        id: id,
                        error: {
                            code: -32602,
                            message: 'Missing webhook URL: provide params.url or set WEBHOOK_URL in env.js'
                        }
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            const payload = (params && typeof params.payload === 'object') ? params.payload : {};

            // Broadcast that the webhook is being called
            try {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                for (const client of clients) {
                    client.postMessage({
                        type: 'webhook.post',
                        url,
                        payloadKeys: Object.keys(payload || {}).length,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (_) {}

            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    // Use CORS mode; server must allow it
                    mode: 'cors',
                });

                const status = resp.status;
                let responseText = '';
                try { responseText = await resp.text(); } catch (_) {}

                // Broadcast the webhook result
                try {
                    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                    for (const client of clients) {
                        client.postMessage({
                            type: 'webhook.post.result',
                            url,
                            status,
                            ok: resp.ok,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (_) {}

                const responseData = {
                    jsonrpc: '2.0',
                    id: id,
                    result: {
                        content: [
                            { type: 'text', text: `Webhook POST status: ${status}` }
                        ],
                        used_url: url,
                        status,
                        body: responseText?.slice(0, 2048) || ''
                    }
                };
                return new Response(JSON.stringify(responseData), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    }
                });
            } catch (err) {
                // Broadcast the webhook error
                try {
                    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                    for (const client of clients) {
                        client.postMessage({
                            type: 'webhook.post.result',
                            url,
                            error: (err?.message || String(err)),
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (_) {}

                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: id,
                    error: {
                        code: -32000,
                        message: 'Failed to POST webhook: ' + (err?.message || String(err))
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Handle ui.panels.set method - show/hide debug panels (like gear button)
        if (method === 'ui.panels.set') {
            const visible = !!(params && typeof params.visible !== 'undefined' ? params.visible : true);

            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: 'ui.panels.set', visible, timestamp: new Date().toISOString() });
            }

            const responseData = {
                jsonrpc: '2.0',
                id: id,
                result: {
                    content: [ { type: 'text', text: `Panels visible: ${visible}` } ]
                }
            };
            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        // Handle ui.panels.toggle method - toggle panels on all clients
        if (method === 'ui.panels.toggle') {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: 'ui.panels.toggle', timestamp: new Date().toISOString() });
            }

            const responseData = {
                jsonrpc: '2.0',
                id: id,
                result: {
                    content: [ { type: 'text', text: 'Panels toggled' } ]
                }
            };
            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
        
        // Handle env.get method - return current environment map (sanitized)
        if (method === 'env.get') {
            const env = await __loadEnvOnce();
            // Only expose whitelisted keys
            const allow = ['WEBHOOK_URL'];
            const out = {};
            for (const k of allow) {
                if (typeof env[k] !== 'undefined') out[k] = env[k];
            }
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: id,
                result: { env: out }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Handle tools/list method for MCP capability discovery
        if (method === 'tools/list') {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: id,
                result: {
                    tools: [
                        {
                            name: 'webhook_post',
                            description: 'POST a JSON payload to the external webhook',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    payload: {
                                        type: 'object',
                                        description: 'Arbitrary JSON payload to send'
                                    },
                                    url: {
                                        type: 'string',
                                        description: 'Optional override URL; if omitted, uses WEBHOOK_URL from .env'
                                    }
                                },
                                required: ['payload']
                            }
                        },
                        {
                            name: 'eyes_set_mood',
                            description: 'Set the Baxter eyes expression/mood',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    mood: {
                                        type: 'string',
                                        enum: ['neutral', 'happy', 'sad', 'angry'],
                                        description: 'Desired mood'
                                    }
                                },
                                required: ['mood']
                            }
                        },
                        {
                            name: 'face_set',
                            description: 'Switch visual face theme (baxter|hal|eve)',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', enum: ['baxter', 'hal', 'eve'] }
                                },
                                required: ['name']
                            }
                        },
                        {
                            name: 'ui_panels_set',
                            description: 'Show or hide debug panels (like the gear button)',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    visible: { type: 'boolean', description: 'true to show panels; false to hide' }
                                },
                                required: ['visible']
                            }
                        },
                        {
                            name: 'ui_panels_toggle',
                            description: 'Toggle debug panels (like the gear button)',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        },
                        {
                            name: 'voice_disconnect',
                            description: 'Disconnect the active voice session across all tabs',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        }
                    ]
                }
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        // Handle unknown methods
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: id,
            error: {
                code: -32601,
                message: 'Method not found: ' + method
            }
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
    } catch (error) {
        console.error('Error handling MCP request:', error);
        
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
                code: -32700,
                message: 'Parse error: ' + error.message
            }
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
