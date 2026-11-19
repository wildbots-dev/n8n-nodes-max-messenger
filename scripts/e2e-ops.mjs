// End-to-end run of every MAX node operation against the real Bot API through a real n8n.
// Env: CHAT_ID (dialog or group), USER_ID (user who started the bot), CRED (credential name).
import { readFileSync, writeFileSync } from 'node:fs';
import { botToken, ensureCredential, login, maxNode, runChain } from './lib.mjs';

const CHAT_ID = process.env.CHAT_ID;
const USER_ID = process.env.USER_ID;
const GROUP_ID = process.env.GROUP_ID;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
if (!CHAT_ID || !USER_ID) throw new Error('CHAT_ID and USER_ID are required');

await login();
// DOMAIN: auto (default), https://platform-api2.max.ru or https://platform-api.max.ru
const DOMAIN = process.env.DOMAIN ?? 'auto';
const cred = await ensureCredential(`MAX e2e ${DOMAIN}`, { accessToken: botToken(), baseUrl: DOMAIN, ignoreSslIssues: false });

const FILES = '/home/node/.n8n-files';
const readFile = (name, file, field = 'data') => ({
	name,
	type: 'n8n-nodes-base.readWriteFile',
	typeVersion: 1,
	parameters: { operation: 'read', fileSelector: `${FILES}/${file}`, options: { dataPropertyName: field } },
});
/** Updates received by the trigger earlier (saved by hand to scripts/out/updates.json); optional. */
let updates = [];
try {
	updates = JSON.parse(readFileSync(new URL('./out/updates.json', import.meta.url), 'utf8'));
} catch {
	console.log('scripts/out/updates.json not found: token, sticker and reply tests are skipped');
}
const userImage = updates
	.flatMap((u) => u.message?.body?.attachments ?? [])
	.find((a) => a.type === 'image')?.payload?.token;
const userSticker = updates
	.flatMap((u) => u.message?.body?.attachments ?? [])
	.find((a) => a.type === 'sticker')?.payload?.code;
const userTextMid = updates.find((u) => u.message?.body?.text === 'Тест')?.message?.body?.mid;

const state = {};
const report = [];

const send = (extra) => ({ resource: 'message', operation: 'send', sendTo: 'chat', chatId: CHAT_ID, ...extra });

