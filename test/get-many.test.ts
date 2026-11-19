import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { getAll } from '../nodes/Max/operations/message';

/** A chat history of `total` messages, one per second, served like GET /messages (newest first). */
function history(total: number) {
	const all = Array.from({ length: total }, (_, k) => ({ body: { mid: `m${k}` }, timestamp: 1_000_000 + k * 1000 }));
	const calls: IDataObject[] = [];
	const ctx = {
		getNode: () => ({ id: '1', name: 'MAX', type: 'max', typeVersion: 1, position: [0, 0], parameters: {} }),
		getCredentials: async () => ({ accessToken: 't', baseUrl: 'https://platform-api2.max.ru' }),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => params[name] ?? fallback,
		helpers: {
			httpRequestWithAuthentication: async (_c: string, options: IHttpRequestOptions) => {
				const qs = options.qs as IDataObject;
				calls.push(qs);
				const from = qs.from as number | undefined;
				const to = qs.to as number | undefined;
				const page = all
					.filter((m) => (from === undefined || m.timestamp <= from) && (to === undefined || m.timestamp >= to))
					.reverse()
					.slice(0, Number(qs.count));
				return { statusCode: 200, body: { messages: page }, headers: {} };
			},
		},
	};
	let params: IDataObject = {};
	return {
		run: async (p: IDataObject) => {
			params = { chatId: '5', ...p };
			return getAll(ctx as unknown as IExecuteFunctions, 0);
		},
		calls,
	};
}

describe('Message → Get Many', () => {
	it('returns all messages across pages without duplicates', async () => {
		const { run, calls } = history(250);
		const out = await run({ returnAll: true });
		const mids = out.map((item) => (item.json.body as IDataObject).mid);
		expect(out).toHaveLength(250);
		expect(new Set(mids).size).toBe(250);
		expect(mids[0]).toBe('m249');
		expect(calls.length).toBeGreaterThanOrEqual(3);
	});

	it('honours a limit above one page', async () => {
		const { run } = history(250);
		expect(await run({ returnAll: false, limit: 150 })).toHaveLength(150);
	});

	it('passes Older Than and Newer Than as from/to in milliseconds', async () => {
		const { run, calls } = history(10);
		const out = await run({
			returnAll: false,
			limit: 50,
			filters: { before: new Date(1_007_000).toISOString(), after: new Date(1_003_000).toISOString() },
		});
		expect(calls[0]).toMatchObject({ from: 1_007_000, to: 1_003_000 });
		expect(out.map((item) => (item.json.body as IDataObject).mid)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3']);
	});

	it('rejects a value that is not a date and an empty range', async () => {
		const { run } = history(1);
		await expect(run({ filters: { before: 'yesterday-ish' } })).rejects.toThrow(/not a valid date/);
		await expect(
			run({ filters: { before: '2026-01-01T00:00:00Z', after: '2026-02-01T00:00:00Z' } }),
		).rejects.toThrow(/must be later/);
	});
});
