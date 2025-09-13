// sw.js - Service Worker for fake MCP HTTP endpoint

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
    console.log('Service Worker installing');
    self.skipWaiting();
});

// Activate event - claim all clients immediately
self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(self.clients.claim());
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
    try {
        const res = await fetch('.env', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const map = {};
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
    } catch (_) {
        __ENV_CACHE = {};
    }
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
            const defaultUrl = (typeof envUrl === 'string' && envUrl.trim())
                ? envUrl.trim()
                : 'https://n8n.monai.art/webhook/ddfbdb12-7d96-46f7-91c4-0713a013484b';
            const url = (params && typeof params.url === 'string' && params.url.trim()) ? params.url : defaultUrl;
            const payload = (params && typeof params.payload === 'object') ? params.payload : {};

            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    // Use CORS mode; if the server does not allow it, this may throw.
                    mode: 'cors',
                });

                const status = resp.status;
                let responseText = '';
                try { responseText = await resp.text(); } catch (_) {}

                const responseData = {
                    jsonrpc: '2.0',
                    id: id,
                    result: {
                        content: [
                            { type: 'text', text: `Webhook POST status: ${status}` }
                        ],
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
                                        description: 'Optional override URL; defaults to the n8n webhook'
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
