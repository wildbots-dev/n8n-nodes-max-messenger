import type { INodeProperties } from 'n8n-workflow';
import {
	attachmentsField,
	chatIdField,
	keyboardFields,
	messageIdField,
	show,
	textFormatField,
	userIdField,
} from './shared';

export const messageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['message'] } },
	options: [
		{
			name: 'Answer Callback',
			value: 'answerCallback',
			description: 'Answer a button press: show a notification and/or update the message',
			action: 'Answer a callback',
		},
		{ name: 'Delete', value: 'delete', description: 'Delete a message', action: 'Delete a message' },
		{
			name: 'Edit',
			value: 'edit',
			description: 'Change the text, attachments or keyboard of a message',
			action: 'Edit a message',
		},
		{ name: 'Get', value: 'get', description: 'Get a message by ID', action: 'Get a message' },
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get recent messages of a chat',
			action: 'Get many messages',
		},
		{
			name: 'Send',
			value: 'send',
			description: 'Send a message to a chat, channel or user',
			action: 'Send a message',
		},
	],
	default: 'send',
};

const send = (extra = {}) => show('message', ['send'], extra);
const edit = (extra = {}) => show('message', ['edit'], extra);
const answer = (extra = {}) => show('message', ['answerCallback'], extra);

export const messageSendFields: INodeProperties[] = [
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		options: [
			{ name: 'Chat or Channel', value: 'chat', description: 'Send by chat ID (groups, channels and dialogs)' },
			{ name: 'User', value: 'user', description: 'Send to a dialog with a user by user ID' },
		],
		default: 'chat',
		displayOptions: send(),
	},
	chatIdField(send({ sendTo: ['chat'] })),
	userIdField(send({ sendTo: ['user'] }), 'ID of the user. The user must have started the bot first.'),
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description:
			'Message text. Longer than 4000 characters is split into several messages unless disabled in the options. Can be empty if the message has attachments.',
		displayOptions: send(),
	},
	textFormatField(send()),
	attachmentsField(send()),
	...keyboardFields(send()),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: send(),
		options: [
			{
				displayName: 'Disable Link Preview',
				name: 'disableLinkPreview',
				type: 'boolean',
				default: false,
				description: 'Whether to send links without a preview',
			},
			{
				displayName: 'Forward Message ID',
				name: 'forwardMessageId',
				type: 'string',
				default: '',
				description: 'ID of a message to forward along with this one',
			},
			{
				displayName: 'Notify',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether chat members get a notification. Channels always notify.',
			},
			{
				displayName: 'Reply To Message ID',
				name: 'replyToMessageId',
				type: 'string',
				default: '',
				description: 'ID of the message to reply to',
			},
			{
				displayName: 'Split Long Text',
				name: 'splitLongText',
				type: 'boolean',
				default: true,
				description:
					'Whether to split text longer than 4000 characters into several messages. Attachments go with the first one, the keyboard with the last. Formatting that spans a split point is not preserved.',
			},
		],
	},
];

const attachmentsModeField = (displayOptions: ReturnType<typeof show>): INodeProperties => ({
	displayName: 'Attachments and Keyboard',
	name: 'attachmentsMode',
	type: 'options',
	options: [
		{ name: 'Keep Unchanged', value: 'keep' },
		{
			name: 'Replace',
			value: 'replace',
			description: 'Replace all attachments and the keyboard with the ones set below',
		},
		{ name: 'Remove All', value: 'remove', description: 'Remove all attachments and the keyboard' },
	],
	default: 'keep',
	description: 'MAX stores the keyboard as an attachment, so both are replaced together',
	displayOptions,
});

export const messageEditFields: INodeProperties[] = [
	messageIdField(edit()),
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'New text, up to 4000 characters. Leave empty to keep the current text.',
		displayOptions: edit(),
	},
	textFormatField(edit()),
	attachmentsModeField(edit()),
	attachmentsField(edit({ attachmentsMode: ['replace'] })),
	...keyboardFields(edit({ attachmentsMode: ['replace'] })),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: edit(),
		options: [
			{
				displayName: 'Notify',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether chat members get a notification about the change',
			},
		],
	},
];

export const messageDeleteFields: INodeProperties[] = [messageIdField(show('message', ['delete']))];

export const messageGetFields: INodeProperties[] = [messageIdField(show('message', ['get']))];

export const messageGetAllFields: INodeProperties[] = [
	chatIdField(show('message', ['getAll']), 'ID of the chat or channel. The bot must be an administrator there.'),
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show('message', ['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show('message', ['getAll'], { returnAll: [false] }),
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('message', ['getAll']),
		options: [
			{
				displayName: 'Older Than',
				name: 'before',
				type: 'dateTime',
				default: '',
				description: 'Only return messages sent before this time',
			},
			{
				displayName: 'Newer Than',
				name: 'after',
				type: 'dateTime',
				default: '',
				description: 'Only return messages sent after this time',
			},
		],
	},
];

export const messageAnswerCallbackFields: INodeProperties[] = [
	{
		displayName: 'Callback ID',
		name: 'callbackId',
		type: 'string',
		required: true,
		default: '={{ $json.callback.callback_id }}',
		description: 'ID of the button press from the message_callback update',
		displayOptions: answer(),
	},
	{
		displayName: 'Notification',
		name: 'notification',
		type: 'string',
		default: '',
		description: 'Short text shown to the user who pressed the button',
		displayOptions: answer(),
	},
	{
		displayName: 'Update Message',
		name: 'updateMessage',
		type: 'boolean',
		default: false,
		description: 'Whether to also change the message that holds the button',
		displayOptions: answer(),
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'New text of the message, up to 4000 characters. Leave empty to keep the current text.',
		displayOptions: answer({ updateMessage: [true] }),
	},
	textFormatField(answer({ updateMessage: [true] })),
	attachmentsModeField(answer({ updateMessage: [true] })),
	attachmentsField(answer({ updateMessage: [true], attachmentsMode: ['replace'] })),
	...keyboardFields(answer({ updateMessage: [true], attachmentsMode: ['replace'] })),
];
