// AI Agent uses the MAX node as a tool (MAX Tool): reads bot info, then sends a message composed by the model.
// Env: CHAT_ID, LLM_KEY_FILE (API key of an OpenAI-compatible endpoint), LLM_URL, LLM_MODEL.
import { readFileSync } from 'node:fs';
import { api, botToken, ensureCredential, login, runWorkflow } from './lib.mjs';

const CHAT_ID = process.env.CHAT_ID;
await login();
const cred = await ensureCredential('MAX api2 strict', { accessToken: botToken(), baseUrl: 'https://platform-api2.max.ru', ignoreSslIssues: false });
const llmData = { apiKey: readFileSync(process.env.LLM_KEY_FILE, 'utf8').trim(), url: process.env.LLM_URL };
if (!process.env.LLM_URL || !process.env.LLM_MODEL) throw new Error('Set LLM_URL and LLM_MODEL (OpenAI-compatible endpoint and model ID)');
const list = (await api('GET', '/rest/credentials')).json.data;
let llm = list.find((c) => c.name === 'LLM for e2e');
if (!llm) llm = (await api('POST', '/rest/credentials', { name: 'LLM for e2e', type: 'openAiApi', data: llmData })).json.data;
const marker = `agent-${Date.now()}`;
const nodes = [
	{ parameters: {}, name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
	{ parameters: { promptType: 'define', text: `First call the bot info tool to learn the bot's first name. Then send one message to the chat with the text: "${marker}: hello from an AI agent, I am <first name>". Reply with the word done.`, options: {} }, name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3.1, position: [300, 0] },
	{ parameters: { model: { __rl: true, mode: 'id', value: process.env.LLM_MODEL }, options: {} }, name: 'Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.3, position: [300, 200], credentials: { openAiApi: { id: llm.id, name: llm.name } } },
	{ parameters: { resource: 'bot', operation: 'getInfo' }, name: 'Get bot info', type: 'n8n-nodes-max-messenger.maxTool', typeVersion: 1, position: [500, 200], credentials: { maxBotApi: cred } },
	{ parameters: { resource: 'message', operation: 'send', sendTo: 'chat', chatId: CHAT_ID, text: "={{ $fromAI('text', 'Text of the message to send', 'string') }}", format: 'plain', keyboard: 'none' }, name: 'Send MAX message', type: 'n8n-nodes-max-messenger.maxTool', typeVersion: 1, position: [700, 200], credentials: { maxBotApi: cred } },
];
const connections = {
	Start: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] },
	Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
	'Get bot info': { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
	'Send MAX message': { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
};
const r = await runWorkflow('e2e agent', nodes, connections);
console.log('status', r.status, r.error ?? '');
for (const [name, res] of Object.entries(r.results)) console.log(' -', name, res.status, res.error ? JSON.stringify(res.error) : JSON.stringify(res.items?.[0]?.json ?? null).slice(0, 250));
const res = await fetch(`https://platform-api.max.ru/messages?chat_id=${CHAT_ID}&count=5`, { headers: { Authorization: botToken() } });
const recent = (await res.json()).messages ?? [];
const found = recent.find((m) => (m.body?.text ?? '').startsWith(marker));
console.log(found ? `PASS agent sent: ${found.body.text}` : 'FAIL no message from the agent');
if (!found) process.exitCode = 1;
