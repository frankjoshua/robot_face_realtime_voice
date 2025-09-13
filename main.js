// main.js - Pure browser Realtime Voice + MCP demo

let counter = 0;
let pc = null;            // RTCPeerConnection for WebRTC
let dc = null;            // RTCDataChannel for JSON events
let localStream = null;   // Microphone stream
let remoteAudioEl = null; // <audio> element for remote audio playback
let audioContext = null;
let mediaRecorder = null;
let isRecording = false;
let promptText = null;    // Loaded markdown instructions

// Faces
let activeFace = null;
let baxterFace = null;
let halFace = null;
let eveFace = null;
let currentFaceName = 'baxter';

// --- Debug token usage from API (no estimation) ---
const tokenUsage = {
    last: { input: 0, output: 0, total: 0 },
    session: { input: 0, output: 0, total: 0 }
};
// Track last applied usage payload to avoid double-counting
let __lastUsageSignature = null;

// Pricing (USD per 1M tokens)
const TOKEN_PRICING = {
    inputPerMillion: 32,
    outputPerMillion: 64
};

function computeCost(inputTokens, outputTokens) {
    const inCost = (inputTokens * TOKEN_PRICING.inputPerMillion) / 1_000_000;
    const outCost = (outputTokens * TOKEN_PRICING.outputPerMillion) / 1_000_000;
    return { inCost, outCost, total: inCost + outCost };
}

function formatUSD(amount) {
    try {
        return amount.toLocaleString(undefined, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 4,
            maximumFractionDigits: 4
        });
    } catch (_) {
        return `$${amount.toFixed(4)}`;
    }
}

function resetTokenCounter() {
    tokenUsage.last = { input: 0, output: 0, total: 0 };
    tokenUsage.session = { input: 0, output: 0, total: 0 };
    setTokenBadge(0, { input: 0, output: 0 });
}

function setTokenBadge(total, breakdown) {
    try {
        const input = (breakdown && typeof breakdown.input === 'number') ? breakdown.input : 0;
        const output = (breakdown && typeof breakdown.output === 'number') ? breakdown.output : 0;

        // Prevent mid-session flicker to zeros: if a spurious update tries to set
        // all values to 0 while we've already accumulated tokens this session,
        // ignore it. Legit resets still occur via resetTokenCounter().
        try {
            if (input === 0 && output === 0 && total === 0) {
                const sess = tokenUsage?.session || { total: 0 };
                if ((Number(sess.total) || 0) > 0) {
                    return; // skip zero flash
                }
            }
        } catch (_) {}

        const inEl = document.getElementById('tokenIn');
        if (inEl) inEl.textContent = String(input);
        const outEl = document.getElementById('tokenOut');
        if (outEl) outEl.textContent = String(output);
        const totEl = document.getElementById('tokenTotal') || document.getElementById('tokenCount');
        if (totEl) totEl.textContent = String(total);
        const costEl = document.getElementById('tokenCost');
        if (costEl) {
            const { inCost, outCost, total: totalCost } = computeCost(input, output);
            costEl.textContent = formatUSD(totalCost);
        }
        const wrapper = document.getElementById('debugStatus');
        if (wrapper) {
            const sess = tokenUsage.session || { input: 0, output: 0, total: 0 };
            const lastCosts = computeCost(input, output);
            const sessCosts = computeCost(sess.input, sess.output);
            wrapper.title = `Last — input: ${input}  output: ${output}  total: ${total}` +
                            `\n       cost: in ${formatUSD(lastCosts.inCost)}  out ${formatUSD(lastCosts.outCost)}  total ${formatUSD(lastCosts.total)}` +
                            `\nSession — input: ${sess.input}  output: ${sess.output}  total: ${sess.total}` +
                            `\n          cost: in ${formatUSD(sessCosts.inCost)}  out ${formatUSD(sessCosts.outCost)}  total ${formatUSD(sessCosts.total)}`;
        }
    } catch (_) {}
}

function updateUsageFromResponse(usage) {
    if (!usage || typeof usage !== 'object') return;
    // Avoid re-applying identical usage objects across multiple events
    try {
        const sig = JSON.stringify(usage);
        if (sig && sig === __lastUsageSignature) return;
        __lastUsageSignature = sig;
    } catch (_) {}

    // Support multiple possible field names from different API versions
    const input = (
        usage.input_tokens ??
        usage.prompt_tokens ??
        usage.total_input_tokens ??
        usage.input_token_count ??
        usage.input ?? 0
    );
    const output = (
        usage.output_tokens ??
        usage.completion_tokens ??
        usage.total_output_tokens ??
        usage.output_token_count ??
        usage.output ?? 0
    );
    const total = (
        usage.total_tokens ??
        usage.total_token_count ??
        usage.total ??
        ((Number(input) || 0) + (Number(output) || 0))
    );

    tokenUsage.last = { input, output, total };
    tokenUsage.session.input += input;
    tokenUsage.session.output += output;
    tokenUsage.session.total += total;

    // Show last response total on the badge
    setTokenBadge(total, { input, output });
}

