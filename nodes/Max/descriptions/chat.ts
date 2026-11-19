import type { INodeProperties } from 'n8n-workflow';
import { chatIdField, messageIdField, show, userIdField } from './shared';

export const chatOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['chat'] } },
	options: [
		{ name: 'Get', value: 'get', description: 'Get information about a chat', action: 'Get a chat' },
		{
			name: 'Get Administrators',
			value: 'getAdmins',
			description: 'List the administrators of a chat',
			action: 'Get chat administrators',
		},
		{
			name: 'Get Bot Membership',
			value: 'getMembership',
			description: 'Get the bot’s own membership and permissions in a chat',
			action: 'Get bot membership in a chat',
		},
		{
			name: 'Get Members',
			value: 'getMembers',
			description: 'List the members of a chat',
			action: 'Get chat members',
		},
		{
			name: 'Get Pinned Message',
			value: 'getPinned',
			description: 'Get the pinned message of a chat',
			action: 'Get the pinned message',
		},
		{ name: 'Leave', value: 'leave', description: 'Make the bot leave a chat', action: 'Leave a chat' },
		{ name: 'Pin Message', value: 'pin', description: 'Pin a message in a chat', action: 'Pin a message' },
		{
			name: 'Remove Member',
			value: 'removeMember',
			description: 'Remove a user from a chat',
			action: 'Remove a chat member',
		},
		{
			name: 'Send Action',
			value: 'sendAction',
			description: 'Show "typing…" or "sending a file…" in a chat',
			action: 'Send a chat action',
		},
		{ name: 'Unpin Message', value: 'unpin', description: 'Unpin the pinned message', action: 'Unpin a message' },
		{
			name: 'Update',
			value: 'update',
			description: 'Change the title or description of a chat',
			action: 'Update a chat',
		},
	],
	default: 'get',
};

const allChatOperations = [
	'get',
	'getAdmins',
	'getMembership',
	'getMembers',
	'getPinned',
	'leave',
	'pin',
	'removeMember',
	'sendAction',
	'unpin',
	'update',
];

export const chatFields: INodeProperties[] = [
	chatIdField(show('chat', allChatOperations)),

	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: show('chat', ['get', 'getMembers', 'getAdmins']),
	},

	// Update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('chat', ['update']),
		description: 'The bot must be an administrator of the chat',
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Up to 16000 characters',
			},
			{
				displayName: 'Notify',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether members get a notification about the change',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: '1–200 characters',
			},
		],
	},

	// Send Action
	{
		displayName: 'Action',
		name: 'action',
		type: 'options',
		options: [
			{ name: 'Sending Audio', value: 'sending_audio' },
			{ name: 'Sending File', value: 'sending_file' },
			{ name: 'Sending Photo', value: 'sending_photo' },
			{ name: 'Sending Video', value: 'sending_video' },
			{ name: 'Typing', value: 'typing_on' },
		],
		default: 'typing_on',
		displayOptions: show('chat', ['sendAction']),
	},

	// Pin
	messageIdField(show('chat', ['pin']), 'ID of the message to pin (<code>body.mid</code>)'),
	{
		displayName: 'Notify',
		name: 'notify',
		type: 'boolean',
		default: true,
		description: 'Whether members get a notification about the pinned message',
		displayOptions: show('chat', ['pin']),
	},

	// Get Members
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show('chat', ['getMembers']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show('chat', ['getMembers'], { returnAll: [false] }),
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('chat', ['getMembers']),
		options: [
			{
				displayName: 'User IDs',
				name: 'userIds',
				type: 'string',
				default: '',
				placeholder: 'e.g. 123456789, 987654321',
				description: 'Comma-separated user IDs. Only these members are returned.',
			},
		],
	},

	// Remove Member
	userIdField(show('chat', ['removeMember']), 'ID of the user to remove'),
	{
		displayName: 'Block',
		name: 'block',
		type: 'boolean',
		default: false,
		description: 'Whether to also block the user. Works only in chats with an invite link.',
		displayOptions: show('chat', ['removeMember']),
	},
];
