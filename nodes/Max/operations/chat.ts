import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { compact, maxApiRequest } from '../lib/api';
import { parseId, pick, requireText } from '../lib/compose';
import type { OperationHandler } from './types';

const PAGE_SIZE = 100;

const CHAT_FIELDS = [
	'chat_id',
	'type',
	'status',
	'title',
	'description',
	'participants_count',
	'is_public',
	'link',
	'owner_id',
	'dialog_with_user',
];
const MEMBER_FIELDS = [
	'user_id',
	'first_name',
	'last_name',
	'username',
	'is_bot',
	'is_owner',
	'is_admin',
	'join_time',
	'permissions',
	'alias',
];

function simplified(ctx: Parameters<OperationHandler>[0], i: number, list: IDataObject[], fields: string[]) {
	return ctx.getNodeParameter('simplify', i, true) ? list.map((obj) => pick(obj, fields)) : list;
}

function out(json: IDataObject, itemIndex: number): INodeExecutionData[] {
	return [{ json, pairedItem: { item: itemIndex } }];
}

function many(list: IDataObject[] | undefined, itemIndex: number): INodeExecutionData[] {
	return (list ?? []).map((json) => ({ json, pairedItem: { item: itemIndex } }));
}

function chatPath(ctx: Parameters<OperationHandler>[0], i: number, suffix = ''): { chatId: string; path: string } {
	const chatId = parseId(ctx, ctx.getNodeParameter('chatId', i), 'Chat ID', i);
	return { chatId, path: `/chats/${chatId}${suffix}` };
}

export const get: OperationHandler = async (ctx, i) => {
	const { path } = chatPath(ctx, i);
	const chat = await maxApiRequest(ctx, { method: 'GET', path });
	return out(simplified(ctx, i, [chat], CHAT_FIELDS)[0], i);
};

export const update: OperationHandler = async (ctx, i) => {
	const { path } = chatPath(ctx, i);
	const fields = ctx.getNodeParameter('updateFields', i, {}) as {
		title?: string;
		description?: string;
		notify?: boolean;
	};
	const body: IDataObject = {};
	if (fields.title !== undefined && fields.title.trim() !== '') body.title = fields.title.trim();
	// An empty description is meaningful: it clears the description.
	if (fields.description !== undefined) body.description = fields.description;
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Add a title or a description to change', { itemIndex: i });
	}
	if (fields.notify === false) body.notify = false;
	return out(await maxApiRequest(ctx, { method: 'PATCH', path, body }), i);
};

export const sendAction: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/actions');
	const action = ctx.getNodeParameter('action', i) as string;
	const response = await maxApiRequest(ctx, { method: 'POST', path, body: { action } });
	return out({ ...response, chatId, action }, i);
};

export const pin: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/pin');
	const messageId = requireText(ctx, ctx.getNodeParameter('messageId', i), 'Message ID', i);
	const notify = ctx.getNodeParameter('notify', i, true) as boolean;
	const body: IDataObject = { message_id: messageId };
	if (!notify) body.notify = false;
	const response = await maxApiRequest(ctx, { method: 'PUT', path, body });
	return out({ ...response, chatId, messageId }, i);
};

export const unpin: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/pin');
	const response = await maxApiRequest(ctx, { method: 'DELETE', path });
	return out({ ...response, chatId }, i);
};

export const getPinned: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/pin');
	const response = await maxApiRequest<{ message?: IDataObject | null } | null>(ctx, {
		method: 'GET',
		path,
	});
	return out({ chatId, message: response?.message ?? null }, i);
};

export const getMembers: OperationHandler = async (ctx, i) => {
	const { path } = chatPath(ctx, i, '/members');
	const returnAll = ctx.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? Infinity : Math.max(1, Math.floor(ctx.getNodeParameter('limit', i, 50) as number));
	const filters = ctx.getNodeParameter('filters', i, {}) as { userIds?: string };
	const userIds = (filters.userIds ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
		.map((id) => parseId(ctx, id, 'User ID', i));

	if (userIds.length > 0) {
		const response = await maxApiRequest<{ members?: IDataObject[] }>(ctx, {
			method: 'GET',
			path,
			qs: { user_ids: userIds.join(',') },
		});
		return many(simplified(ctx, i, response.members ?? [], MEMBER_FIELDS), i);
	}

	const members: IDataObject[] = [];
	let marker: unknown;
	do {
		const count = Math.min(PAGE_SIZE, limit - members.length);
		const response = await maxApiRequest<{ members?: IDataObject[]; marker?: unknown }>(ctx, {
			method: 'GET',
			path,
			qs: compact({ count, marker: marker as string | undefined }),
		});
		members.push(...(response.members ?? []));
		marker = response.marker;
		if (!response.members?.length) break;
	} while (marker !== undefined && marker !== null && members.length < limit);
	return many(simplified(ctx, i, members.slice(0, limit), MEMBER_FIELDS), i);
};

export const getAdmins: OperationHandler = async (ctx, i) => {
	const { path } = chatPath(ctx, i, '/members/admins');
	const response = await maxApiRequest<{ members?: IDataObject[] }>(ctx, { method: 'GET', path });
	return many(simplified(ctx, i, response.members ?? [], MEMBER_FIELDS), i);
};

export const getMembership: OperationHandler = async (ctx, i) => {
	const { path } = chatPath(ctx, i, '/members/me');
	const member = await maxApiRequest(ctx, { method: 'GET', path });
	return out(simplified(ctx, i, [member], MEMBER_FIELDS)[0], i);
};

export const removeMember: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/members');
	const userId = parseId(ctx, ctx.getNodeParameter('userId', i), 'User ID', i);
	const block = ctx.getNodeParameter('block', i, false) as boolean;
	const qs: IDataObject = { user_id: userId };
	if (block) qs.block = true;
	const response = await maxApiRequest(ctx, { method: 'DELETE', path, qs });
	return out({ ...response, chatId, userId }, i);
};

export const leave: OperationHandler = async (ctx, i) => {
	const { chatId, path } = chatPath(ctx, i, '/members/me');
	const response = await maxApiRequest(ctx, { method: 'DELETE', path });
	return out({ ...response, chatId }, i);
};
