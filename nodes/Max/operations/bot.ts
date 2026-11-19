import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { maxApiRequest } from '../lib/api';
import { pick, requireText } from '../lib/compose';
import type { OperationHandler } from './types';

const MAX_COMMANDS = 32;

const BOT_FIELDS = ['user_id', 'first_name', 'last_name', 'username', 'is_bot', 'description', 'commands'];

export const getInfo: OperationHandler = async (ctx, i) => {
	const me = await maxApiRequest(ctx, { method: 'GET', path: '/me' });
	const json = ctx.getNodeParameter('simplify', i, true) ? pick(me, BOT_FIELDS) : me;
	return [{ json, pairedItem: { item: i } }];
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
		const name = requireText(ctx, String(input.name ?? '').trim().replace(/^\//, ''), 'Command name', i);
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
