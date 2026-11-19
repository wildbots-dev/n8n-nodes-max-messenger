// Smoke: node types registered, credential test on both domains, Bot → Get Info.
import { api, botToken, ensureCredential, login, maxNode, runChain, testCredential } from './lib.mjs';

await login();
const types = await api('GET', '/types/nodes.json');
const ours = Array.isArray(types.json) ? types.json.filter((n) => n.name.startsWith('n8n-nodes-max-messenger')) : [];
console.log('registered:', ours.map((n) => `${n.name} (${n.displayName})`).join(', ') || JSON.stringify(types.json).slice(0, 200));

const accessToken = botToken();
const variants = [
	['MAX api2 strict', { accessToken, baseUrl: 'https://platform-api2.max.ru', ignoreSslIssues: false }],
	['MAX api2 ignore-ssl', { accessToken, baseUrl: 'https://platform-api2.max.ru', ignoreSslIssues: true }],
	['MAX legacy', { accessToken, baseUrl: 'https://platform-api.max.ru', ignoreSslIssues: false }],
	['MAX bad token', { accessToken: 'wrong-token', baseUrl: 'https://platform-api.max.ru', ignoreSslIssues: false }],
];
const creds = {};
for (const [name, data] of variants) {
	const cred = await ensureCredential(name, data);
	creds[name] = cred;
	console.log('credential test', name, JSON.stringify(await testCredential(cred, data)));
}

for (const name of Object.keys(creds)) {
	const r = await runChain(`smoke ${name}`, [maxNode('Bot', { resource: 'bot', operation: 'getInfo' }, creds[name])]);
	const bot = r.results.Bot;
	console.log(`getInfo via ${name}:`, r.status, bot?.error ? JSON.stringify(bot.error) : JSON.stringify(bot?.items?.[0]?.json).slice(0, 160));
}
