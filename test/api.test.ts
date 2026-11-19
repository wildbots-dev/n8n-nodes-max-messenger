import type { INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { errorCodeOf, isFailure, isTlsTrustError, tlsErrorBody, toApiError, trimBaseUrl } from '../nodes/Max/lib/api';

const node: INode = {
	id: '1',
	name: 'MAX',
	type: 'n8n-nodes-max-messenger.max',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

describe('isFailure', () => {
	it('treats HTTP 4xx/5xx as failure', () => {
		expect(isFailure(404, { code: 'not.found' })).toBe(true);
		expect(isFailure(500, '')).toBe(true);
	});

	it('treats HTTP 200 with success:false as failure', () => {
		expect(isFailure(200, { success: false, code: 'chat.denied' })).toBe(true);
	});

	it('accepts normal responses', () => {
		expect(isFailure(200, { success: true })).toBe(false);
		expect(isFailure(200, { message: { body: {} } })).toBe(false);
		expect(isFailure(200, null)).toBe(false);
	});
});

describe('toApiError', () => {
	it('uses the MAX message and code', () => {
		const error = toApiError(node, 400, { code: 'proto.payload', message: 'errors.required' });
		expect(error.message).toBe('errors.required');
		expect(error.description).toBe('Error code: proto.payload');
		expect(error.httpCode).toBe('400');
	});

	it('explains a 401 without a body', () => {
		expect(toApiError(node, 401, '').message).toMatch(/access token/);
	});

	it('falls back to the HTTP status', () => {
		expect(toApiError(node, 503, '').message).toBe('MAX API answered with HTTP 503');
	});
});

describe('helpers', () => {
	it('reads the error code', () => {
		expect(errorCodeOf({ code: 'attachment.not.ready' })).toBe('attachment.not.ready');
		expect(errorCodeOf('text')).toBeUndefined();
	});

	it('trims trailing slashes', () => {
		expect(trimBaseUrl('https://platform-api2.max.ru//')).toBe('https://platform-api2.max.ru');
	});

	it('recognises TLS trust errors by code or message', () => {
		expect(isTlsTrustError({ code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' })).toBe(true);
		expect(isTlsTrustError({ cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } })).toBe(true);
		expect(isTlsTrustError(new Error('unable to get local issuer certificate'))).toBe(true);
		expect(isTlsTrustError(new Error('socket hang up'))).toBe(false);
	});

	it('copies a TLS error into a plain object', () => {
		const body = tlsErrorBody(Object.assign(new Error('bad cert'), { code: 'CERT_UNTRUSTED' }));
		expect(body).toEqual({ message: 'bad cert', code: 'CERT_UNTRUSTED' });
	});
});
