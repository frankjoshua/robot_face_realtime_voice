# GitHub Copilot Agent Instructions

## DeepWiki Integration Guidelines

This project uses DeepWiki MCP (Model Context Protocol) for accessing comprehensive documentation and code examples from GitHub repositories. Follow these guidelines when assisting with development:

### When to Use DeepWiki

Use DeepWiki in the following scenarios:

1. **API Documentation Research**
   - When users ask about implementing features from specific GitHub repositories
   - When official documentation is needed for proper implementation patterns
   - When looking up correct API usage, parameter formats, or configuration options

2. **Best Practices Investigation**
   - When users need to understand the "right way" to implement something
   - When troubleshooting implementation issues that might be documented
   - When looking for official examples or patterns from the source repository

3. **API Error Resolution**
   - When encountering "invalid_request_error" or "unknown_parameter" errors
   - When API responses indicate missing required parameters or incorrect formats
   - When session configuration or WebSocket connection errors occur
   - Research correct parameter names, formats, and required fields

4. **OpenAI Realtime API Implementation**
   - Use `openai/openai-agents-js` repository for official patterns
   - Look up session configuration, WebSocket handling, audio processing
   - Find correct parameter formats and event handling patterns

4. **Model Context Protocol (MCP) Implementation**
   - Research official MCP specifications and implementations
   - Look up proper JSON-RPC protocol handling
   - Find tool execution and capability discovery patterns

### DeepWiki Commands to Use

#### Repository Structure Exploration
```markdown
Use `mcp_deepwiki_read_wiki_structure` to get an overview of available documentation topics:
- Parameter: `repoName` (format: "owner/repo")
- Example: "openai/openai-agents-js"
```

#### Specific Question Research
```markdown
Use `mcp_deepwiki_ask_question` for targeted information:
- Parameter: `question` - Clear, specific question about implementation
- Parameter: `repoName` - Target repository
- Example question: "How do I implement realtime voice agents with function calling?"
```

#### Full Documentation Reading
```markdown
Use `mcp_deepwiki_read_wiki_contents` to read complete documentation:
- Parameter: `repoName` - Repository to read
- Use when you need comprehensive understanding of a project
```

### Example Usage Patterns

#### For OpenAI Realtime API Issues
```markdown
When a user has Realtime API configuration errors:
1. Use `mcp_deepwiki_ask_question` with `openai/openai-agents-js`
2. Ask specific questions about session configuration, WebSocket setup, or audio handling
3. Apply the official patterns to fix the user's implementation
```

#### For MCP Protocol Implementation
```markdown
When implementing MCP servers or clients:
1. Research the official MCP specification repositories
2. Look up JSON-RPC protocol patterns
3. Find tool execution and capability discovery examples
```

#### For WebRTC/Audio Issues
```markdown
When users have audio processing problems:
1. Search for audio handling patterns in relevant repositories
2. Look up proper PCM conversion, sample rates, and format handling
3. Find official examples of microphone access and WebRTC setup
```

### Guidelines for Effective DeepWiki Usage

1. **Be Specific**: Ask targeted questions rather than broad queries
2. **Use Official Sources**: Prefer official repositories over third-party implementations
3. **Cross-Reference**: Use multiple DeepWiki queries to validate information
4. **Apply Contextually**: Adapt the found patterns to the user's specific use case

### Common Repositories to Reference

- `openai/openai-agents-js` - Official OpenAI Realtime agents implementation
- `modelcontextprotocol/specification` - Official MCP protocol specification
- `microsoft/vscode` - VS Code extension development patterns
- `vercel/next.js` - Next.js implementation patterns
- `vitejs/vite` - Vite build tool configurations

### Integration with Development Workflow

1. **Research First**: Use DeepWiki before suggesting implementation approaches
2. **Validate Patterns**: Cross-check suggestions against official documentation
3. **Provide Context**: Explain why specific patterns are recommended
4. **Update Knowledge**: Use DeepWiki to stay current with API changes and best practices

### Error Resolution Workflow

When users encounter errors:

1. **Identify the Technology**: Determine which repository/project is relevant
2. **Research API Errors**: Use DeepWiki to investigate "invalid_request_error", "unknown_parameter", or "missing_required_parameter" errors
3. **Find Official Solutions**: Look up correct parameter formats, required fields, and valid configuration options
4. **Apply Official Fixes**: Prefer documented solutions over workarounds
5. **Explain the Context**: Help users understand why the solution works

#### Error-Specific Research Patterns

**For OpenAI Realtime API Errors:**
- Research session configuration format and required parameters
- Look up correct event types, parameter names, and data structures
- Find examples of working WebSocket message formats

**For MCP Protocol Errors:**
- Investigate JSON-RPC 2.0 compliance issues
- Research tool definition formats and capability discovery
- Look up proper request/response message structures

**For WebRTC/Audio Errors:**
- Search for audio format specifications and sample rate requirements
- Find microphone access patterns and permission handling
- Research PCM conversion and audio processing examples

### Example Interaction Flow

```
User: "I'm getting session configuration errors with OpenAI Realtime API"

Agent Response:
1. Use DeepWiki to research openai/openai-agents-js session configuration
2. Find the correct session.type values and parameter formats
3. Apply the official patterns to fix the user's implementation
4. Explain the reasoning behind the configuration choices
```

This approach ensures that development assistance is based on authoritative sources and follows official best practices rather than potentially outdated or incorrect information.
