# End-to-end scripts

These scripts drive a real n8n instance (through its internal REST API) that has this package installed, against a real MAX bot. They are not part of the published package.

```bash
export N8N_URL=https://n8n.example.com   # public HTTPS address; MAX calls webhooks on port 443 only
export N8N_E2E_EMAIL=owner@example.com     # owner of that n8n; created on the first run of a fresh instance
export N8N_E2E_PASSWORD='a strong password'
export MAX_TOKEN_FILE=/path/to/bot-token.txt

node scripts/e2e-smoke.mjs                                          # nodes registered, credential test, Bot → Get Info
CHAT_ID=... USER_ID=... [GROUP_ID=...] node scripts/e2e-ops.mjs     # every operation of the MAX node
node scripts/e2e-trigger.mjs                                        # webhook lifecycle of the "MAX trigger e2e" workflow
node scripts/e2e-demo-bot.mjs                                       # turns that workflow into an echo bot with buttons
CHAT_ID=... USER_ID=... BOT_USER_ID=... REPLY_MID=... node scripts/e2e-simulate.mjs # signed and unsigned webhook calls
CHAT_ID=... LLM_KEY_FILE=... LLM_URL=... LLM_MODEL=... node scripts/e2e-agent.mjs  # AI Agent that uses MAX as a tool
```

`e2e-ops.mjs` reads test files from `/home/node/.n8n-files` inside the n8n container (`test-image.png`, `test-video.mp4`, `test-audio.mp3`, `test-document.pdf`, `тест файл.txt`) and, if present, updates the trigger received earlier from `scripts/out/updates.json` (a JSON array of MAX updates; without it the token, sticker and reply tests are skipped).