async function check(name, chain, expect) {
	if (ONLY && !ONLY.test(name)) return;
	const r = await runChain(`e2e ${name}`, chain);
	const last = chain[chain.length - 1].name;
	const res = r.results[last];
	let ok = false;
	let note = '';
	try {
		const verdict = expect(res, r);
		ok = verdict === true;
		if (typeof verdict === 'string') note = verdict;
	} catch (e) {
		note = `assert threw: ${e.message}`;
	}
	const detail = res?.error ? `ERR ${res.error.message} | ${res.error.description ?? ''}` : JSON.stringify(res?.items?.[0]?.json ?? r.error ?? null).slice(0, 220);
	report.push({ name, ok, note, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}\n      ${detail}`);
	return res;
}

const firstJson = (res) => res?.items?.[0]?.json ?? {};
const mid = (res) => firstJson(res).body?.mid;
const atts = (res) => (firstJson(res).body?.attachments ?? []).map((a) => a.type).join(',');
const isOk = (res) => !res?.error && res?.status === 'success';
const failsWith = (pattern) => (res) => !!res?.error && pattern.test(`${res.error.message} ${res.error.description ?? ''}`);

// ---------- Message → Send ----------
let res = await check('send plain text', [maxNode('MAX', send({ text: 'e2e: plain text' }), cred)], (r) => isOk(r) && !!mid(r));
state.plainMid = mid(res);

await check('send to user (markdown)', [maxNode('MAX', { resource: 'message', operation: 'send', sendTo: 'user', userId: USER_ID, text: 'e2e: **bold** *italic* ~~strike~~ ++under++ `code` [link](https://n8n.io)', format: 'markdown' }, cred)],
	(r) => isOk(r) && (firstJson(r).body?.markup ?? []).length >= 5 || `markup=${JSON.stringify(firstJson(r).body?.markup)}`);

await check('send html', [maxNode('MAX', send({ text: 'e2e: <b>bold</b> <i>italic</i> <u>under</u> <s>strike</s> <code>code</code> <a href="https://n8n.io">link</a>', format: 'html' }), cred)],
	(r) => isOk(r) && (firstJson(r).body?.markup ?? []).length >= 5 || `markup=${JSON.stringify(firstJson(r).body?.markup)}`);

const longText = Array.from({ length: 180 }, (_, i) => `Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog.`).join('\n\n');
await check('send long text (split)', [maxNode('MAX', send({ text: longText }), cred)],
	(r) => isOk(r) && Array.isArray(firstJson(r).messageIds) && firstJson(r).messageIds.length >= 3 || `ids=${JSON.stringify(firstJson(r).messageIds)}`);

await check('send long text without split → validation', [maxNode('MAX', send({ text: longText, options: { splitLongText: false } }), cred)],
	failsWith(/accepts up to 4000/));

res = await check('send with buttons', [maxNode('MAX', send({
	text: 'e2e: buttons — press "Yes" please',
	keyboard: 'buttons',
	buttons: { button: [
		{ row: 1, type: 'callback', text: 'Yes', payload: 'e2e-yes' },
		{ row: 1, type: 'callback', text: 'No', payload: 'e2e-no' },
		{ row: 2, type: 'link', text: 'n8n', url: 'https://n8n.io' },
		{ row: 2, type: 'request_contact', text: 'Contact' },
		{ row: 3, type: 'request_geo_location', text: 'Location', quick: false },
		{ row: 3, type: 'message', text: 'Say hi' },
		{ row: 4, type: 'clipboard', text: 'Copy', payload: 'copied text' },
	] },
}), cred)], (r) => {
	const kb = (firstJson(r).body?.attachments ?? []).find((a) => a.type === 'inline_keyboard');
	return isOk(r) && kb?.payload?.buttons?.length === 4 || `kb=${JSON.stringify(kb)}`;
});
state.buttonsMid = mid(res);

res = await check('send keyboard JSON', [maxNode('MAX', send({ text: 'e2e: keyboard from JSON', keyboard: 'json', keyboardJson: '[[{"type":"callback","text":"A","payload":"a"},{"type":"callback","text":"B","payload":"b"}]]' }), cred)],
	(r) => isOk(r) && atts(r) === 'inline_keyboard' || atts(r));
state.jsonKbMid = mid(res);

await check('send invalid keyboard JSON → validation', [maxNode('MAX', send({ text: 'x', keyboard: 'json', keyboardJson: '{"bad": 1}' }), cred)], failsWith(/array of rows/));
await check('send button without payload → validation', [maxNode('MAX', send({ text: 'x', keyboard: 'buttons', buttons: { button: [{ row: 1, type: 'callback', text: 'Y', payload: '' }] } }), cred)], failsWith(/needs a payload/));
await check('send 8 buttons in a row → validation', [maxNode('MAX', send({ text: 'x', keyboard: 'buttons', buttons: { button: Array.from({ length: 8 }, (_, k) => ({ row: 1, type: 'callback', text: `b${k}`, payload: `p${k}` })) } }), cred)], failsWith(/limit is 7/));

res = await check('send image (binary)', [readFile('Read', 'test-image.png'), maxNode('MAX', send({ text: 'e2e: image upload', attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'data', mediaType: 'auto' }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'image' || atts(r));
state.imageToken = firstJson(res).body?.attachments?.[0]?.payload?.token;

res = await check('send video (binary)', [readFile('Read', 'test-video.mp4'), maxNode('MAX', send({ text: 'e2e: video upload', attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'data', mediaType: 'auto' }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'video' || atts(r));
state.videoToken = firstJson(res).body?.attachments?.[0]?.payload?.token;

await check('send audio (binary)', [readFile('Read', 'test-audio.mp3'), maxNode('MAX', send({ attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'data', mediaType: 'auto' }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'audio' || atts(r));

await check('send pdf as file (binary)', [readFile('Read', 'test-document.pdf'), maxNode('MAX', send({ text: 'e2e: pdf', attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'data', mediaType: 'auto' }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'file' || atts(r));

await check('send cyrillic file name + custom name', [readFile('Read', 'тест файл.txt', 'doc'), maxNode('MAX', send({ attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'doc', mediaType: 'file', fileName: 'отчёт за ноябрь.txt' }] } }), cred)],
	(r) => isOk(r) && firstJson(r).body?.attachments?.[0]?.filename === 'отчёт за ноябрь.txt' || JSON.stringify(firstJson(r).body?.attachments?.[0]).slice(0, 200));

await check('send missing binary field → validation', [readFile('Read', 'test-image.png'), maxNode('MAX', send({ attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'nope', mediaType: 'auto' }] } }), cred)], failsWith(/nope/));

await check('send image + video album', [readFile('Read', 'test-image.png'), readFile('Read2', 'test-video.mp4'), {
	name: 'Combine', type: 'n8n-nodes-base.code', typeVersion: 2,
	parameters: { jsCode: "return [{ json: {}, binary: { img: $('Read').first().binary.data, vid: $('Read2').first().binary.data } }];" },
}, maxNode('MAX', send({ text: 'e2e: album', attachments: { attachment: [
	{ source: 'binary', binaryPropertyName: 'img', mediaType: 'image' },
	{ source: 'binary', binaryPropertyName: 'vid', mediaType: 'video' },
] } }), cred)], (r) => isOk(r) && atts(r) === 'image,video' || atts(r));

await check('send 13 attachments → validation', [maxNode('MAX', send({ attachments: { attachment: Array.from({ length: 13 }, () => ({ source: 'location', latitude: 1, longitude: 1 })) } }), cred)], failsWith(/at most 12/));

await check('send 12 attachments + keyboard → validation', [maxNode('MAX', send({ keyboard: 'json', keyboardJson: '[[{"type":"message","text":"Hi"}]]', attachments: { attachment: Array.from({ length: 12 }, () => ({ source: 'location', latitude: 1, longitude: 1 })) } }), cred)], failsWith(/including the keyboard/));
await check('send image by URL', [maxNode('MAX', send({ text: 'e2e: image by URL', attachments: { attachment: [{ source: 'url', url: 'https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png' }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'image' || atts(r));

if (userImage) {
	await check('send image by token (from received message)', [maxNode('MAX', send({ text: 'e2e: forwarded your picture by token', attachments: { attachment: [{ source: 'token', tokenType: 'image', fileRef: userImage }] } }), cred)],
		(r) => isOk(r) && atts(r) === 'image' || atts(r));
}
if (userSticker) {
	await check('send sticker', [maxNode('MAX', send({ attachments: { attachment: [{ source: 'sticker', code: userSticker }] } }), cred)],
		(r) => isOk(r) && atts(r) === 'sticker' || atts(r));
}
await check('send location', [maxNode('MAX', send({ attachments: { attachment: [{ source: 'location', latitude: 55.751244, longitude: 37.618423 }] } }), cred)],
	(r) => isOk(r) && atts(r) === 'location' || atts(r));

if (userTextMid) {
	await check('send reply', [maxNode('MAX', send({ text: 'e2e: reply to your "Тест"', options: { replyToMessageId: userTextMid } }), cred)],
		(r) => isOk(r) && firstJson(r).link?.type === 'reply' || JSON.stringify(firstJson(r).link));
	await check('send forward with text → validation', [maxNode('MAX', send({ text: 'e2e: forward', options: { forwardMessageId: userTextMid } }), cred)],
		failsWith(/forwards a message only on its own/));
	await check('reply and forward → validation', [maxNode('MAX', send({ text: 'x', options: { forwardMessageId: userTextMid, replyToMessageId: userTextMid } }), cred)],
		failsWith(/not both/));
	await check('send forward only (no text)', [maxNode('MAX', send({ options: { forwardMessageId: userTextMid } }), cred)],
		(r) => isOk(r) && firstJson(r).link?.type === 'forward' || JSON.stringify(firstJson(r).link));
}
await check('send silent, no link preview', [maxNode('MAX', send({ text: 'e2e: silent https://n8n.io', options: { notify: false, disableLinkPreview: true } }), cred)], (r) => isOk(r));
await check('send empty → validation', [maxNode('MAX', send({ text: '' }), cred)], failsWith(/Set a text/));
await check('send bad chat id → validation', [maxNode('MAX', send({ chatId: 'abc', text: 'x' }), cred)], failsWith(/must be a number/));
await check('send to unknown chat → API error', [maxNode('MAX', send({ chatId: '1', text: 'x' }), cred)], (r) => !!r?.error);

// ---------- Message → Edit / Get / Get Many / Delete ----------
res = await check('send for edit', [maxNode('MAX', send({ text: 'e2e: will be edited' }), cred)], (r) => isOk(r));
state.editMid = mid(res);
await check('edit text', [maxNode('MAX', { resource: 'message', operation: 'edit', messageId: state.editMid, text: 'e2e: edited **text**', format: 'markdown', attachmentsMode: 'keep' }, cred)],
	(r) => isOk(r) && firstJson(r).success === true || JSON.stringify(firstJson(r)));
await check('edit: replace with keyboard', [maxNode('MAX', { resource: 'message', operation: 'edit', messageId: state.editMid, text: '', attachmentsMode: 'replace', keyboard: 'buttons', buttons: { button: [{ row: 1, type: 'callback', text: 'Added', payload: 'added' }] } }, cred)],
	(r) => isOk(r) && firstJson(r).success === true || JSON.stringify(firstJson(r)));
await check('get message (after edits)', [maxNode('MAX', { resource: 'message', operation: 'get', messageId: state.editMid }, cred)],
	(r) => isOk(r) && firstJson(r).body?.text === 'e2e: edited text' && atts(r) === 'inline_keyboard' || `${firstJson(r).body?.text} | ${atts(r)}`);
await check('edit: remove all attachments', [maxNode('MAX', { resource: 'message', operation: 'edit', messageId: state.editMid, text: '', attachmentsMode: 'remove' }, cred)],
	(r) => isOk(r) && firstJson(r).success === true);
await check('get message (attachments removed)', [maxNode('MAX', { resource: 'message', operation: 'get', messageId: state.editMid }, cred)],
	(r) => isOk(r) && atts(r) === '' || atts(r));
await check('edit nothing → validation', [maxNode('MAX', { resource: 'message', operation: 'edit', messageId: state.editMid, text: '', attachmentsMode: 'keep' }, cred)], failsWith(/Nothing to change/));
await check('get many', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, limit: 5 }, cred)],
	(r) => isOk(r) && r.items.length === 5 || `items=${r?.items?.length}`);
await check('get many (newer than 10 min ago)', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, limit: 100, filters: { after: new Date(Date.now() - 10 * 60_000).toISOString() } }, cred)],
	(r) => isOk(r) && r.items.length > 0 && r.items.every((m) => m.json.timestamp >= Date.now() - 11 * 60_000) || `items=${r?.items?.length} oldest=${Math.min(...(r?.items ?? []).map((m) => m.json.timestamp))}`);
await check('get many (older than 10 min ago)', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, limit: 100, filters: { before: new Date(Date.now() - 10 * 60_000).toISOString() } }, cred)],
	(r) => isOk(r) && r.items.every((m) => m.json.timestamp <= Date.now() - 9 * 60_000) || `items=${r?.items?.length} newest=${Math.max(...(r?.items ?? []).map((m) => m.json.timestamp))}`);
await check('get many: return all', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, returnAll: true }, cred)],
	(r) => isOk(r) && r.items.length > 100 && new Set(r.items.map((m) => m.json.body.mid)).size === r.items.length || `items=${r?.items?.length}`);
await check('get many: limit 150', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, returnAll: false, limit: 150 }, cred)],
	(r) => isOk(r) && r.items.length === 150 || `items=${r?.items?.length}`);
await check('get many: bad date → validation', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: CHAT_ID, returnAll: false, limit: 5, filters: { before: 'not a date' } }, cred)], (r) => !!r?.error);
await check('delete message', [maxNode('MAX', { resource: 'message', operation: 'delete', messageId: state.editMid }, cred)],
	(r) => isOk(r) && firstJson(r).success === true || JSON.stringify(firstJson(r)));
await check('get deleted message → API error', [maxNode('MAX', { resource: 'message', operation: 'get', messageId: state.editMid }, cred)], (r) => !!r?.error);

// ---------- Video ----------
if (state.videoToken) {
	await check('video get', [maxNode('MAX', { resource: 'video', operation: 'get', videoId: state.videoToken }, cred)],
		(r) => isOk(r) && firstJson(r).duration >= 0 || JSON.stringify(firstJson(r)));
}

// ---------- Chat ----------
await check('chat get', [maxNode('MAX', { resource: 'chat', operation: 'get', chatId: CHAT_ID }, cred)], (r) => isOk(r) && String(firstJson(r).chat_id) === CHAT_ID);
await check('chat send action', [maxNode('MAX', { resource: 'chat', operation: 'sendAction', chatId: CHAT_ID, action: 'typing_on' }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(firstJson(r)));
await check('group-only method in a dialog → API error', [maxNode('MAX', { resource: 'chat', operation: 'getAdmins', chatId: CHAT_ID }, cred)], failsWith(/not available for dialogs/));
if (GROUP_ID) {
res = await check('group: chat get (simplified)', [maxNode('MAX', { resource: 'chat', operation: 'get', chatId: GROUP_ID }, cred)], (r) => isOk(r) && firstJson(r).type === 'chat' && firstJson(r).participants === undefined || JSON.stringify(firstJson(r)).slice(0, 200));
const original = { title: firstJson(res).title, description: firstJson(res).description ?? '' };
res = await check('group: send', [maxNode('MAX', send({ chatId: GROUP_ID, text: 'e2e: hello group' }), cred)], (r) => isOk(r) && !!mid(r));
state.groupMid = mid(res);
await check('group: send with buttons and image', [readFile('Read', 'test-image.png'), maxNode('MAX', send({ chatId: GROUP_ID, text: 'e2e: group image', attachments: { attachment: [{ source: 'binary', binaryPropertyName: 'data' }] }, keyboard: 'buttons', buttons: { button: [{ row: 1, type: 'callback', text: 'OK', payload: 'ok' }] } }), cred)], (r) => isOk(r) && atts(r) === 'image,inline_keyboard' || atts(r));
await check('group: send action', [maxNode('MAX', { resource: 'chat', operation: 'sendAction', chatId: GROUP_ID, action: 'sending_photo' }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(r?.error ?? firstJson(r)));
await check('group: edit message', [maxNode('MAX', { resource: 'message', operation: 'edit', messageId: state.groupMid, text: 'e2e: hello group (edited)', attachmentsMode: 'keep' }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(r?.error ?? firstJson(r)));
await check('group: bot membership (raw)', [maxNode('MAX', { resource: 'chat', operation: 'getMembership', chatId: GROUP_ID, simplify: false }, cred)], (r) => isOk(r) && firstJson(r).is_admin === true && Array.isArray(firstJson(r).permissions) || JSON.stringify(r?.error ?? firstJson(r)).slice(0, 200));
await check('group: remove unknown member → API error', [maxNode('MAX', { resource: 'chat', operation: 'removeMember', chatId: GROUP_ID, userId: '1', block: false }, cred)], (r) => !!r?.error);
await check('chat bot membership', [maxNode('MAX', { resource: 'chat', operation: 'getMembership', chatId: GROUP_ID }, cred)], (r) => isOk(r) || JSON.stringify(r?.error));
await check('chat pin', [maxNode('MAX', { resource: 'chat', operation: 'pin', chatId: GROUP_ID, messageId: state.groupMid, notify: false }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(r?.error ?? firstJson(r)));
await check('chat get pinned', [maxNode('MAX', { resource: 'chat', operation: 'getPinned', chatId: GROUP_ID }, cred)], (r) => isOk(r) && firstJson(r).message?.body?.mid === state.groupMid || JSON.stringify(r?.error ?? firstJson(r)).slice(0, 200));
await check('chat unpin', [maxNode('MAX', { resource: 'chat', operation: 'unpin', chatId: GROUP_ID }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(r?.error ?? firstJson(r)));
await check('chat members', [maxNode('MAX', { resource: 'chat', operation: 'getMembers', chatId: GROUP_ID, returnAll: true }, cred)], (r) => isOk(r) || JSON.stringify(r?.error));
await check('chat members by id', [maxNode('MAX', { resource: 'chat', operation: 'getMembers', chatId: GROUP_ID, returnAll: false, limit: 10, filters: { userIds: USER_ID } }, cred)], (r) => isOk(r) || JSON.stringify(r?.error));
await check('chat admins', [maxNode('MAX', { resource: 'chat', operation: 'getAdmins', chatId: GROUP_ID }, cred)], (r) => isOk(r) || JSON.stringify(r?.error));

await check('group: update title', [maxNode('MAX', { resource: 'chat', operation: 'update', chatId: GROUP_ID, updateFields: { title: 'n8n MAX e2e', notify: false } }, cred)], (r) => isOk(r) && firstJson(r).title === 'n8n MAX e2e' || JSON.stringify(r?.error ?? firstJson(r)).slice(0, 200));
await check('group: update description', [maxNode('MAX', { resource: 'chat', operation: 'update', chatId: GROUP_ID, updateFields: { description: 'Chat for testing the n8n MAX node' } }, cred)], (r) => isOk(r) && firstJson(r).description === 'Chat for testing the n8n MAX node' || JSON.stringify(r?.error ?? firstJson(r)).slice(0, 200));
await check('group: update nothing → validation', [maxNode('MAX', { resource: 'chat', operation: 'update', chatId: GROUP_ID, updateFields: {} }, cred)], failsWith(/Add a title/));
await check('group: get many', [maxNode('MAX', { resource: 'message', operation: 'getAll', chatId: GROUP_ID, limit: 10 }, cred)], (r) => isOk(r) && r.items.length > 0 || JSON.stringify(r?.error));
await check('group: delete own message', [maxNode('MAX', { resource: 'message', operation: 'delete', messageId: state.groupMid }, cred)], (r) => isOk(r) && firstJson(r).success === true || JSON.stringify(r?.error ?? firstJson(r)));
await check('group: restore title and description', [maxNode('MAX', { resource: 'chat', operation: 'update', chatId: GROUP_ID, updateFields: { title: original.title, description: original.description, notify: false } }, cred)], (r) => isOk(r) && firstJson(r).title === original.title || JSON.stringify(r?.error ?? firstJson(r)).slice(0, 200));
}

// ---------- Bot ----------
await check('bot get info (simplified)', [maxNode('MAX', { resource: 'bot', operation: 'getInfo' }, cred)], (r) => isOk(r) && firstJson(r).is_bot === true && firstJson(r).avatar_url === undefined || JSON.stringify(Object.keys(firstJson(r))));
await check('bot get info (raw)', [maxNode('MAX', { resource: 'bot', operation: 'getInfo', simplify: false }, cred)], (r) => isOk(r) && 'last_activity_time' in firstJson(r) || JSON.stringify(Object.keys(firstJson(r))));
await check('bot set commands', [maxNode('MAX', { resource: 'bot', operation: 'setCommands', commands: { command: [{ name: '/start', description: 'Start' }, { name: 'help', description: 'Help' }] } }, cred)],
	(r) => isOk(r) || JSON.stringify(r?.error));
await check('bot info shows commands', [maxNode('MAX', { resource: 'bot', operation: 'getInfo', simplify: false }, cred)], (r) => isOk(r) && (firstJson(r).commands ?? []).map((c) => c.name).join(',') === 'start,help' || JSON.stringify(firstJson(r).commands));
await check('bot clear commands', [maxNode('MAX', { resource: 'bot', operation: 'setCommands', commands: {} }, cred)], (r) => isOk(r) || JSON.stringify(r?.error));
await check('bot info commands cleared', [maxNode('MAX', { resource: 'bot', operation: 'getInfo', simplify: false }, cred)], (r) => isOk(r) && !(firstJson(r).commands ?? []).length || JSON.stringify(firstJson(r).commands));

// ---------- continueOnFail + multiple items ----------
await check('continue on fail keeps going', [maxNode('MAX', send({ chatId: '1', text: 'x' }), cred, { onError: 'continueRegularOutput' })],
	(r) => isOk(r) && !!firstJson(r).error || JSON.stringify(firstJson(r)));

writeFileSync(new URL('./out/e2e-state.json', import.meta.url), JSON.stringify(state, null, 1));
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length - failed.length}/${report.length} passed`);
if (failed.length) {
	console.log('FAILED:', failed.map((f) => f.name).join('; '));
	process.exitCode = 1;
}
