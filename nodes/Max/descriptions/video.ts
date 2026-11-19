import type { INodeProperties } from 'n8n-workflow';
import { show } from './shared';

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
