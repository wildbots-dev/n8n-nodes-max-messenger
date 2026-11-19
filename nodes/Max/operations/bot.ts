import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { maxApiRequest } from '../lib/api';
import { requireText } from '../lib/compose';
import type { OperationHandler } from './types';

const MAX_COMMANDS = 32;

export const getInfo: OperationHandler = async (ctx, i) => {
	const me = await maxApiRequest(ctx, { method: 'GET', path: '/me' });
	return [{ json: me, pairedItem: { item: i } }];
};

export const setCommands: OperationHandler = async (ctx, i) => {
	const inputs = ctx.getNodeParameter('commands.command', i, []) as Array<{
		name?: string;
		description?: string;
	}>;
	if (inputs.length > MAX_COMMANDS) {
		throw new NodeOperationError(ctx.getNode(), `A bot can have at most ${MAX_COMMANDS} commands`, {
			itemIndex: i,
		});
	}
	const commands = inputs.map((input) => {
		const name = requireText(ctx, input.name, 'Command name', i).replace(/^\//, '');
		if (name.length > 64) {
			throw new NodeOperationError(ctx.getNode(), `Command "${name}" is longer than 64 characters`, {
				itemIndex: i,
			});
		}
		const description = (input.description ?? '').trim();
		if (description.length > 128) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Description of command "${name}" is longer than 128 characters`,
				{ itemIndex: i },
			);
		}
		const command: IDataObject = { name };
		if (description) command.description = description;
		return command;
	});
	const response = await maxApiRequest(ctx, {
		method: 'PATCH',
		path: '/me/commands',
		body: { commands },
	});
	return [{ json: response, pairedItem: { item: i } }];
};

export const getVideo: OperationHandler = async (ctx, i) => {
	const token = requireText(ctx, ctx.getNodeParameter('videoId', i), 'Video token', i);
	const video = await maxApiRequest(ctx, {
		method: 'GET',
		path: `/videos/${encodeURIComponent(token)}`,
	});
	return [{ json: video, pairedItem: { item: i } }];
};
