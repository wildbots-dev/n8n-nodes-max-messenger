// MAX Trigger lifecycle: activate → subscription exists with chosen types; change types → re-subscribed;
// deactivate → only our subscription is removed; reactivate. Other subscriptions of the bot must stay intact.
import { api, botToken, HOST, login } from './lib.mjs';

await login();
const token = botToken();
const subs = async () => (await (await fetch('https://platform-api.max.ru/subscriptions', { headers: { Authorization: token } })).json()).subscriptions ?? [];
const wf = (await api('GET', '/rest/workflows')).json.data.find((w) => w.name === 'MAX trigger e2e');
const ours = (list) => list.filter((s) => s.url.includes(HOST));
const others = (list) => list.filter((s) => !s.url.includes(HOST)).map((s) => s.url).sort().join('|');
let report = [];
/** Poll the subscription list until `cond` holds (n8n and MAX apply changes asynchronously). */
const waitFor = async (cond) => { let list = []; for (let i = 0; i < 20; i++) { list = await subs(); if (cond(list)) return list; await new Promise((r) => setTimeout(r, 1500)); } return list; };
const check = (name, ok, info = '') => { report.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

const before = await waitFor((l) => ours(l).length === 1);
const othersBefore = others(before);
check('active: our subscription present', ours(before).length === 1, JSON.stringify(ours(before)[0]?.update_types));

let r = await api('POST', `/rest/workflows/${wf.id}/deactivate`, {});
check('deactivate call', r.status === 200, r.status);
let now = await waitFor((l) => ours(l).length === 0);
check('deactivated: our subscription removed', ours(now).length === 0);
check('deactivated: other subscriptions intact', others(now) === othersBefore);

const full = (await api('GET', `/rest/workflows/${wf.id}`)).json.data;
const nodes = full.nodes.map((n) => n.type.endsWith('maxTrigger') ? { ...n, parameters: { ...n.parameters, updates: ['message_created', 'message_callback'] } } : n);
r = await api('PATCH', `/rest/workflows/${wf.id}`, { ...full, nodes });
r = await api('POST', `/rest/workflows/${wf.id}/activate`, { versionId: r.json?.data?.versionId ?? full.versionId });
check('activate with new types', r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 150));
now = await waitFor((l) => (ours(l)[0]?.update_types ?? []).length === 2);
check('re-activated: types updated', JSON.stringify([...(ours(now)[0]?.update_types ?? [])].sort()) === JSON.stringify(['message_callback', 'message_created']), JSON.stringify(ours(now)[0]?.update_types));
check('re-activated: one subscription only', ours(now).length === 1);

// restore the full event list for the remaining manual tests
const full2 = (await api('GET', `/rest/workflows/${wf.id}`)).json.data;
await api('POST', `/rest/workflows/${wf.id}/deactivate`, {});
const nodes2 = full2.nodes.map((n) => n.type.endsWith('maxTrigger') ? { ...n, parameters: { ...n.parameters, updates: ['message_created', 'message_callback', 'bot_started', 'bot_added', 'user_added', 'message_edited', 'message_removed'] } } : n);
r = await api('PATCH', `/rest/workflows/${wf.id}`, { ...full2, nodes: nodes2 });
r = await api('POST', `/rest/workflows/${wf.id}/activate`, { versionId: r.json?.data?.versionId });
now = await waitFor((l) => (ours(l)[0]?.update_types ?? []).length === 7);
check('restored: 7 types', (ours(now)[0]?.update_types ?? []).length === 7, JSON.stringify(ours(now)[0]?.update_types));
check('restored: other subscriptions intact', others(now) === othersBefore);
console.log(`${report.filter(Boolean).length}/${report.length} passed`);
