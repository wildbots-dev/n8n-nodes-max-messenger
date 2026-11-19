import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { maxApiRequest, resetDomainFallback } from '../nodes/Max/lib/api';

/** A host that does not trust the Russian CA: platform-api2 fails TLS, the legacy domain answers. */
function host(baseUrl: string, trustsRussianCa = false) {
	const urls: string[] = [];
	const ctx = {
		getNode: () => ({ id: '1', name: 'MAX', type: 'max', typeVersion: 1, position: [0, 0], parameters: {} }),
		getCredentials: async () => ({ accessToken: 't', baseUrl, ignoreSslIssues: false }),
		helpers: {
			httpRequestWithAuthentication: async (_c: string, options: IHttpRequestOptions) => {
				urls.push(options.url);
				if (options.url.startsWith('https://platform-api2.max.ru') && !trustsRussianCa) {
					throw Object.assign(new Error('unable to get local issuer certificate'), {
						code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
					});
				}
				return { statusCode: 200, body: { user_id: 1 }, headers: {} };
			},
		},
	};
	return { ctx: ctx as unknown as IExecuteFunctions, urls };
}

describe('API domain', () => {
	beforeEach(() => resetDomainFallback());

	it('Automatic falls back to the legacy domain and remembers it', async () => {
		const { ctx, urls } = host('auto');
		await expect(maxApiRequest(ctx, { method: 'GET', path: '/me' })).resolves.toEqual({ user_id: 1 });
		await maxApiRequest(ctx, { method: 'GET', path: '/me' });
		expect(urls).toEqual([
			'https://platform-api2.max.ru/me',
			'https://platform-api.max.ru/me',
			'https://platform-api.max.ru/me',
		]);
	});

	it('Automatic stays on platform-api2 when the host trusts the Russian CA', async () => {
		const { ctx, urls } = host('auto', true);
		await maxApiRequest(ctx, { method: 'GET', path: '/me' });
		expect(urls).toEqual(['https://platform-api2.max.ru/me']);
	});

	it('an explicit platform-api2 domain reports the TLS problem with a hint', async () => {
		const { ctx, urls } = host('https://platform-api2.max.ru');
		await expect(maxApiRequest(ctx, { method: 'GET', path: '/me' })).rejects.toMatchObject({
			message: 'TLS certificate of the MAX API is not trusted',
			description: expect.stringContaining('Automatic'),
		});
		expect(urls).toHaveLength(1);
	});

	it('an empty setting from an older credential means Automatic', async () => {
		const { ctx, urls } = host('');
		await maxApiRequest(ctx, { method: 'GET', path: '/me' });
		expect(urls.at(-1)).toBe('https://platform-api.max.ru/me');
	});
});

describe('acceptCodes', () => {
	it('treats listed MAX codes as success and others as failures', async () => {
		const ctx = {
			getNode: () => ({ id: '1', name: 'MAX', type: 'max', typeVersion: 1, position: [0, 0], parameters: {} }),
			getCredentials: async () => ({ accessToken: 't', baseUrl: 'https://platform-api.max.ru' }),
			helpers: {
				httpRequestWithAuthentication: async () => ({
					statusCode: 200,
					body: { success: false, code: 'not.found', message: 'Subscription is not found' },
					headers: {},
				}),
			},
		} as unknown as IExecuteFunctions;
		await expect(
			maxApiRequest(ctx, { method: 'DELETE', path: '/subscriptions', acceptCodes: ['not.found'] }),
		).resolves.toMatchObject({ code: 'not.found' });
		await expect(maxApiRequest(ctx, { method: 'DELETE', path: '/subscriptions' })).rejects.toThrow(
			'Subscription is not found',
		);
	});
});
