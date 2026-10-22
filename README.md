# wifsid

A local English chat. Messages, memory, and the 12-digit access code stay in the browser. The server forwards each prompt to xAI or OpenAI.

## Run

1. Copy `.env.example` to `.env` and set `XAI_API_KEY`, or open the app and save an OpenAI key under API key.
2. Start the server:

```
node server.js
```

3. Open http://127.0.0.1:4173

## What it does

- Access code stored only in this browser
- Twenty agents, including Coder, Researcher, Firmware, Reviewer, and Translator
- Grok, GPT-6, and OpenRouter models: Qwen, Llama, Gemma, DeepSeek, Mistral, and Devstral
- Image models: Grok Imagine, Imagine 2.0, and Imagine Quality
- IDE for files in `workspace`, with save, run, and AI apply
- Optional web search
- Image generation with Grok Imagine
- Local memory and chat history
- Export a chat as JSON

Grok still applies its normal content rules. This app does not remove them.