function switchFace(name) {
    log(`[faces] switchFace requested: ${name}`);
    const allowed = new Set(['baxter', 'hal', 'eve']);
    const target = allowed.has(name) ? name : 'baxter';
    if (!allowed.has(name)) {
        log(`[faces] unknown face "${name}", defaulting to baxter`);
    }
    log(`[faces] resolved target: ${target}`);
    if (currentFaceName === target && activeFace) return;
    // Stop any running faces to avoid double-rendering on the same canvas
    try {
        if (baxterFace) {
            baxterFace.stopRendering?.();
            baxterFace.stopAnimations?.();
        }
        if (halFace) {
            halFace.stopRendering?.();
            halFace.stopAnimations?.();
        }
        if (eveFace) {
            eveFace.stopRendering?.();
            eveFace.stopAnimations?.();
        }
        log('[faces] ensured all faces stopped before starting new');
    } catch (_) {}
    // Pick new
    if (target === 'hal') {
        activeFace = halFace;
    } else if (target === 'eve') {
        activeFace = eveFace;
    } else {
        activeFace = baxterFace;
    }
    currentFaceName = target;
    // Start
    if (activeFace) {
        log(`[faces] starting face: ${currentFaceName}`);
        if (typeof activeFace.startRendering === 'function') activeFace.startRendering();
        if (typeof activeFace.startAnimations === 'function') activeFace.startAnimations();
        try {
            const r = !!activeFace.rendering;
            const a = !!activeFace.animationsStarted;
            log(`[faces] state after start -> rendering=${r} animations=${a}`);
        } catch (_) {}
    }
}

function cycleFace() {
    const order = ['baxter', 'hal', 'eve'];
    const idx = order.indexOf(currentFaceName);
    const next = order[(idx + 1) % order.length];
    log(`[faces] cycleFace: current=${currentFaceName} next=${next}`);
    switchFace(next);
    // Broadcast via MCP so all tabs stay in sync
    const hasController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    if (!hasController) {
        log('[faces] skipping MCP broadcast: no SW controller');
        return;
    }
    log(`[faces] broadcasting face.set: ${next}`);
    mcpCall('face.set', { name: next })
        .then(res => log(`[faces] face.set broadcast ok: ${JSON.stringify(res)}`))
        .catch(err => log(`[faces] face.set broadcast error: ${err?.message || err}`));
}

// Utility function to log debug messages
function log(message) {
    const logEl = document.getElementById('log');
    logEl.textContent += new Date().toISOString() + ': ' + message + '\n';
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message);
}

// Smoothly fade out and hide the connect overlay
function hideConnectOverlayWithFade() {
    try {
        const overlay = document.getElementById('connectOverlay');
        if (!overlay) return;
        // If already hidden, skip
        const computed = window.getComputedStyle(overlay);
        if (computed.display === 'none' || overlay.classList.contains('fade-out')) return;
        overlay.classList.add('fade-out');
        overlay.addEventListener('transitionend', () => {
            overlay.style.display = 'none';
        }, { once: true });
    } catch (_) {}
}

// Smoothly show and fade-in the connect overlay
function showConnectOverlayWithFade() {
    try {
        const overlay = document.getElementById('connectOverlay');
        if (!overlay) return;
        // Ensure overlay is in the DOM flow
        overlay.style.display = 'grid';
        // Start from transparent state
        if (!overlay.classList.contains('fade-out')) overlay.classList.add('fade-out');
        // Next frame, remove fade-out to animate to opacity:1
        requestAnimationFrame(() => {
            // Force a reflow to ensure the class takes effect before removal
            void overlay.offsetHeight;
            overlay.classList.remove('fade-out');
        });
        // Reset button state
        const overlayBtn = document.getElementById('overlayConnectBtn');
        if (overlayBtn) {
            overlayBtn.disabled = false;
            overlayBtn.textContent = 'Connect';
        }
    } catch (_) {}
}

// Show a large pulsing power icon overlay (for disconnect countdown)
function showPowerOverlay() {
    try {
        let overlay = document.getElementById('powerOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'powerOverlay';
            overlay.innerHTML = '<div class="power-icon" aria-hidden="true">⏻</div>';
            document.body.appendChild(overlay);
        }
        // Ensure visible and fade-in
        overlay.style.display = 'grid';
        if (!overlay.classList.contains('fade-out')) {
            // ensure from hidden state
            overlay.classList.add('fade-out');
        }
        requestAnimationFrame(() => {
            void overlay.offsetHeight;
            overlay.classList.remove('fade-out');
        });
    } catch (_) {}
}

// Hide the power overlay with fade-out
function hidePowerOverlay() {
    try {
        const overlay = document.getElementById('powerOverlay');
        if (!overlay) return;
        if (overlay.style.display === 'none') return;
        if (!overlay.classList.contains('fade-out')) {
            overlay.classList.add('fade-out');
        }
        overlay.addEventListener('transitionend', () => {
            overlay.style.display = 'none';
        }, { once: true });
    } catch (_) {}
}

// MCP client - makes HTTP calls to /mcp (intercepted by service worker)
async function mcpCall(method, params) {
    try {
        const response = await fetch('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 
                id: ++counter, 
                method, 
                params 
            })
        });
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
            const text = await response.text();
            const sample = text.slice(0, 120).replace(/\s+/g, ' ');
            throw new Error(`Non-JSON MCP response (ct=${ct || 'unknown'}): ${sample}`);
        }
        return await response.json();
    } catch (error) {
        log('MCP call error: ' + error.message);
        throw error;
    }
}

