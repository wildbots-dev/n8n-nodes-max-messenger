// Sends a signed fake update to the active MAX Trigger webhook (secret read from workflow static data)
// and checks that the workflow ran. Also checks that unsigned requests are rejected.
// Env: CHAT_ID, USER_ID (sender), BOT_USER_ID, REPLY_MID (message to reply to).
import { api, login } from './lib.mjs';
await login();
const wf = (await api('GET', '/rest/workflows')).json.data.find((w) => w.name === 'MAX trigger e2e');
const full = (await api('GET', `/rest/workflows/${wf.id}`)).json.data;
const { webhookSecret, webhookUrl } = Object.values(full.staticData ?? {})[0] ?? {};
const update = {
	update_type: 'message_created', timestamp: Date.now(),
	message: { recipient: { chat_type: 'dialog', chat_id: Number(process.env.CHAT_ID), user_id: Number(process.env.BOT_USER_ID) }, timestamp: Date.now(),
		body: { mid: process.env.REPLY_MID, seq: 1, text: 'simulated update (signed)' }, sender: { user_id: Number(process.env.USER_ID), first_name: 'Sim', is_bot: false } },
};
const post = (headers) => fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(update) });
const before = (await api('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&limit=1`)).json.data.results?.[0]?.id;
let r = await post({});
console.log(r.status === 403 ? 'PASS unsigned rejected' : `FAIL unsigned → ${r.status}`);
r = await post({ 'X-Max-Bot-Api-Secret': webhookSecret });
console.log(r.status === 200 ? 'PASS signed accepted' : `FAIL signed → ${r.status} ${await r.text()}`);
let latest;
for (let i = 0; i < 20; i++) {
	await new Promise((res) => setTimeout(res, 1500));
	latest = (await api('GET', `/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf.id }))}&limit=1`)).json.data.results?.[0];
	if (latest && latest.id !== before && latest.status !== 'running') break;
}
console.log(latest && latest.id !== before && latest.status === 'success' ? `PASS workflow ran (${latest.id})` : `FAIL execution ${JSON.stringify(latest)}`);
