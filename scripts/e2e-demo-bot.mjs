// Turns the "MAX trigger e2e" workflow into a live demo bot:
//   message from a person → echo reply with callback buttons (reply link)
//   button press         → Answer Callback: notification + message updated
//   bot added to a group → greeting with the chat ID
import { api, botToken, ensureCredential, login } from './lib.mjs';

await login();
const domain = process.env.DOMAIN ?? 'auto';
const cred = await ensureCredential(`MAX e2e ${domain}`, { accessToken: botToken(), baseUrl: domain, ignoreSslIssues: false });
const wf = (await api('GET', '/rest/workflows')).json.data.find((w) => w.name === 'MAX trigger e2e');
const full = (await api('GET', `/rest/workflows/${wf.id}`)).json.data;
const trigger = full.nodes.find((n) => n.type.endsWith('maxTrigger'));
const max = (name, parameters, position) => ({ name, type: 'n8n-nodes-max-messenger.max', typeVersion: 1, position, parameters, credentials: { maxBotApi: cred } });
const buttons = { button: [
	{ row: 1, type: 'callback', text: 'Yes', payload: 'yes' },
	{ row: 1, type: 'callback', text: 'No', payload: 'no' },
	{ row: 2, type: 'link', text: 'n8n', url: 'https://n8n.io' },
] };
const nodes = [
	trigger,
	{ name: 'Route', type: 'n8n-nodes-base.switch', typeVersion: 3, position: [250, 0], parameters: {
		mode: 'expression', numberOutputs: 4,
		output: "={{ $json.update_type === 'message_callback' ? 0 : ($json.update_type === 'message_created' && !$json.message.sender.is_bot ? 1 : ($json.update_type === 'bot_added' ? 2 : 3)) }}",
	} },
	max('Answer button', {
		resource: 'message', operation: 'answerCallback', callbackId: '={{ $json.callback.callback_id }}',
		notification: "=You pressed {{ $json.callback.payload }}", updateMessage: true,
		text: "=You chose: **{{ $json.callback.payload }}** (press again to change)", format: 'markdown',
		attachmentsMode: 'replace', keyboard: 'buttons', buttons,
	}, [500, -200]),
	max('Echo', {
		resource: 'message', operation: 'send', sendTo: 'chat', chatId: '={{ $json.message.recipient.chat_id }}',
		text: "=Echo: {{ $json.message.body.text || '(no text)' }}\nchat_id={{ $json.message.recipient.chat_id }}, attachments={{ ($json.message.body.attachments || []).map(a => a.type).join(',') || 'none' }}",
		format: 'plain', keyboard: 'buttons', buttons, options: { replyToMessageId: '={{ $json.message.body.mid }}' },
	}, [500, 0]),
	max('Greet group', {
		resource: 'message', operation: 'send', sendTo: 'chat', chatId: '={{ $json.chat_id }}',
		text: "=Hi! I am the n8n MAX test bot. chat_id={{ $json.chat_id }}", format: 'plain', keyboard: 'none',
	}, [500, 200]),
];
const connections = {
	[trigger.name]: { main: [[{ node: 'Route', type: 'main', index: 0 }]] },
	Route: { main: [[{ node: 'Answer button', type: 'main', index: 0 }], [{ node: 'Echo', type: 'main', index: 0 }], [{ node: 'Greet group', type: 'main', index: 0 }], []] },
};
await api('POST', `/rest/workflows/${wf.id}/deactivate`, {});
const saved = await api('PATCH', `/rest/workflows/${wf.id}`, { ...full, nodes, connections });
const act = await api('POST', `/rest/workflows/${wf.id}/activate`, { versionId: saved.json?.data?.versionId });
console.log('saved', saved.status, 'activated', act.status, JSON.stringify(act.json).slice(0, 120));
const after = (await api('GET', `/rest/workflows/${wf.id}`)).json.data;
console.log('staticData keys', JSON.stringify(Object.keys(after.staticData?.['node:' + trigger.name] ?? {})));