// Load assistant prompt (Markdown) from file
async function loadPrompt() {
    if (promptText) return promptText;
    try {
        const res = await fetch('prompt.md', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        promptText = await res.text();
        log(`Loaded prompt.md (${promptText.length} chars)`);
        return promptText;
    } catch (e) {
        log('Failed to load prompt.md: ' + e.message);
        throw e;
    }
}

// Handle service worker messages (MCP broadcasts)
function setupServiceWorkerMessaging() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            const outEl = document.getElementById('out');
            const now = new Date(event.data.timestamp || Date.now()).toLocaleTimeString();
            if (event.data.type === 'ui.alert') {
                const text = String(event.data.text || 'Alert');
                try { alert(text); } catch (_) { console.log('ALERT:', text); }
                if (outEl) {
                    outEl.textContent += `[${now}] ALERT: ${text}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            } else if (event.data.type === 'webhook.post') {
                const url = event.data.url || '[no-url]';
                const k = typeof event.data.payloadKeys === 'number' ? event.data.payloadKeys : '?';
                const note = event.data.note ? ` (${event.data.note})` : '';
                log(`[webhook] POST -> ${url} keys=${k}${note}`);
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: webhook.post -> ${url} (keys=${k})${note}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            } else if (event.data.type === 'webhook.post.result') {
                const url = event.data.url || '[no-url]';
                const status = typeof event.data.status === 'number' ? event.data.status : undefined;
                const ok = (typeof event.data.ok === 'boolean') ? event.data.ok : undefined;
                const err = event.data.error;
                if (typeof status !== 'undefined') {
                    log(`[webhook] Result url=${url} status=${status} ok=${ok}`);
                    if (outEl) {
                        outEl.textContent += `[${now}] MCP Broadcast: webhook.result -> ${url} status=${status} ok=${ok}\n`;
                        outEl.scrollTop = outEl.scrollHeight;
                    }
                } else if (err) {
                    log(`[webhook] Error url=${url} error=${err}`);
                    if (outEl) {
                        outEl.textContent += `[${now}] MCP Broadcast: webhook.error -> ${url} error=${err}\n`;
                        outEl.scrollTop = outEl.scrollHeight;
                    }
                }
            } else if (event.data.type === 'eyes.set_mood') {
                const mood = event.data.mood || 'neutral';
                log('MCP set mood broadcast: ' + mood);
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: eyes.set_mood -> ${mood}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
                if (activeFace && typeof activeFace.setMood === 'function') {
                    activeFace.setMood(mood);
                    if (typeof activeFace.startAnimations === 'function') activeFace.startAnimations();
                }
            } else if (event.data.type === 'face.set') {
                const name = event.data.name || 'baxter';
                log('MCP face set broadcast: ' + name);
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: face.set -> ${name}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
                switchFace(name);
            } else if (event.data.type === 'ui.panels.set') {
                const v = !!event.data.visible;
                setPanelsVisible(v);
                log(`[ui] panels.set -> visible=${v}`);
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: ui.panels.set -> visible=${v}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            } else if (event.data.type === 'ui.panels.toggle') {
                const nowVisible = togglePanels();
                log(`[ui] panels.toggle -> visible=${nowVisible}`);
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: ui.panels.toggle -> visible=${nowVisible}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            } else if (event.data.type === 'voice.disconnect') {
                log('[mcp] voice.disconnect broadcast received');
                // Perform local disconnect
                disconnectVoice();
                if (outEl) {
                    outEl.textContent += `[${now}] MCP Broadcast: voice.disconnect\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            }
        });
    }
}

// Register service worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            log('Service Worker registered successfully');
            // Wait until the service worker is active and controlling the page
            const ready = await navigator.serviceWorker.ready;
            const hasController = !!navigator.serviceWorker.controller;
            log('Service Worker ready. Controlling: ' + hasController);
            try {
                const badge = document.getElementById('debugStatus');
                if (badge) {
                    // If previous runs replaced the contents, rebuild the tokens layout once
                    if (!document.getElementById('tokenIn')) {
                        const last = tokenUsage?.last || { input: 0, output: 0, total: 0 };
                        const costs = computeCost(Number(last.input) || 0, Number(last.output) || 0);
                        const costText = formatUSD(costs.total);
                        badge.innerHTML = `Tokens: In <span id="tokenIn">${last.input || 0}</span> · Out <span id="tokenOut">${last.output || 0}</span> · Tot <span id="tokenTotal">${last.total || 0}</span> · Cost <span id="tokenCost">${costText}</span>`;
                        // Ensure any subsequent updates keep working
                        try { setTokenBadge(last.total || 0, { input: last.input || 0, output: last.output || 0 }); } catch (_) {}
                    }
                    // Append or update a small SW status badge without destroying children
                    let swEl = document.getElementById('swStatus');
                    if (!swEl) {
                        const sep = document.createTextNode(' · ');
                        swEl = document.createElement('span');
                        swEl.id = 'swStatus';
                        swEl.style.marginLeft = '4px';
                        badge.appendChild(sep);
                        badge.appendChild(swEl);
                    }
                    swEl.textContent = hasController ? 'SW:on' : 'SW:off';
                }
            } catch (_) {}
            // If the SW isn't controlling yet, force a one-time reload to take control
            try {
                if (!hasController && !sessionStorage.getItem('swForceReload')) {
                    sessionStorage.setItem('swForceReload', '1');
                    log('Reloading once to let Service Worker take control');
                    setTimeout(() => window.location.reload(), 50);
                } else if (hasController) {
                    sessionStorage.removeItem('swForceReload');
                }
            } catch (_) {}
            return registration;
        } catch (error) {
            log('Service Worker registration failed: ' + error.message);
            throw error;
        }
    } else {
        throw new Error('Service Worker not supported');
    }
}

