import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { botFields, botOperations, videoFields, videoOperations } from './descriptions/bot';
import { chatFields, chatOperations } from './descriptions/chat';
import {
	messageAnswerCallbackFields,
	messageDeleteFields,
	messageEditFields,
	messageGetAllFields,
	messageGetFields,
	messageOperations,
	messageSendFields,
} from './descriptions/message';
import * as bot from './operations/bot';
import * as chat from './operations/chat';
import * as message from './operations/message';
import type { OperationHandler } from './operations/types';

const operations: Record<string, OperationHandler> = {
	'bot.getInfo': bot.getInfo,
	'bot.setCommands': bot.setCommands,
	'chat.get': chat.get,
	'chat.getAdmins': chat.getAdmins,
	'chat.getMembership': chat.getMembership,
	'chat.getMembers': chat.getMembers,
	'chat.getPinned': chat.getPinned,
	'chat.leave': chat.leave,
	'chat.pin': chat.pin,
	'chat.removeMember': chat.removeMember,
	'chat.sendAction': chat.sendAction,
	'chat.unpin': chat.unpin,
	'chat.update': chat.update,
	'message.answerCallback': message.answerCallback,
	'message.delete': message.remove,
	'message.edit': message.edit,
	'message.get': message.get,
	'message.getAll': message.getAll,
	'message.send': message.send,
	'video.get': bot.getVideo,
};

export class Max implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MAX',
		name: 'max',
		icon: { light: 'file:../../icons/max.svg', dark: 'file:../../icons/max.svg' },
		group: ['output'],
		version: [1],
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Send messages and manage chats with a MAX messenger bot',
		defaults: { name: 'MAX' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'maxBotApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Bot', value: 'bot' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Message', value: 'message' },
					{ name: 'Video', value: 'video' },
				],
				default: 'message',
			},
			messageOperations,
			...messageSendFields,
			...messageEditFields,
			...messageDeleteFields,
			...messageGetFields,
			...messageGetAllFields,
			...messageAnswerCallbackFields,
			chatOperations,
			...chatFields,
			botOperations,
			...botFields,
			videoOperations,
			...videoFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const handler = operations[`${resource}.${operation}`];
		if (!handler) {
			throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource}.${operation}`);
		}

		const returnData: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				returnData.push(...(await handler(this, i)));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				const known = error instanceof NodeApiError || error instanceof NodeOperationError;
				const wrapped = known
					? (error as NodeApiError | NodeOperationError)
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				if (wrapped.context.itemIndex === undefined) wrapped.context.itemIndex = i;
				throw wrapped;
			}
		}
		return [returnData];
	}
}
