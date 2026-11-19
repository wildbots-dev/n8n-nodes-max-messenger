import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';
import { send } from '../nodes/Max/operations/message';

/** Fake n8n context: parameters from a map, the MAX HTTP API replaced by `respond`. */
function fakeContext(params: IDataObject, respond: (options: IHttpRequestOptions) => unknown) {
	const calls: IHttpRequestOptions[] = [];
	const ctx = {
		getNode: () => ({ id: '1', name: 'MAX', type: 'max', typeVersion: 1, position: [0, 0], parameters: {} }),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
			const value = name.split('.').reduce<unknown>((obj, key) => (obj as IDataObject | undefined)?.[key], params);
			return value === undefined ? fallback : value;
		},
		getCredentials: async () => ({ accessToken: 't', baseUrl: 'https://platform-api2.max.ru', ignoreSslIssues: false }),
		helpers: {
			httpRequestWithAuthentication: vi.fn(async (_cred: string, options: IHttpRequestOptions) => {
				calls.push(options);
				return { statusCode: 200, body: respond(options), headers: {} };
			}),
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, calls };
}

let counter = 0;
const ok = () => ({ message: { body: { mid: `mid.${++counter}` } } });

describe('Message → Send', () => {
	it('sends a short text once to the chat', async () => {
		const { ctx, calls } = fakeContext({ sendTo: 'chat', chatId: '-100', text: 'hi', format: 'markdown' }, ok);
		const out = await send(ctx, 0);
		expect(calls).toHaveLength(1);
		expect(calls[0].qs).toEqual({ chat_id: '-100' });
		expect(calls[0].body).toEqual({ text: 'hi', format: 'markdown' });
		expect(out[0].json.body).toEqual({ mid: expect.stringMatching(/^mid\./) });
		expect(out[0].pairedItem).toEqual({ item: 0 });
	});

	it('sends to a user by user_id', async () => {
		const { ctx, calls } = fakeContext({ sendTo: 'user', userId: '42', text: 'hi' }, ok);
		await send(ctx, 0);
		expect(calls[0].qs).toEqual({ user_id: '42' });
		expect(calls[0].body).toEqual({ text: 'hi' });
	});

	it('splits long text and puts the keyboard on the last part only', async () => {
		const text = `${'a'.repeat(3990)}\n\n${'b'.repeat(100)}`;
		const { ctx, calls } = fakeContext(
			{
				sendTo: 'chat',
				chatId: '1',
				text,
				keyboard: 'buttons',
				buttons: { button: [{ row: 1, type: 'callback', text: 'Yes', payload: 'y' }] },
				options: { replyToMessageId: 'mid.0' },
			},
			ok,
		);
		const out = await send(ctx, 0);
		expect(calls).toHaveLength(2);
		expect(calls[0].body).toMatchObject({ text: 'a'.repeat(3990), link: { type: 'reply', mid: 'mid.0' } });
		expect((calls[0].body as IDataObject).attachments).toBeUndefined();
		expect((calls[1].body as IDataObject).link).toBeUndefined();
		expect((calls[1].body as IDataObject).attachments).toEqual([
			{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: 'Yes', payload: 'y' }]] } },
		]);
		expect(out[0].json.messageIds).toHaveLength(2);
	});

	it('retries when an attachment is not ready yet', async () => {
		let attempts = 0;
		const { ctx, calls } = fakeContext(
			{ sendTo: 'chat', chatId: '1', attachments: { attachment: [{ source: 'location', latitude: 1, longitude: 2 }] } },
			() => (++attempts === 1 ? { code: 'attachment.not.ready', message: 'not ready', success: false } : ok()),
		);
		// The first answer is a failure with success:false and HTTP 200, the second one succeeds.
		await send(ctx, 0);
		expect(calls).toHaveLength(2);
	});

	it('rejects a forward combined with text', async () => {
		const { ctx, calls } = fakeContext(
			{ sendTo: 'chat', chatId: '1', text: 'hi', options: { forwardMessageId: 'mid.1' } },
			ok,
		);
		await expect(send(ctx, 0)).rejects.toThrow(/only on its own/);
		expect(calls).toHaveLength(0);
	});

	it('rejects an empty message and a non-numeric chat ID', async () => {
		await expect(send(fakeContext({ sendTo: 'chat', chatId: '1', text: ' ' }, ok).ctx, 0)).rejects.toThrow(/Set a text/);
		await expect(send(fakeContext({ sendTo: 'chat', chatId: 'abc', text: 'x' }, ok).ctx, 0)).rejects.toThrow(/must be a number/);
	});

	it('turns a MAX error body into a readable error', async () => {
		const { ctx } = fakeContext({ sendTo: 'chat', chatId: '1', text: 'x' }, () => ({
			code: 'chat.denied',
			message: 'Bot is not a member of the chat',
		}));
		// HTTP 200 without success:false is a normal answer, so emulate a 403 instead.
		(ctx.helpers.httpRequestWithAuthentication as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			statusCode: 403,
			body: { code: 'chat.denied', message: 'Bot is not a member of the chat' },
			headers: {},
		});
		await expect(send(ctx, 0)).rejects.toThrow('Bot is not a member of the chat');
	});
});