// Validate API key format
function validateApiKey(apiKey) {
    if (!apiKey) {
        throw new Error('Please enter your OpenAI API key');
    }
    if (!apiKey.startsWith('sk-')) {
        throw new Error('API key should start with "sk-"');
    }
    return apiKey;
}

// Test API key validity before connecting
async function testApiKey(apiKey) {
    try {
        log('Testing API key validity...');
        
        // Test with a simple API call first
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API key test failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        log('API key is valid');
        return true;
        
    } catch (error) {
        log('API key test failed: ' + error.message);
        throw error;
    }
}

// Connect to OpenAI Realtime API via WebRTC
async function connectToRealtime(apiKey, model) {
    // 1) Get microphone stream
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });

    // 2) Create RTCPeerConnection
    pc = new RTCPeerConnection();

    // 3) Add local mic track
    for (const track of localStream.getAudioTracks()) {
        pc.addTrack(track, localStream);
    }

    // 4) Create a data channel for JSON events
    dc = pc.createDataChannel('oai-events');
    dc.onopen = async () => {
        log('Data channel open');
        // Send session configuration when ready
        let instructions = null;
        try {
            instructions = await loadPrompt();
        } catch (_) {
            // Fallback inline prompt if file missing
            instructions = 'You are a helpful assistant. To set the Baxter eyes expression, call eyes_set_mood with mood one of "neutral", "happy", "sad", or "angry". When the user asks to change or express an emotion, call eyes_set_mood and briefly describe what you did.';
        }

        const sessionConfig = {
            type: 'session.update',
            session: {
                instructions,
                input_audio_transcription: { model: 'whisper-1' },
                // Set the TTS voice for Realtime audio responses
                voice: 'verse',
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                },
                tools: [
                    {
                        type: 'function',
                        name: 'eyes_set_mood',
                        description: 'Set the Baxter eyes expression/mood in the UI',
                        parameters: {
                            type: 'object',
                            properties: {
                                mood: {
                                    type: 'string',
                                    description: 'Desired mood',
                                    enum: ['neutral', 'happy', 'sad', 'angry']
                                }
                            },
                            required: ['mood']
                        }
                    },
                    {
                        type: 'function',
                        name: 'face_set',
                        description: 'Switch visual face theme (baxter|hal|eve)',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: {
                                    type: 'string',
                                    description: 'Face name',
                                    enum: ['baxter', 'hal', 'eve']
                                }
                            },
                            required: ['name']
                        }
                    },
                    {
                        type: 'function',
                        name: 'ui_panels_set',
                        description: 'Show or hide debug panels (like gear button)',
                        parameters: {
                            type: 'object',
                            properties: {
                                visible: {
                                    type: 'boolean',
                                    description: 'true to show panels; false to hide'
                                }
                            },
                            required: ['visible']
                        }
                    },
                    {
                        type: 'function',
                        name: 'ui_panels_toggle',
                        description: 'Toggle debug panels (like gear button)',
                        parameters: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        type: 'function',
                        name: 'voice_disconnect',
                        description: 'Disconnect the active voice session',
                        parameters: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        type: 'function',
                        name: 'webhook_post',
                        description: 'POST a JSON payload to an external webhook',
                        parameters: {
                            type: 'object',
                            properties: {
                                payload: { type: 'object', description: 'JSON payload to send' },
                                url: { type: 'string', description: 'Optional webhook URL override' }
                            },
                            required: ['payload']
                        }
                    }
                ]
            }
        };
        dc.send(JSON.stringify(sessionConfig));
        log('Sent session configuration over data channel');
    };
    dc.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            await handleRealtimeMessage(message);
        } catch (error) {
            // Ignore non-JSON messages
        }
    };
    dc.onerror = (e) => log('Data channel error');

    // 5) Remote audio track playback
    pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteAudioEl) {
            remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.playsInline = true;
            remoteAudioEl.style.display = 'none';
            document.body.appendChild(remoteAudioEl);
        }
        remoteAudioEl.srcObject = remoteStream;
        remoteAudioEl.play().catch(() => {});
        log('Attached remote audio stream');
    };

    // 6) Create SDP offer, wait ICE gather complete, POST to OpenAI, set remote answer
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const check = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', check);
    });

    const sdp = pc.localDescription.sdp;
    const resp = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/sdp',
                'OpenAI-Beta': 'realtime=v1'
            },
            body: sdp
        }
    );
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`WebRTC SDP exchange failed: ${resp.status} ${resp.statusText} - ${body}`);
    }
    const answerSDP = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSDP });
    log('Connected to OpenAI Realtime API via WebRTC');
}

