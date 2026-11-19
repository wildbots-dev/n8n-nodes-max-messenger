import type { INodeProperties } from 'n8n-workflow';
import { show } from './shared';

export const botOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['bot'] } },
	options: [
		{
			name: 'Get Info',
			value: 'getInfo',
			description: 'Get the name, username and commands of the bot',
			action: 'Get bot info',
		},
		{
			name: 'Set Commands',
			value: 'setCommands',
			description: 'Replace the list of commands shown in the bot menu',
			action: 'Set bot commands',
		},
	],
	default: 'getInfo',
};

export const botFields: INodeProperties[] = [
	{
		displayName: 'Commands',
		name: 'commands',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Command',
		default: {},
		description: 'Up to 32 commands. An empty list removes all commands.',
		displayOptions: show('bot', ['setCommands']),
		options: [
			{
				name: 'command',
				displayName: 'Command',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'e.g. start',
						description: 'Command without the leading slash, 1–64 characters',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Up to 128 characters',
					},
				],
			},
		],
	},
];

export const videoOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['video'] } },
	options: [
		{
			name: 'Get',
			value: 'get',
			description: 'Get playback URLs, size and duration of a video attachment',
			action: 'Get a video',
		},
	],
	default: 'get',
};

export const videoFields: INodeProperties[] = [
	{
		displayName: 'Video Token',
		name: 'videoId',
		type: 'string',
		required: true,
		default: '',
		description: 'Token of the video attachment (<code>payload.token</code> of a received video)',
		displayOptions: show('video', ['get']),
	},
];
