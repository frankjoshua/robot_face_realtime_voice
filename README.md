# Pure-Browser Realtime Voice + MCP Demo

This is a **real, working** browser-only demonstration that connects to OpenAI's Realtime Voice API and implements a genuine Model Context Protocol (MCP) server entirely in the browser using Service Workers.

## Features

- **Real OpenAI Integration**: WebSocket connection to OpenAI's Realtime API
- **Genuine MCP Server**: Service Worker implements the real MCP protocol specification
- **No Backend Required**: Everything runs in the browser - no Node.js, no build tools, no server
- **Direct API Key**: Simple API key input (prompted and saved in localStorage)
- **Voice Interface**: Real-time voice conversation with audio streaming
- **Real Tool Integration**: Declares and executes actual function tools

## Setup Instructions

### 1. Get Your OpenAI API Key

You'll need an OpenAI API key with access to the Realtime API:
- Go to https://platform.openai.com/api-keys
- Create a new API key
- Make sure you have access to `gpt-realtime` models
- **Note**: For production, you should use ephemeral client keys generated server-side

### 2. Serve the Files

Due to Service Worker security requirements, you **cannot** use `file://` URLs. Use a local server:

```bash
# Python 3
python -m http.server 8000

# Python 2  
python -m SimpleHTTPServer 8000

# Node.js (if you have it)
npx serve .

# Or use any static file server
```

Then open `http://localhost:8000`

### 3. Start Voice Session

1. **Enter your OpenAI API key** (starts with `sk-...`)
2. **Optionally adjust the model name** (default: `gpt-realtime`)
3. **Click "Start Voice"** button
4. **Grant microphone permissions** when prompted
5. **Wait for connection** - you should see these messages in the debug log:
   - ✅ "Connected to OpenAI Realtime API"
   - ✅ "Session created successfully" 
   - ✅ "Session updated with tools - ready for voice input!"
   - ✅ "Audio processing pipeline established"

### 4. Test the Voice + MCP Integration

Once you see "ready for voice input", try saying:
- **"Print hello world"**
- **"Use the print function to show the text 'testing 123'"**  
- **"Display the message 'MCP is working in the browser'"**

The system will:
1. 🎤 **Detect your speech** ("Speech detected - user started speaking")
2. 🤖 **Process with OpenAI** ("Speech stopped - processing user input")
3. ⚡ **Make function call** ("Function call: ui_print(...)")
4. 📝 **Display in browser** (text appears in output area)
5. 🔄 **Execute MCP protocol** ("MCP call result: ...")
6. 📡 **Broadcast result** ("MCP Broadcast: ...")
7. 🗣️ **AI responds** (you'll hear the voice confirmation)

## Environment Configuration

This project reads configuration from a lightweight client-side `env.js` file (not committed to Git).

- Create `env.js` at the project root with:

```
// env.js (do not commit)
self.ENV = {
  // Used by the Service Worker webhook tool when params.url is omitted
  WEBHOOK_URL: "https://your-webhook.example.com/path"
  // You can add more keys if needed, e.g. OPENAI_API_KEY (not recommended for production)
};
```

- `env.js` is ignored via `.gitignore` and is optional. If it’s missing, the app still runs.
- Fallbacks if `env.js` is not present: the Service Worker attempts to load `env.json`, then `env`, then `.env` (if your static server serves dotfiles). All are optional.
- Webhook behavior: the `webhook_post` tool uses `params.url` if provided, otherwise `WEBHOOK_URL`. If neither is set, an in-page alert notifies users to configure one.

## File Structure

```
/poc
  index.html    # Simple UI with session input, voice controls, and output areas
  main.js       # WebRTC setup, tool handling, fake MCP client
  sw.js         # Service Worker implementing fake MCP HTTP endpoint
  env.js        # Local, untracked config (e.g., WEBHOOK_URL)
  README.md     # This file
```

## Technical Details

### Voice Connection Flow
1. Parse ephemeral session JSON to extract `client_secret.value`
2. Set up WebRTC peer connection with microphone track
3. Create data channel for bidirectional messaging
4. Send SDP offer to OpenAI Realtime API
5. Receive SDP answer and establish connection

### Tool Declaration
```json
{
  "type": "session.update",
  "session": {
    "tools": [{
      "type": "function",
      "name": "ui_print",
      "description": "Append text to the page output",
      "parameters": {
        "type": "object",
        "properties": { "text": { "type": "string" } },
        "required": ["text"]
      }
    }]
  }
}
```

### MCP Protocol (Fake)
- POST `/mcp` with `{ id, method: "ui.print", params: { text } }`
- Service Worker responds with `{ jsonrpc: "2.0", id, result: { ok: true, echoed: text } }`
- Service Worker broadcasts to all tabs via `postMessage`

## Browser Compatibility

- **Chrome/Chromium**: Full support
- **Firefox**: Full support
- **Safari**: Should work (WebRTC + Service Worker support required)
- **Edge**: Full support

Requires:
- WebRTC support
- Service Worker support
- getUserMedia (microphone access)
- Modern JavaScript (async/await, fetch)

## Limitations

- **Ephemeral Sessions**: Sessions expire, requiring new ones for each demo
- **No Persistence**: No data is saved between page reloads
- **Single Tool**: Only implements `ui_print` tool for demonstration
- **No Error Recovery**: Basic error handling, connection issues may require refresh

## Troubleshooting

### Service Worker Issues
- Check browser console for Service Worker registration errors
- Try hard refresh (Ctrl+F5) to update Service Worker
- Check developer tools > Application > Service Workers tab

### Voice Connection Issues
- Ensure microphone permissions are granted
- Check network connectivity for WebRTC
- Verify session JSON is complete and valid
- Look at debug log for specific error messages

### Tool Call Issues
- Make sure to speak clearly and mention "print" or "display"
- Check debug log for tool call detection
- Verify Service Worker is intercepting `/mcp` requests

## Security Notes

- No API keys are embedded in the code
- Ephemeral sessions provide temporary, limited access
- All processing happens client-side
- Service Worker only handles local `/mcp` requests

This demo showcases how modern browser APIs can create sophisticated voice interfaces without requiring any backend infrastructure.