// Handle messages from Realtime API
async function handleRealtimeMessage(message) {
    // Log all message types for debugging
    log(`Received: ${message.type}`);
    
    if (message.type === 'error') {
        log('Realtime API error: ' + JSON.stringify(message.error));
        
        // Provide specific guidance for common errors
        if (message.error?.code === 'missing_required_parameter') {
            log('Parameter error - this might be due to API version differences');
        } else if (message.error?.code === 'invalid_request_error') {
            log('Request format error - checking OpenAI API documentation for correct format');
        }
        return;
    }
    
    if (message.type === 'session.created') {
        const sid = message.session?.id || message.session_id || '[unknown-session-id]';
        log('Session created successfully. Session ID: ' + sid);
        return;
    }
    
    if (message.type === 'session.updated') {
        log('Session updated with tools - ready for voice input!');
        return;
    }
    
    // Handle function calls - based on the agents-js implementation
    if (message.type === 'response.function_call_arguments.done') {
        const callId = message.call_id;
        const name = message.name;
        
        try {
            const args = JSON.parse(message.arguments);
            // Append to Output panel for any tool call
            try {
                const outEl = document.getElementById('out');
                if (outEl) {
                    const ts = new Date().toLocaleTimeString();
                    let snippet = '';
                    try { snippet = JSON.stringify(args); } catch (_) { snippet = String(message.arguments || ''); }
                    if (snippet.length > 160) snippet = snippet.slice(0, 160) + '…';
                    outEl.textContent += `[${ts}] TOOL CALL: ${name} ${snippet}\n`;
                    outEl.scrollTop = outEl.scrollHeight;
                }
            } catch (_) {}

            if (name === 'eyes_set_mood') {
                const mood = (args.mood || 'neutral');
                log(`Function call: eyes_set_mood(${mood})`);

                // Apply locally
                if (activeFace && typeof activeFace.setMood === 'function') {
                    activeFace.setMood(mood);
                    if (typeof activeFace.startAnimations === 'function') activeFace.startAnimations();
                }

                // Call MCP endpoint to broadcast
                try {
                    const result = await mcpCall('eyes.set_mood', { mood });
                    log('MCP eyes.set_mood result: ' + JSON.stringify(result));
                } catch (error) {
                    log('MCP eyes.set_mood failed: ' + error.message);
                }

                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, mood, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent eyes_set_mood function call output');

                // Trigger natural language confirmation if needed
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            } else if (name === 'face_set') {
                const faceName = (args.name || 'baxter');
                log(`Function call: face_set(${faceName})`);

                // Apply locally
                switchFace(faceName);

                // Broadcast via MCP
                try {
                    const result = await mcpCall('face.set', { name: faceName });
                    log('MCP face.set result: ' + JSON.stringify(result));
                } catch (error) {
                    log('MCP face.set failed: ' + error.message);
                }

                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, name: faceName, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent face_set function call output');

                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            } else if (name === 'ui_panels_set') {
                const visible = !!args.visible;
                log(`Function call: ui_panels_set(visible=${visible})`);
                // Apply locally (idempotent)
                setPanelsVisible(visible);
                // Broadcast via MCP
                try {
                    const result = await mcpCall('ui.panels.set', { visible });
                    log('MCP ui.panels.set result: ' + JSON.stringify(result));
                } catch (error) {
                    log('MCP ui.panels.set failed: ' + error.message);
                }
                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, visible, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent ui_panels_set function call output');
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            } else if (name === 'ui_panels_toggle') {
                log('Function call: ui_panels_toggle()');
                // Do not toggle locally to avoid double-toggle; broadcast toggle
                try {
                    const result = await mcpCall('ui.panels.toggle', {});
                    log('MCP ui.panels.toggle result: ' + JSON.stringify(result));
                } catch (error) {
                    log('MCP ui.panels.toggle failed: ' + error.message);
                }
                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent ui_panels_toggle function call output');
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            } else if (name === 'voice_disconnect') {
                log('Function call: voice_disconnect()');
                // Disconnect locally
                await disconnectVoice();
                // Broadcast to other tabs
                try {
                    const result = await mcpCall('voice.disconnect', {});
                    log('MCP voice.disconnect result: ' + JSON.stringify(result));
                } catch (error) {
                    log('MCP voice.disconnect failed: ' + error.message);
                }
                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent voice_disconnect function call output');
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            } else if (name === 'webhook_post') {
                const payload = (args && typeof args.payload === 'object') ? args.payload : {};
                const url = (args && typeof args.url === 'string' && args.url.trim()) ? args.url : undefined;
                const keysCount = Object.keys(payload).length;
                // Resolve effective URL (args.url or WEBHOOK_URL from env)
                let effectiveUrl = url;
                if (!effectiveUrl) {
                    try {
                        const envRes = await mcpCall('env.get', {});
                        const envUrl = envRes?.result?.env?.WEBHOOK_URL;
                        if (typeof envUrl === 'string' && envUrl.trim()) effectiveUrl = envUrl.trim();
                    } catch (e) {}
                }
                // Final fallback: check page globals if env.js is also loaded in the page
                try {
                    if (!effectiveUrl && typeof window !== 'undefined') {
                        const pgUrl = (window.ENV && window.ENV.WEBHOOK_URL) || window.WEBHOOK_URL;
                        if (typeof pgUrl === 'string' && pgUrl.trim()) effectiveUrl = pgUrl.trim();
                    }
                } catch (_) {}
                log(`Function call: webhook_post(url=${effectiveUrl || '[missing]'}, payloadKeys=${keysCount})`);
                // Proactive local log of the target before SW broadcast
                log(`[webhook] Sending POST to ${effectiveUrl || '[missing]'} (keys=${keysCount})`);
                // Also echo to Output panel immediately
                try {
                    const outEl = document.getElementById('out');
                    if (outEl) {
                        const ts = new Date().toLocaleTimeString();
                        outEl.textContent += `[${ts}] TOOL CALL: webhook_post url=${effectiveUrl || '[missing]'} keys=${keysCount}\n`;
                        outEl.scrollTop = outEl.scrollHeight;
                    }
                } catch (_) {}

                const hasController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
                if (!hasController && effectiveUrl) {
                    // Fallback path when SW is not yet controlling: prefer beacon, else no-cors fetch
                    let sentViaBeacon = false;
                    try {
                        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                            const payloadText = JSON.stringify(payload);
                            const blob = new Blob([payloadText], { type: 'application/json' });
                            sentViaBeacon = navigator.sendBeacon(effectiveUrl, blob);
                            log(`[webhook] Beacon ${sentViaBeacon ? 'sent' : 'failed'} url=${effectiveUrl} bytes=${payloadText.length}`);
                            try {
                                const outEl = document.getElementById('out');
                                if (outEl) {
                                    const ts = new Date().toLocaleTimeString();
                                    outEl.textContent += `[${ts}] BEACON: webhook_post -> ${effectiveUrl} (${sentViaBeacon ? 'sent' : 'failed'})\n`;
                                    outEl.scrollTop = outEl.scrollHeight;
                                }
                            } catch (_) {}
                        }
                    } catch (_) {}
                    if (!sentViaBeacon) {
                        try {
                            const resp = await fetch(effectiveUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                mode: 'cors'
                            });
                            log(`[webhook] Direct POST result url=${effectiveUrl} status=${resp.status} ok=${resp.ok}`);
                        } catch (error) {
                            log(`[webhook] Direct POST failed url=${effectiveUrl} error=${error.message}`);
                        }
                    }
                } else {
                    try {
                        const params = effectiveUrl ? { payload, url: effectiveUrl } : (url ? { payload, url } : { payload });
                        const result = await mcpCall('webhook.post', params);
                        log(`MCP webhook.post result (url=${effectiveUrl || url || '[env]'}): ` + JSON.stringify(result));
                    } catch (error) {
                        log(`MCP webhook.post failed (url=${effectiveUrl || url || '[env]'}): ` + error.message);
                    }
                }
                // Send function output back
                const functionOutput = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ success: true, timestamp: new Date().toISOString() })
                    }
                };
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify(functionOutput));
                }
                log('Sent webhook_post function call output');
                if (dc && dc.readyState === 'open') {
                    dc.send(JSON.stringify({ type: 'response.create' }));
                }
            }
        } catch (error) {
            log('Error processing function call: ' + error.message);
            
            // Send error response
            const errorOutput = {
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ 
                        success: false, 
                        error: error.message 
                    })
                }
            };
            if (dc && dc.readyState === 'open') {
                dc.send(JSON.stringify(errorOutput));
            }
        }
    }
    
    // With WebRTC, audio is delivered via remote media track rather than JSON deltas
    
    // Handle text responses from LLM
    if (message.type === 'response.text.delta') {
        if (message.delta) {
            log('LLM text: ' + message.delta);
            console.log('LLM SAID:', message.delta);
        }
    }
    
    if (message.type === 'response.text.done') {
        if (message.text) {
            log('LLM complete text: ' + message.text);
            console.log('LLM COMPLETE:', message.text);
        }
    }
    
    // Handle conversation flow with detailed logging
    if (message.type === 'conversation.item.created') {
        log('Conversation item created: ' + message.item?.type);
        console.log('CONVERSATION ITEM:', message.item);
        
        // Log the content of the conversation item
        if (message.item?.content) {
            log('Item content: ' + JSON.stringify(message.item.content));
        }
    }
    
    if (message.type === 'response.created') {
        log('Response created');
        console.log('RESPONSE CREATED:', message);
    }
    
    if (message.type === 'response.done' || message.type === 'response.completed' || message.type === 'response.final') {
        log('Response completed - Status: ' + (message.response?.status || 'unknown'));
        console.log('RESPONSE DONE:', message);
        
        // Log why the response might have completed without content
        if (message.response?.status_details) {
            log('Response status details: ' + JSON.stringify(message.response.status_details));
        }

        // Update token usage from final chunk if provided
        try {
            const usage = message.response?.usage || message.response?.metadata?.usage || message.usage || null;
            if (usage) {
                log('Usage received on final chunk: ' + JSON.stringify(usage));
                updateUsageFromResponse(usage);
            } else {
                log('No usage in final chunk');
            }
        } catch (e) {
            log('Error processing usage: ' + e.message);
        }
    }

    // Fallback: if any message carries a usage object, apply it (once)
    try {
        const anyUsage = message.usage || message.response?.usage || message.response?.metadata?.usage || null;
        if (anyUsage) {
            updateUsageFromResponse(anyUsage);
        }
    } catch (_) {}
    
    if (message.type === 'response.output_item.added') {
        log('Response output item added: ' + message.item?.type);
        console.log('OUTPUT ITEM ADDED:', message.item);
    }
    
    if (message.type === 'response.output_item.done') {
        log('Response output item completed: ' + message.item?.type);
        console.log('OUTPUT ITEM DONE:', message.item);
    }
    
    // Log response content generation
    if (message.type === 'response.content_part.added') {
        log('Response content part added: ' + message.part?.type);
        console.log('CONTENT PART ADDED:', message.part);
    }
    
    if (message.type === 'response.content_part.done') {
        log('Response content part done: ' + message.part?.type);
        console.log('CONTENT PART DONE:', message.part);
    }
    
    if (message.type === 'response.audio_transcript.delta') {
        log('Audio transcript delta: ' + message.delta);
        console.log('AUDIO TRANSCRIPT:', message.delta);
    }
    
    // Handle AI response transcripts
    if (message.type === 'response.output_audio_transcript.delta') {
        const responseText = message.delta || '';
        log('AI Response (delta): "' + responseText + '"');
        console.log('AI SAID (delta):', responseText);
    }
    
    if (message.type === 'response.output_audio_transcript.done') {
        const fullResponse = message.transcript || '';
        log('AI Response (complete): "' + fullResponse + '"');
        console.log('AI SAID (complete):', fullResponse);
        
        // Display in output area
        const outEl = document.getElementById('out');
        const timestamp = new Date().toLocaleTimeString();
        outEl.textContent += `[${timestamp}] AI: ${fullResponse}\n`;
        outEl.scrollTop = outEl.scrollHeight;
    }
    
    if (message.type === 'response.audio_transcript.done') {
        log('Audio transcript complete: ' + message.transcript);
        console.log('COMPLETE AUDIO TRANSCRIPT:', message.transcript);
    }
    
    // Handle input audio buffer events
    // With WebRTC + server VAD, input buffer commit events are not used
    
    // Handle transcription events
    if (message.type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = message.transcript || '';
        log('Transcript: "' + transcript + '"');
        console.log('USER SAID:', transcript);
    }
    
    if (message.type === 'conversation.item.input_audio_transcription.failed') {
        log('Transcription failed: ' + (message.error?.message || 'Unknown error'));
        console.log('TRANSCRIPTION FAILED:', message.error);
    }
}

