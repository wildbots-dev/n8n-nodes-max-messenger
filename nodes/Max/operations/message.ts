import type { IDataObject, INodeExecutionData, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';
import { compact, maxApiRequest } from '../lib/api';
import {
	attachmentsFromParams,
	formatFromParams,
	keyboardFromParams,
	parseId,
	replacementAttachments,
	requireText,
} from '../lib/compose';
import { MAX_TEXT_LENGTH, splitText } from '../lib/text';
import type { OperationHandler } from './types';

/** MAX allows about two messages per second in one chat. */
const PAUSE_BETWEEN_PARTS_MS = 600;
/** Uploaded videos and files need a moment before they can be attached. */
const NOT_READY_RETRIES = 6;

interface SendOptions {
	disableLinkPreview?: boolean;
	forwardMessageId?: string;
	notify?: boolean;
	replyToMessageId?: string;
	splitLongText?: boolean;
}

function out(json: IDataObject, itemIndex: number): INodeExecutionData[] {
	return [{ json, pairedItem: { item: itemIndex } }];
}

function checkTextLength(ctx: Parameters<OperationHandler>[0], text: string, itemIndex: number) {
	if (text.length > MAX_TEXT_LENGTH) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Text is ${text.length} characters long; MAX accepts up to ${MAX_TEXT_LENGTH}`,
			{ itemIndex },
		);
	}
}

export const send: OperationHandler = async (ctx, i) => {
	const sendTo = ctx.getNodeParameter('sendTo', i) as string;
	const qs: IDataObject =
		sendTo === 'user'
			? { user_id: parseId(ctx, ctx.getNodeParameter('userId', i), 'User ID', i) }
			: { chat_id: parseId(ctx, ctx.getNodeParameter('chatId', i), 'Chat ID', i) };
	const text = ctx.getNodeParameter('text', i, '') as string;
	const format = formatFromParams(ctx, i);
	const options = ctx.getNodeParameter('options', i, {}) as SendOptions;
	if (options.disableLinkPreview) qs.disable_link_preview = true;

	if (options.replyToMessageId && options.forwardMessageId) {
		throw new NodeOperationError(ctx.getNode(), 'A message can either reply to or forward a message, not both', {
			itemIndex: i,
		});
	}
	const link = options.replyToMessageId
		? { type: 'reply', mid: options.replyToMessageId.trim() }
		: options.forwardMessageId
			? { type: 'forward', mid: options.forwardMessageId.trim() }
			: undefined;

	const keyboard = keyboardFromParams(ctx, i);
	const media = await attachmentsFromParams(ctx, i, keyboard !== undefined);
	if (link?.type === 'forward' && (text.trim() !== '' || media.length > 0 || keyboard)) {
		throw new NodeOperationError(
			ctx.getNode(),
			'MAX forwards a message only on its own: remove the text, attachments and keyboard, or send them with another MAX node',
			{ itemIndex: i },
		);
	}
	if (text.trim() === '' && media.length === 0 && !keyboard && !link) {
		throw new NodeOperationError(ctx.getNode(), 'Set a text, an attachment or a message to forward', {
			itemIndex: i,
		});
	}
	if (options.splitLongText === false) checkTextLength(ctx, text, i);
	const parts = options.splitLongText === false ? [text] : splitText(text);

	const sent: IDataObject[] = [];
	for (let part = 0; part < parts.length; part++) {
		const isFirst = part === 0;
		const isLast = part === parts.length - 1;
		const attachments = [...(isFirst ? media : []), ...(isLast && keyboard ? [keyboard] : [])];
		const hasText = parts[part].trim() !== '';
		const body = compact({
			text: hasText ? parts[part] : undefined,
			format: hasText ? format : undefined,
			notify: options.notify === false ? false : undefined,
			link: isFirst ? link : undefined,
		});
		if (attachments.length > 0) body.attachments = attachments;
		if (!isFirst) await sleep(PAUSE_BETWEEN_PARTS_MS);
		try {
			const response = await maxApiRequest<{ message: IDataObject }>(ctx, {
				method: 'POST',
				path: '/messages',
				qs,
				body,
				retryOn: ['attachment.not.ready'],
				maxRetries: NOT_READY_RETRIES,
			});
			sent.push(response.message);
		} catch (error) {
			const wrapped =
				error instanceof NodeOperationError
					? error
					: new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
			if (sent.length > 0) {
				// Earlier parts are already delivered; say so, otherwise a retry would send them twice.
				const delivered = sent.map((message) => (message.body as IDataObject | undefined)?.mid).join(', ');
				wrapped.description = `${wrapped.description ? `${wrapped.description}. ` : ''}Part ${part + 1} of ${parts.length} was not sent; parts already delivered: ${delivered}`;
			}
			throw wrapped;
		}
	}

	const first = sent[0] ?? {};
	if (sent.length === 1) return out(first, i);
	const messageIds = sent.map((message) => (message.body as IDataObject | undefined)?.mid);
	return out({ ...first, messageIds }, i);
};

/** Shared body of Edit and Answer Callback → Update Message. */
async function editBody(ctx: Parameters<OperationHandler>[0], i: number): Promise<IDataObject> {
	const text = ctx.getNodeParameter('text', i, '') as string;
	checkTextLength(ctx, text, i);
	const body: IDataObject = {};
	if (text !== '') {
		body.text = text;
		const format = formatFromParams(ctx, i);
		if (format) body.format = format;
	}
	const attachments = await replacementAttachments(ctx, i);
	if (attachments !== undefined) body.attachments = attachments;
	return body;
}

export const edit: OperationHandler = async (ctx, i) => {
	const messageId = requireText(ctx, ctx.getNodeParameter('messageId', i), 'Message ID', i);
	const body = await editBody(ctx, i);
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Nothing to change: set a new text or change the attachments', {
			itemIndex: i,
		});
	}
	const options = ctx.getNodeParameter('options', i, {}) as { notify?: boolean };
	if (options.notify === false) body.notify = false;
	const response = await maxApiRequest(ctx, {
		method: 'PUT',
		path: '/messages',
		qs: { message_id: messageId },
		body,
		retryOn: ['attachment.not.ready'],
		maxRetries: NOT_READY_RETRIES,
	});
	return out({ ...response, messageId }, i);
};

export const remove: OperationHandler = async (ctx, i) => {
	const messageId = requireText(ctx, ctx.getNodeParameter('messageId', i), 'Message ID', i);
	const response = await maxApiRequest(ctx, {
		method: 'DELETE',
		path: '/messages',
		qs: { message_id: messageId },
	});
	return out({ ...response, messageId }, i);
};

export const get: OperationHandler = async (ctx, i) => {
	const messageId = requireText(ctx, ctx.getNodeParameter('messageId', i), 'Message ID', i);
	const message = await maxApiRequest(ctx, {
		method: 'GET',
		path: `/messages/${encodeURIComponent(messageId)}`,
	});
	return out(message, i);
};

const PAGE_SIZE = 100;

/** Milliseconds since epoch for a dateTime parameter; throws on a value that is not a date. */
function toTimestamp(
	ctx: Parameters<OperationHandler>[0],
	value: unknown,
	label: string,
	i: number,
): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const time = typeof value === 'number' ? value : Date.parse(String(value));
	if (Number.isNaN(time)) {
		throw new NodeOperationError(ctx.getNode(), `${label} is not a valid date: "${String(value)}"`, {
			itemIndex: i,
		});
	}
	return time;
}

export const getAll: OperationHandler = async (ctx, i) => {
	const chatId = parseId(ctx, ctx.getNodeParameter('chatId', i), 'Chat ID', i);
	const returnAll = ctx.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? Infinity : Math.max(1, Math.floor(ctx.getNodeParameter('limit', i, 50) as number));
	const filters = ctx.getNodeParameter('filters', i, {}) as { before?: string; after?: string };
	const before = toTimestamp(ctx, filters.before, 'Older Than', i);
	const after = toTimestamp(ctx, filters.after, 'Newer Than', i);
	if (before !== undefined && after !== undefined && before <= after) {
		throw new NodeOperationError(ctx.getNode(), '"Older Than" must be later than "Newer Than"', { itemIndex: i });
	}

	// MAX returns the newest messages first; `from` is an inclusive upper bound, `to` a lower bound.
	// Page backwards from the oldest message seen so far and drop the overlap by message ID.
	const messages: IDataObject[] = [];
	const seen = new Set<string>();
	let from = before;
	while (messages.length < limit) {
		const response = await maxApiRequest<{ messages?: IDataObject[] }>(ctx, {
			method: 'GET',
			path: '/messages',
			qs: compact({ chat_id: chatId, count: PAGE_SIZE, from, to: after }),
		});
		const page = response.messages ?? [];
		const fresh = page.filter((message) => {
			const mid = String((message.body as IDataObject | undefined)?.mid ?? '');
			if (seen.has(mid)) return false;
			seen.add(mid);
			return true;
		});
		if (fresh.length === 0) break;
		messages.push(...fresh);
		from = Math.min(...page.map((message) => Number(message.timestamp)));
		if (page.length < PAGE_SIZE) break;
	}
	return messages.slice(0, limit).map((message) => ({ json: message, pairedItem: { item: i } }));
};

export const answerCallback: OperationHandler = async (ctx, i) => {
	const callbackId = requireText(ctx, ctx.getNodeParameter('callbackId', i), 'Callback ID', i);
	const notification = (ctx.getNodeParameter('notification', i, '') as string).trim();
	const body: IDataObject = {};
	if (notification) body.notification = notification;
	if (ctx.getNodeParameter('updateMessage', i, false) as boolean) {
		const message = await editBody(ctx, i);
		if (Object.keys(message).length > 0) body.message = message;
	}
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Set a notification or a change to the message', {
			itemIndex: i,
		});
	}
	const response = await maxApiRequest(ctx, {
		method: 'POST',
		path: '/answers',
		qs: { callback_id: callbackId },
		body,
	});
	return out({ ...response, callbackId }, i);
};
