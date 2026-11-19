import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { ButtonInput } from './keyboard';
import { buildKeyboard, keyboardFromJson } from './keyboard';
import type { UploadType } from './upload';
import { uploadAttachment, uploadTypeFromMime } from './upload';

export const MAX_ATTACHMENTS = 12;
const MAX_FILE_NAME_LENGTH = 200;

export interface AttachmentInput {
	source: 'binary' | 'url' | 'token' | 'sticker' | 'location';
	binaryPropertyName?: string;
	mediaType?: 'auto' | UploadType;
	fileName?: string;
	url?: string;
	tokenType?: UploadType;
	fileRef?: string;
	code?: string;
	latitude?: number;
	longitude?: number;
}

/** Validate an ID given as text or number; MAX IDs are 64-bit integers (chat IDs can be negative). */
export function parseId(
	ctx: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): string {
	const text = String(value ?? '').trim();
	if (!/^-?\d+$/.test(text)) {
		throw new NodeOperationError(ctx.getNode(), `${label} must be a number, got "${text}"`, {
			itemIndex,
		});
	}
	return text;
}

/** Validate a non-empty string parameter such as a message ID or token. */
export function requireText(
	ctx: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): string {
	const text = String(value ?? '').trim();
	if (text === '') {
		throw new NodeOperationError(ctx.getNode(), `${label} is required`, { itemIndex });
	}
	return text;
}

export function shortenFileName(name: string): string {
	if (name.length <= MAX_FILE_NAME_LENGTH) return name;
	const dot = name.lastIndexOf('.');
	const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
	return name.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext;
}

async function buildAttachment(
	ctx: IExecuteFunctions,
	itemIndex: number,
	input: AttachmentInput,
): Promise<IDataObject> {
	const node = ctx.getNode();
	switch (input.source) {
		case 'binary': {
			const field = (input.binaryPropertyName || 'data').trim();
			const binary = ctx.helpers.assertBinaryData(itemIndex, field);
			const buffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, field);
			const type =
				!input.mediaType || input.mediaType === 'auto'
					? uploadTypeFromMime(binary.mimeType)
					: input.mediaType;
			const fallbackName = `${type}.${binary.fileExtension || 'bin'}`;
			const fileName = shortenFileName((input.fileName || binary.fileName || fallbackName).trim());
			return await uploadAttachment(ctx, itemIndex, type, buffer, fileName, binary.mimeType);
		}
		case 'url': {
			const url = (input.url ?? '').trim();
			if (!/^https?:\/\//i.test(url)) {
				throw new NodeOperationError(node, `Image URL must start with http:// or https:// (got "${url}")`, {
					itemIndex,
				});
			}
			return { type: 'image', payload: { url } };
		}
		case 'token': {
			const token = requireText(ctx, input.fileRef, 'Attachment token', itemIndex);
			return { type: input.tokenType || 'image', payload: { token } };
		}
		case 'sticker': {
			const code = requireText(ctx, input.code, 'Sticker code', itemIndex);
			return { type: 'sticker', payload: { code } };
		}
		case 'location':
			return {
				type: 'location',
				latitude: Number(input.latitude ?? 0),
				longitude: Number(input.longitude ?? 0),
			};
		default:
			throw new NodeOperationError(node, `Unknown attachment source: ${String(input.source)}`, {
				itemIndex,
			});
	}
}

/** Build (and upload, for binary files) all attachments set in the "Attachments" parameter. */
export async function attachmentsFromParams(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const inputs = ctx.getNodeParameter('attachments.attachment', itemIndex, []) as AttachmentInput[];
	if (inputs.length > MAX_ATTACHMENTS) {
		throw new NodeOperationError(
			ctx.getNode(),
			`A message can have at most ${MAX_ATTACHMENTS} attachments (got ${inputs.length})`,
			{ itemIndex },
		);
	}
	const attachments: IDataObject[] = [];
	for (const input of inputs) {
		attachments.push(await buildAttachment(ctx, itemIndex, input));
	}
	return attachments;
}

/** Build the `inline_keyboard` attachment from the "Inline Keyboard" parameters, if any. */
export function keyboardFromParams(ctx: IExecuteFunctions, itemIndex: number): IDataObject | undefined {
	const mode = ctx.getNodeParameter('keyboard', itemIndex, 'none') as string;
	const fail = (message: string): never => {
		throw new NodeOperationError(ctx.getNode(), message, { itemIndex });
	};
	if (mode === 'buttons') {
		const buttons = ctx.getNodeParameter('buttons.button', itemIndex, []) as ButtonInput[];
		return buildKeyboard(buttons, fail);
	}
	if (mode === 'json') {
		return keyboardFromJson(ctx.getNodeParameter('keyboardJson', itemIndex, ''), fail);
	}
	return undefined;
}

/** `format` body field: undefined for plain text. */
export function formatFromParams(ctx: IExecuteFunctions, itemIndex: number): string | undefined {
	const format = ctx.getNodeParameter('format', itemIndex, 'plain') as string;
	return format === 'plain' ? undefined : format;
}

/**
 * Attachments for an edit: undefined keeps the current ones, [] removes all,
 * a list replaces them (media first, keyboard last).
 */
export async function replacementAttachments(
	ctx: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[] | undefined> {
	const mode = ctx.getNodeParameter('attachmentsMode', itemIndex, 'keep') as string;
	if (mode === 'keep') return undefined;
	if (mode === 'remove') return [];
	const attachments = await attachmentsFromParams(ctx, itemIndex);
	const keyboard = keyboardFromParams(ctx, itemIndex);
	if (keyboard) attachments.push(keyboard);
	return attachments;
}