// With WebRTC, audio is streamed via the peer connection. No manual PCM encoding/playback needed.

// Retrieve saved API key from localStorage
function getSavedApiKey() {
    try {
        return localStorage.getItem('openai_api_key') || '';
    } catch (_) {
        return '';
    }
}

// Save API key to localStorage for future use
function saveApiKey(apiKey) {
    try {
        localStorage.setItem('openai_api_key', apiKey);
    } catch (_) {
        // Best-effort only; continue without persistence
    }
}

// Clear saved API key
function clearSavedApiKey() {
    try {
        localStorage.removeItem('openai_api_key');
    } catch (_) {}
}

// Prompt user for an API key (with simple validation)
async function promptForApiKey(existingMessage) {
    const message = existingMessage || 'Enter your OpenAI API key (starts with sk-):';
    const entered = window.prompt(message, '');
    if (!entered) {
        throw new Error('OpenAI API key is required to start voice');
    }
    const validated = validateApiKey(entered.trim());
    await testApiKey(validated);
    saveApiKey(validated);
    return validated;
}

// Start voice session
async function startVoice() {
    try {
        log('Starting voice session...');
        // Optimistically disable overlay button if present
        const overlayBtn = document.getElementById('overlayConnectBtn');
        if (overlayBtn) {
            overlayBtn.disabled = true;
            overlayBtn.textContent = 'Connecting...';
        }
        // Reset token/debug counters for this session
        resetTokenCounter();
        // Resolve API key: load saved, else prompt and save
        let apiKey = getSavedApiKey();
        if (!apiKey) {
            log('No saved API key found; prompting user');
            apiKey = await promptForApiKey();
            log('API key saved for future use');
        } else {
            // Validate and test saved key before use
            apiKey = validateApiKey(apiKey);
            try {
                await testApiKey(apiKey);
            } catch (err) {
                log('Saved API key failed validation/test: ' + err.message);
                clearSavedApiKey();
                apiKey = await promptForApiKey('Saved API key invalid. Enter a new OpenAI API key:');
                log('Replaced saved API key after validation');
            }
        }

        const model = 'gpt-realtime';
        
        log(`Using model: ${model}`);
        
        // Connect to Realtime API via WebRTC
        await connectToRealtime(apiKey, model);
        
        // Start recording
        isRecording = true;
        log('Started audio recording');
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('startBtn').textContent = 'Voice Active - Say "print hello world"';
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        // Fade out overlay on successful connect
        hideConnectOverlayWithFade();
        log('Voice session started successfully');
        
    } catch (error) {
        log('Error starting voice session: ' + error.message);
        
        // Reset button state on error
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Connect';
        }
        const overlayBtn = document.getElementById('overlayConnectBtn');
        if (overlayBtn) {
            overlayBtn.disabled = false;
            overlayBtn.textContent = 'Connect';
        }
        
        // Provide user-friendly error message
        let userMessage = 'Error: ' + error.message;
        if (error.message.includes('401') || error.message.includes('authentication')) {
            userMessage = 'Invalid API key. Please check your OpenAI API key and try again.';
            // Clear invalid saved key and offer immediate retry
            clearSavedApiKey();
            try {
                if (window.confirm('Invalid API key. Enter a new key now?')) {
                    const newKey = await promptForApiKey('Enter your OpenAI API key (starts with sk-):');
                    // Retry once with new key
                    await connectToRealtime(newKey, 'gpt-realtime');
                    isRecording = true;
                    const startBtn2 = document.getElementById('startBtn');
                    if (startBtn2) {
                        startBtn2.disabled = true;
                        startBtn2.textContent = 'Voice Active - Say "print hello world"';
                    }
                    const disconnectBtn2 = document.getElementById('disconnectBtn');
                    if (disconnectBtn2) disconnectBtn2.style.display = 'inline-block';
                    hideConnectOverlayWithFade();
                    log('Voice session started successfully after re-entering key');
                    return; // exit catch after successful retry
                }
            } catch (retryErr) {
                log('Retry after re-entering key failed: ' + retryErr.message);
            }
        } else if (error.message.includes('403') || error.message.includes('permission')) {
            userMessage = 'API key does not have access to Realtime API. Please check your OpenAI account permissions.';
        } else if (error.message.includes('network') || error.message.includes('connection')) {
            userMessage = 'Network connection failed. Please check your internet connection.';
        }
        
        alert(userMessage);
    }
}

