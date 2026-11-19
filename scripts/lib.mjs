// Test harness for a real n8n instance (internal REST API). Not part of the package.
// Env: N8N_URL (public HTTPS address of the n8n instance), N8N_E2E_EMAIL and N8N_E2E_PASSWORD
// (owner account of that instance; created on first run), MAX_TOKEN_FILE (file with the bot token).
import { readFileSync } from 'node:fs';
import { parse as unflat } from 'flatted';

for (const name of ['N8N_URL', 'N8N_E2E_EMAIL', 'N8N_E2E_PASSWORD', 'MAX_TOKEN_FILE']) {
	if (!process.env[name]) throw new Error(`Set ${name}`);
}
export const BASE = process.env.N8N_URL.replace(/\/+$/, '');
export const HOST = new URL(BASE).host;
const OWNER = { email: process.env.N8N_E2E_EMAIL, firstName: 'E2E', lastName: 'Test', password: process.env.N8N_E2E_PASSWORD };
let cookie = '';

export async function api(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: { 'Content-Type': 'application/json', cookie, 'browser-id': 'e2e' },
		body: body ? JSON.stringify(body) : undefined,
	});
	const set = res.headers.get('set-cookie');
	if (set) cookie = set.split(';')[0];
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	return { status: res.status, json };
}

export async function login() {
	let r;
	for (let attempt = 0; attempt < 6; attempt++) {
		r = await api('POST', '/rest/login', { emailOrLdapLoginId: OWNER.email, password: OWNER.password });
		if (r.status !== 429) break;
		// n8n throttles logins; wait and try again.
		await new Promise((res) => setTimeout(res, 15_000));
	}
	if (r.status === 401 || r.status === 404) {
		r = await api('POST', '/rest/owner/setup', OWNER);
		if (r.status !== 200) throw new Error(`owner setup: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
	} else if (r.status !== 200) {
		throw new Error(`login: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
	}
}

export function botToken() {
	return readFileSync(process.env.MAX_TOKEN_FILE, 'utf8').trim();
}

/** Create (or reuse by name) a MAX Bot API credential. */
export async function ensureCredential(name, data) {
	const list = await api('GET', '/rest/credentials');
	const found = (list.json?.data ?? []).find((c) => c.name === name);
	if (found) {
		await api('PATCH', `/rest/credentials/${found.id}`, { name, type: 'maxBotApi', data });
		return { id: found.id, name };
	}
	const r = await api('POST', '/rest/credentials', { name, type: 'maxBotApi', data });
	if (!r.json?.data?.id) throw new Error(`credential: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
	return { id: r.json.data.id, name };
}

export async function testCredential(cred, data) {
	const r = await api('POST', '/rest/credentials/test', {
		credentials: { id: cred.id, name: cred.name, type: 'maxBotApi', data },
	});
	return r.json?.data ?? r.json;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Create a workflow from nodes chained in order after a Manual Trigger, run it and return per-node results. */
export async function runChain(name, chain, options = {}) {
	const nodes = [
		{ parameters: {}, name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
		...chain.map((n, i) => ({ position: [250 * (i + 1), 0], typeVersion: 1, ...n })),
	];
	const connections = {};
	for (let i = 0; i < nodes.length - 1; i++) {
		connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
	}
	return runWorkflow(name, nodes, connections, options);
}

/** Create a workflow (first node must be a Manual Trigger named Start), run it, return per-node results. */
export async function runWorkflow(name, nodes, connections, { keep = false } = {}) {
	const created = await api('POST', '/rest/workflows', {
		name,
		nodes,
		connections,
		settings: { executionOrder: 'v1' },
		active: false,
	});
	const wf = created.json?.data;
	if (!wf?.id) throw new Error(`workflow: ${created.status} ${JSON.stringify(created.json).slice(0, 300)}`);
	const run = await api('POST', `/rest/workflows/${wf.id}/run`, {
		workflowData: wf,
		startNodes: [{ name: 'Start', sourceData: null }],
		triggerToStartFrom: { name: 'Start' },
	});
	const execId = run.json?.data?.executionId;
	if (!execId) throw new Error(`run: ${run.status} ${JSON.stringify(run.json).slice(0, 300)}`);
	let e;
	for (let i = 0; i < 120; i++) {
		await sleep(1500);
		e = (await api('GET', `/rest/executions/${execId}`)).json?.data;
		if (e && !['running', 'new', 'waiting'].includes(e.status)) break;
	}
	if (!keep) await deleteWorkflow(wf.id);
	const data = typeof e?.data === 'string' ? unflat(e.data) : e?.data;
	const runData = data?.resultData?.runData ?? {};
	const results = {};
	for (const [nodeName, runs] of Object.entries(runData)) {
		const first = runs[0];
		results[nodeName] = {
			status: first?.executionStatus,
			error: first?.error ? { message: first.error.message, description: first.error.description } : undefined,
			items: (first?.data?.main?.[0] ?? []).map((item) => ({ json: item.json, binary: item.binary })),
		};
	}
	return { status: e?.status, workflowId: wf.id, results, error: data?.resultData?.error?.message };
}

/** n8n 2.x deletes only archived workflows. */
export async function deleteWorkflow(id) {
	await api('POST', `/rest/workflows/${id}/archive`, {});
	await api('DELETE', `/rest/workflows/${id}`);
}

export function maxNode(name, parameters, cred, extra = {}) {
	return { name, type: 'n8n-nodes-max-messenger.max', parameters, credentials: { maxBotApi: cred }, ...extra };
}
