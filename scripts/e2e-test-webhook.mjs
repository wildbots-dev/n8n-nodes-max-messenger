// "Listen for test event": the trigger registers a test webhook and removes it on cancel.
// With DOMAIN=https://platform-api2.max.ru on a host without the Russian CA the run must fail with the TLS hint.
import { api, botToken, deleteWorkflow, ensureCredential, HOST, login } from './lib.mjs';

await login();
const token = botToken();
const domain = process.env.DOMAIN ?? 'auto';
const subs = async () => (await (await fetch('https://platform-api.max.ru/subscriptions', { headers: { Authorization: token } })).json()).subscriptions ?? [];
const isTest = (s) => s.url.startsWith(`https://${HOST}/webhook-test/`);
const cred = await ensureCredential(`MAX e2e ${domain}`, { accessToken: token, baseUrl: domain, ignoreSslIssues: false });
const nodes = [{ name: 'MAX Trigger', type: 'n8n-nodes-max-messenger.maxTrigger', typeVersion: 1, position: [0, 0], webhookId: crypto.randomUUID(), parameters: { updates: ['message_created'] }, credentials: { maxBotApi: cred } }];
const wf = (await api('POST', '/rest/workflows', { name: 'MAX test-webhook e2e', nodes, connections: {}, settings: { executionOrder: 'v1' } })).json.data;
const run = await api('POST', `/rest/workflows/${wf.id}/run`, { workflowData: wf, triggerToStartFrom: { name: 'MAX Trigger' } });
console.log('run', run.status, JSON.stringify(run.json).slice(0, 300));
let list = [];
for (let i = 0; i < 10; i++) {
	await new Promise((res) => setTimeout(res, 1500));
	list = await subs();
	if (list.some(isTest)) break;
}
console.log(list.some(isTest) ? 'PASS test webhook registered' : 'FAIL test webhook not registered');
await api('DELETE', `/rest/test-webhook/${wf.id}`);
for (let i = 0; i < 15; i++) {
	await new Promise((res) => setTimeout(res, 1500));
	list = await subs();
	if (!list.some(isTest)) break;
}
console.log(!list.some(isTest) ? 'PASS test webhook removed on cancel' : 'FAIL test webhook still there');
await deleteWorkflow(wf.id);