// Initialize app
async function init() {
    try {
        await registerServiceWorker();
        setupServiceWorkerMessaging();
        
        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.addEventListener('click', startVoice);
        const overlayBtn = document.getElementById('overlayConnectBtn');
        if (overlayBtn) overlayBtn.addEventListener('click', startVoice);
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectVoice);
        log('App initialized successfully');
        log('Enter your OpenAI API key and click "Connect"');
        
    } catch (error) {
        log('Initialization error: ' + error.message);
        alert('Initialization failed: ' + error.message);
    }
}

// Start when page loads
document.addEventListener('DOMContentLoaded', () => {
    init();
    // Initialize faces but do not render both simultaneously
    baxterFace = new BaxterEyes('eyesCanvas');
    halFace = new HalEye('eyesCanvas');
    eveFace = new EveEyes('eyesCanvas');
    switchFace('baxter');

    // Background click cycles face/themes. Ignore clicks on UI panels/controls.
    document.body.addEventListener('click', (e) => {
        const ignore = e.target.closest('.top-content, button, pre, textarea, input, a');
        const tgt = (e.target && e.target.tagName) ? e.target.tagName : '[unknown]';
        const cls = (e.target && e.target.className) ? ('' + e.target.className) : '';
        log(`[faces] body click: target=${tgt} class="${cls}" ignore=${!!ignore}`);
        if (!ignore) {
            // If SW is not controlling yet, skip broadcast to avoid HTML errors
            const hasController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
            log('[faces] SW controller present: ' + hasController);
            cycleFace();
        }
    });
    log('[faces] background click handler attached');

    // Gear button toggles minimal UI (hide panels, keep face and gear visible)
    const gearBtn = document.getElementById('gearBtn');
    if (gearBtn) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // don't propagate to body (face cycle)
            const enabled = document.body.classList.toggle('minimal-ui');
            const visible = !enabled;
            log(`[ui] minimal-ui ${enabled ? 'enabled' : 'disabled'}`);
            // Broadcast MCP so other tabs sync
            const hasController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
            if (hasController) {
                mcpCall('ui.panels.set', { visible })
                    .then(res => log(`[ui] panels.set broadcast ok: ${JSON.stringify(res)}`))
                    .catch(err => log(`[ui] panels.set broadcast error: ${err?.message || err}`));
            }
        });
    }
});

