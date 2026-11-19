import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { randomBytes } from 'crypto';
import { connectionSettings, isTlsTrustError, maxApiRequest, TLS_HINT, tlsErrorBody } from './api';

export type UploadType = 'image' | 'video' | 'audio' | 'file';

const UPLOAD_TIMEOUT_MS = 300_000;

export interface MultipartBody {
	body: Buffer;
	contentType: string;
}

/** Quote a file name for a Content-Disposition header (RFC 7578: escape quotes, drop line breaks). */
function quoteFileName(name: string): string {
	return name.replace(/[\r\n]/g, ' ').replace(/(["\\])/g, '\\$1');
}

/** Build a multipart/form-data body with a single file field (MAX expects the field `data`). */
export function buildMultipart(
	buffer: Buffer,
	fileName: string,
	mimeType: string,
	fieldName = 'data',
	boundary = `----n8nMaxBoundary${randomBytes(12).toString('hex')}`,
): MultipartBody {
	const head = Buffer.from(
		`--${boundary}\r\n` +
			`Content-Disposition: form-data; name="${fieldName}"; filename="${quoteFileName(fileName)}"\r\n` +
			`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
		'utf8',
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
	return {
		body: Buffer.concat([head, buffer, tail]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/** Pick the MAX upload type for a binary file from its MIME type. */
export function uploadTypeFromMime(mimeType: string | undefined): UploadType {
	const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
	if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	return 'file';
}

function parseUploadResponse(raw: unknown): IDataObject | undefined {
	if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw as IDataObject;
	const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
	try {
		const parsed = JSON.parse(text) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as IDataObject) : undefined;
	} catch {
		// Video and audio uploads answer with XML like <retval>1</retval>.
		return undefined;
	}
}

/**
 * Build the attachment `payload` from the two upload steps.
 * - image: the upload response itself (`{ photos: {...} }` or `{ token }`)
 * - file: the upload response (`{ token }`)
 * - video / audio: the token returned by `POST /uploads`
 */
export function attachmentPayload(
	type: UploadType,
	slotToken: string | undefined,
	response: IDataObject | undefined,
): IDataObject | undefined {
	if (type === 'video' || type === 'audio') {
		const token = slotToken ?? (response?.token as string | undefined);
		return token ? { token } : undefined;
	}
	if (type === 'image') {
		if (response?.photos) return { photos: response.photos };
		if (response?.token) return { token: response.token };
		return slotToken ? { token: slotToken } : undefined;
	}
	const token = (response?.token as string | undefined) ?? slotToken;
	return token ? { token } : undefined;
}

/** Upload a file to MAX and return the attachment object to put in `attachments`. */
export async function uploadAttachment(
	ctx: IExecuteFunctions,
	itemIndex: number,
	type: UploadType,
	buffer: Buffer,
	fileName: string,
	mimeType: string,
): Promise<IDataObject> {
	const slot = await maxApiRequest<{ url?: string; token?: string }>(ctx, {
		method: 'POST',
		path: '/uploads',
		qs: { type },
	});
	if (!slot.url) {
		throw new NodeOperationError(ctx.getNode(), 'MAX did not return an upload URL', { itemIndex });
	}

	const { skipSslCertificateValidation } = await connectionSettings(ctx);
	const multipart = buildMultipart(buffer, fileName, mimeType);
	const request: IHttpRequestOptions = {
		method: 'POST',
		url: slot.url,
		body: multipart.body,
		headers: { 'Content-Type': multipart.contentType, 'Content-Length': multipart.body.length },
		encoding: 'text',
		json: false,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: UPLOAD_TIMEOUT_MS,
		skipSslCertificateValidation,
	};
	let response: { statusCode: number; body: unknown };
	try {
		response = (await ctx.helpers.httpRequest(request)) as { statusCode: number; body: unknown };
	} catch (error) {
		if (isTlsTrustError(error)) {
			throw new NodeApiError(ctx.getNode(), tlsErrorBody(error), {
				message: 'TLS certificate of the MAX upload server is not trusted',
				description: TLS_HINT,
				itemIndex,
			});
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex });
	}
	if (response.statusCode >= 400) {
		throw new NodeApiError(
			ctx.getNode(),
			{ statusCode: response.statusCode, body: String(response.body ?? '') },
			{
				message: `MAX upload server answered with HTTP ${response.statusCode}`,
				httpCode: String(response.statusCode),
				itemIndex,
			},
		);
	}
	const payload = attachmentPayload(type, slot.token, parseUploadResponse(response.body));
	if (!payload) {
		throw new NodeOperationError(ctx.getNode(), 'MAX did not return a token for the uploaded file', {
			itemIndex,
		});
	}
	return { type, payload };
}
