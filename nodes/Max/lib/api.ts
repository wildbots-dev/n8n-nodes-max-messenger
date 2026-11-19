import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export type MaxContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

export const CREDENTIAL_NAME = 'maxBotApi';
export const DEFAULT_BASE_URL = 'https://platform-api2.max.ru';

const TLS_ERROR_CODES = new Set([
	'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
	'UNABLE_TO_GET_ISSUER_CERT',
	'SELF_SIGNED_CERT_IN_CHAIN',
	'DEPTH_ZERO_SELF_SIGNED_CERT',
	'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
	'CERT_UNTRUSTED',
]);

export const TLS_HINT =
	'n8n does not trust the TLS certificate of the MAX API. platform-api2.max.ru uses a certificate from the Russian Trusted Root CA: install that CA on the n8n host (see the node README) or enable "Ignore SSL Issues" in the MAX Bot API credential.';

/**
 * Plain copy of a TLS error for NodeApiError. Passing the original NodeApiError would
 * make the constructor return it unchanged and drop our message and hint.
 */
export function tlsErrorBody(error: unknown): JsonObject {
	const err = error as { message?: unknown; code?: unknown; cause?: { code?: unknown } };
	const code = typeof err?.code === 'string' ? err.code : err?.cause?.code;
	return { message: String(err?.message ?? 'TLS certificate not trusted'), code: String(code ?? '') };
}

/** Whether an error thrown by the HTTP client is a TLS trust failure. */
export function isTlsTrustError(error: unknown): boolean {
	const err = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
	const codes = [err?.code, err?.cause?.code].filter((c): c is string => typeof c === 'string');
	if (codes.some((code) => TLS_ERROR_CODES.has(code))) return true;
	const message = typeof err?.message === 'string' ? err.message : '';
	return [...TLS_ERROR_CODES].some((code) => message.includes(code)) || /certificate/i.test(message);
}
const USER_AGENT = 'n8n-nodes-max-messenger';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface MaxRequestOptions {
	method: IHttpRequestMethods;
	/** Path relative to the API domain, e.g. '/messages' */
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	/** Error codes after which the request is retried (with exponential backoff). */
	retryOn?: string[];
	maxRetries?: number;
}

interface FullResponse<T> {
	statusCode: number;
	body: T;
	headers: Record<string, string | undefined>;
}

interface MaxErrorBody {
	code?: string;
	message?: string;
	success?: boolean;
}

export interface ConnectionSettings {
	baseUrl: string;
	skipSslCertificateValidation: boolean;
}

export function trimBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

export async function connectionSettings(ctx: MaxContext): Promise<ConnectionSettings> {
	const credentials = await ctx.getCredentials(CREDENTIAL_NAME);
	return {
		baseUrl: trimBaseUrl(String(credentials.baseUrl || DEFAULT_BASE_URL)),
		skipSslCertificateValidation: credentials.ignoreSslIssues === true,
	};
}

function asErrorBody(body: unknown): MaxErrorBody | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	return body as MaxErrorBody;
}

/** MAX error code of a response body, if any (`{ code, message }`). */
export function errorCodeOf(body: unknown): string | undefined {
	const code = asErrorBody(body)?.code;
	return typeof code === 'string' ? code : undefined;
}

/**
 * A response is a failure when the HTTP status is 4xx/5xx, or when MAX answers
 * 200 with `{ "success": false }` (some action methods do that).
 */
export function isFailure(statusCode: number, body: unknown): boolean {
	if (statusCode >= 400) return true;
	return asErrorBody(body)?.success === false;
}

export function toApiError(node: INode, statusCode: number, body: unknown): NodeApiError {
	const parsed = asErrorBody(body);
	const httpCode = String(statusCode);
	if (parsed && (parsed.message || parsed.code)) {
		return new NodeApiError(node, parsed as JsonObject, {
			message: parsed.message || parsed.code || `MAX API answered with HTTP ${statusCode}`,
			description: parsed.code ? `Error code: ${parsed.code}` : undefined,
			httpCode,
		});
	}
	return new NodeApiError(node, { statusCode, body: String(body ?? '') } as JsonObject, {
		message:
			statusCode === 401
				? 'The access token is invalid or has been revoked'
				: `MAX API answered with HTTP ${statusCode}`,
		httpCode,
	});
}

function shouldRetry(statusCode: number, body: unknown, retryOn: string[]): boolean {
	if (statusCode === 429) return true;
	const code = errorCodeOf(body);
	return code !== undefined && retryOn.includes(code);
}

export async function maxApiRequest<T = IDataObject>(
	ctx: MaxContext,
	options: MaxRequestOptions,
): Promise<T> {
	const settings = await connectionSettings(ctx);
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${settings.baseUrl}${options.path}`,
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: DEFAULT_TIMEOUT_MS,
		skipSslCertificateValidation: settings.skipSslCertificateValidation,
	};
	if (options.body !== undefined) requestOptions.body = options.body;
	if (options.qs !== undefined) requestOptions.qs = options.qs;

	const retryOn = options.retryOn ?? [];
	const maxRetries = options.maxRetries ?? 3;
	for (let attempt = 0; ; attempt++) {
		let response: FullResponse<unknown>;
		try {
			response = (await ctx.helpers.httpRequestWithAuthentication.call(
				ctx,
				CREDENTIAL_NAME,
				requestOptions,
			)) as FullResponse<unknown>;
		} catch (error) {
			if (isTlsTrustError(error)) {
				throw new NodeApiError(ctx.getNode(), tlsErrorBody(error), {
					message: 'TLS certificate of the MAX API is not trusted',
					description: TLS_HINT,
				});
			}
			throw new NodeApiError(ctx.getNode(), error as JsonObject);
		}
		if (!isFailure(response.statusCode, response.body)) return response.body as T;
		if (attempt < maxRetries && shouldRetry(response.statusCode, response.body, retryOn)) {
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		throw toApiError(ctx.getNode(), response.statusCode, response.body);
	}
}

/** Drop keys whose value is undefined, null or an empty string. */
export function compact(obj: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined || value === null || value === '') continue;
		out[key] = value;
	}
	return out;
}