// Helpers for panels visibility
function setPanelsVisible(visible) {
    try {
        const has = document.body.classList.contains('minimal-ui');
        if (visible && has) document.body.classList.remove('minimal-ui');
        if (!visible && !has) document.body.classList.add('minimal-ui');
        return visible;
    } catch (_) { return visible; }
}
function togglePanels() {
    try {
        const nowHidden = document.body.classList.toggle('minimal-ui');
        return !nowHidden;
    } catch (_) { return true; }
}

// Disconnect logic
async function disconnectVoice() {
    try {
        log('Disconnecting voice session...');
        // Show pulsing power icon before the 5s delay
        showPowerOverlay();
        isRecording = false;
        // Close data channel
        try {
            if (dc) {
                dc.onopen = null;
                dc.onmessage = null;
                dc.onerror = null;
                if (dc.readyState === 'open' || dc.readyState === 'connecting' || dc.readyState === 'closing') {
                    dc.close();
                }
            }
        } catch (_) {}
        dc = null;

        // Stop local media tracks
        try {
            if (localStream) {
                for (const track of localStream.getTracks()) {
                    try { track.stop(); } catch (_) {}
                }
            }
        } catch (_) {}
        localStream = null;

        // Allow a short delay so the tail end of any
        // remote TTS/audio can finish playing before teardown.
        // A few seconds is requested by UX.
        try {
            await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (_) {}
        // Fade out/remove the power overlay after the delay
        hidePowerOverlay();

        // Stop remote audio
        try {
            if (remoteAudioEl) {
                remoteAudioEl.pause();
                remoteAudioEl.srcObject = null;
            }
        } catch (_) {}

        // Close peer connection
        try {
            if (pc) {
                pc.ontrack = null;
                pc.close();
            }
        } catch (_) {}
        pc = null;

        // Update UI
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = 'Connect';
        }
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        const overlayBtn = document.getElementById('overlayConnectBtn');
        if (overlayBtn) {
            overlayBtn.disabled = false;
            overlayBtn.textContent = 'Connect';
        }
        // Show overlay again with a fade-in for a prominent reconnect
        showConnectOverlayWithFade();
        log('Voice session disconnected');
    } catch (error) {
        log('Error during disconnect: ' + error.message);
        try { hidePowerOverlay(); } catch (_) {}
    }
}
