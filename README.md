# Fugu Chat

A self-hosted, ChatGPT/Claude/Gemini-style web UI for **Sakana Fugu** — streaming responses, multiple conversations, a model + reasoning-effort picker, markdown & code rendering, and image attachments.

## ⚠️ First, about that API key

The key starting `fish_1122...` appeared twice in what you pasted into our chat — once by accident as an `os.environ[...]` lookup name, once hardcoded directly. Since it's now sitting in this conversation's history, treat it as burned:

1. Rotate it from the Sakana console before using this for anything real.
2. From now on it only ever goes in your local `.env` — never in code, chat, or commits.

This app is built so the key lives **only on the server** and never reaches the browser.

## Setup

```bash
npm install
cp .env.example .env   # then paste your rotated key into .env
npm start
```

Open http://localhost:3000.

## What this is actually talking to

Sakana Fugu is real, and very new — it launched June 22, 2026 (after my training cutoff, so this was all new to me too). It's not one trained chat model; Fugu and Fugu Ultra are themselves models trained to coordinate a pool of other frontier models behind the scenes and return one synthesized answer, all through a single OpenAI-compatible API. Worth knowing going in: the routing between underlying models is Sakana's own black box, so cost and behavior can vary a bit by request in ways you don't control directly.

## How it works

- **`server.js`** — an Express server that serves the frontend and exposes one endpoint, `POST /api/chat`. It uses the official `openai` npm package (pointed at Sakana's `base_url`) to call `/v1/responses` with `stream: true` — Sakana's docs recommend the Responses API over Chat Completions for generation requests — using `SAKANA_API_KEY` from the environment, and relays the stream back to the browser in a small custom format. The key never appears in anything sent to the client.
- **`public/`** — a plain HTML/CSS/JS frontend, no build step: a sidebar of conversations (saved in the browser's `localStorage`), streaming message bubbles, markdown + syntax-highlighted code, image attachments, and model/reasoning-effort selectors.
- **`models.json`** — `fugu`, `fugu-ultra`, and the dated pin `fugu-ultra-20260615`, with the reasoning efforts (`high` / `xhigh`) Sakana documents. Edit this file if Sakana changes the lineup — the UI reads it live.

Confirmed against Sakana's own docs while building this (so these aren't guesses): reasoning effort is sent as a nested `reasoning: {"effort": "high"|"xhigh"|"max"}` object; conversation history is stateless and has to be resent in full every turn, since Sakana doesn't accept a `previous_response_id`; system instructions go in a top-level `instructions` field, separate from the message array.

## One thing I couldn't fully confirm

Image attachments are sent as `{"type": "input_image", "image_url": "<data-uri>"}` inside the input array — my best understanding of the OpenAI Responses API convention Sakana says to follow, but I didn't find Sakana's own docs spelling that exact shape out. If an image attachment errors, check [OpenAI's Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create) and adjust `toResponsesContent()` in `public/app.js`.

## Other things worth knowing

- **Local/single-user by design.** Conversations live in the browser's `localStorage`, no login. If you put this somewhere reachable beyond your own machine, add authentication first — as-is, anyone who can reach it can spend your quota.
- **Fugu Ultra costs more per token than Fugu**, and Sakana offers both subscription and pay-as-you-go plans — check current pricing at console.sakana.ai before leaving this running unattended.
- **Your Codex config** (`~/.codex/config.toml`, `fugu.json`) is separate from this app and still valid for pointing Codex at Sakana — just make sure it gets the rotated key too, not the one from this conversation.
