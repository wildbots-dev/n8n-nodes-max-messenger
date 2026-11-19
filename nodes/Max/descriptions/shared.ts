import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

export type Show = NonNullable<IDisplayOptions['show']>;

export function show(resource: string, operations: string[], extra: Show = {}): IDisplayOptions {
	return { show: { resource: [resource], operation: operations, ...extra } };
}

export function chatIdField(displayOptions: IDisplayOptions, description?: string): INodeProperties {
	return {
		displayName: 'Chat ID',
		name: 'chatId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. -71234567890123',
		description:
			description ??
			'ID of the chat, channel or dialog. In a workflow started by the MAX Trigger use <code>{{ $json.message.recipient.chat_id }}</code>.',
		displayOptions,
	};
}

export function messageIdField(displayOptions: IDisplayOptions, description?: string): INodeProperties {
	return {
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. mid.ffffbc00a1b2c3d4',
		description: description ?? 'ID of the message, found in <code>body.mid</code> of a message',
		displayOptions,
	};
}

export function userIdField(displayOptions: IDisplayOptions, description?: string): INodeProperties {
	return {
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 123456789',
		description: description ?? 'ID of the MAX user',
		displayOptions,
	};
}

export function textFormatField(displayOptions: IDisplayOptions): INodeProperties {
	return {
		displayName: 'Text Format',
		name: 'format',
		type: 'options',
		options: [
			{ name: 'Plain Text', value: 'plain' },
			{
				name: 'Markdown',
				value: 'markdown',
				description: '**bold**, *italic*, ~~strike~~, ++underline++, `code`, [link](URL)',
			},
			{
				name: 'HTML',
				value: 'html',
				description: '&lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;code&gt;, &lt;a href&gt;',
			},
		],
		default: 'plain',
		description: 'How MAX should interpret formatting characters in the text',
		displayOptions,
	};
}

const buttonTypeOptions = [
	{
		name: 'Callback',
		value: 'callback',
		description: 'Sends a message_callback update with the payload to the bot',
	},
	{ name: 'Copy to Clipboard', value: 'clipboard', description: 'Copies the payload to the clipboard' },
	{ name: 'Link', value: 'link', description: 'Opens a URL' },
	{ name: 'Open Mini App', value: 'open_app', description: 'Opens a mini app' },
	{
		name: 'Request Contact',
		value: 'request_contact',
		description: 'Asks the user to share their phone number',
	},
	{
		name: 'Request Location',
		value: 'request_geo_location',
		description: 'Asks the user to share their location',
	},
	{
		name: 'Send Message',
		value: 'message',
		description: 'Sends the button text as a message from the user',
	},
];

const mediaTypeOptions = [
	{ name: 'Audio', value: 'audio' },
	{ name: 'File', value: 'file' },
	{ name: 'Image', value: 'image' },
	{ name: 'Video', value: 'video' },
];

/** "Inline Keyboard" selector plus the button list and JSON fields. */
export function keyboardFields(displayOptions: IDisplayOptions): INodeProperties[] {
	const base = displayOptions.show ?? {};
	return [
		{
			displayName: 'Inline Keyboard',
			name: 'keyboard',
			type: 'options',
			options: [
				{ name: 'None', value: 'none' },
				{ name: 'Buttons', value: 'buttons', description: 'Build the keyboard button by button' },
				{ name: 'JSON', value: 'json', description: 'Pass the rows of buttons as JSON' },
			],
			default: 'none',
			displayOptions,
		},
		{
			displayName: 'Buttons',
			name: 'buttons',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true, sortable: true },
			placeholder: 'Add Button',
			default: {},
			description:
				'Up to 7 buttons per row (3 if the row has a link, mini app, contact or location button), up to 30 rows',
			displayOptions: { show: { ...base, keyboard: ['buttons'] } },
			options: [
				{
					name: 'button',
					displayName: 'Button',
					values: [
						{
							displayName: 'Button Text',
							name: 'text',
							type: 'string',
							default: '',
							description: 'Button label, 1–128 characters',
						},
						{
							displayName: 'Button Type',
							name: 'type',
							type: 'options',
							options: buttonTypeOptions,
							default: 'callback',
						},
						{
							displayName: 'Mini App',
							name: 'webApp',
							type: 'string',
							default: '',
							description: 'Username or link of the bot whose mini app should open',
							displayOptions: { show: { type: ['open_app'] } },
						},
						{
							displayName: 'Mini App Bot ID',
							name: 'contactId',
							type: 'number',
							default: 0,
							description: 'ID of the bot whose mini app should open (optional)',
							displayOptions: { show: { type: ['open_app'] } },
						},
						{
							displayName: 'Payload',
							name: 'payload',
							type: 'string',
							default: '',
							description:
								'Up to 1024 characters. For callback buttons it comes back in the message_callback update.',
							displayOptions: { show: { type: ['callback', 'clipboard', 'open_app'] } },
						},
						{
							displayName: 'Quick',
							name: 'quick',
							type: 'boolean',
							default: false,
							description: 'Whether to send the location without asking the user to confirm',
							displayOptions: { show: { type: ['request_geo_location'] } },
						},
						{
							displayName: 'Row',
							name: 'row',
							type: 'number',
							typeOptions: { minValue: 1, maxValue: 30 },
							default: 1,
							description:
								'Row the button goes to. Buttons with the same row number sit side by side.',
						},
						{
							displayName: 'URL',
							name: 'url',
							type: 'string',
							default: '',
							placeholder: 'e.g. https://example.com',
							displayOptions: { show: { type: ['link'] } },
						},
					],
				},
			],
		},
		{
			displayName: 'Keyboard JSON',
			name: 'keyboardJson',
			type: 'json',
			default: '[[{"type": "callback", "text": "Yes", "payload": "yes"}]]',
			description:
				'Array of rows, each row an array of buttons as described in the MAX API (types: callback, link, message, request_contact, request_geo_location, clipboard, open_app)',
			displayOptions: { show: { ...base, keyboard: ['json'] } },
		},
	];
}

/** Attachments: files from binary fields, image URLs, tokens of uploaded files, stickers, locations. */
export function attachmentsField(displayOptions: IDisplayOptions): INodeProperties {
	return {
		displayName: 'Attachments',
		name: 'attachments',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Attachment',
		default: {},
		description:
			'Up to 12 attachments. Images and videos can be combined; a file, audio, sticker or location must be the only attachment.',
		displayOptions,
		options: [
			{
				name: 'attachment',
				displayName: 'Attachment',
				values: [
					{
						displayName: 'Attachment Source',
						name: 'source',
						type: 'options',
						options: [
							{
								name: 'Binary File',
								value: 'binary',
								description: 'Upload a file from a binary field of the input item',
							},
							{ name: 'Image URL', value: 'url', description: 'Public URL of an image' },
							{ name: 'Location', value: 'location', description: 'Point on the map' },
							{ name: 'Sticker', value: 'sticker', description: 'Sticker code' },
							{
								name: 'Token',
								value: 'token',
								description: 'Token of a file already uploaded to MAX, e.g. from a received message',
							},
						],
						default: 'binary',
					},
					{
						displayName: 'Attachment Type',
						name: 'tokenType',
						type: 'options',
						options: mediaTypeOptions,
						default: 'image',
						displayOptions: { show: { source: ['token'] } },
					},
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description: 'Overrides the file name from the binary field (max 200 characters)',
						displayOptions: { show: { source: ['binary'] } },
					},
					{
						displayName: 'Image URL',
						name: 'url',
						type: 'string',
						default: '',
						placeholder: 'e.g. https://example.com/picture.jpg',
						displayOptions: { show: { source: ['url'] } },
					},
					{
						displayName: 'Input Binary Field',
						name: 'binaryPropertyName',
						type: 'string',
						default: 'data',
						hint: 'The name of the input binary field containing the file to be sent',
						displayOptions: { show: { source: ['binary'] } },
					},
					{
						displayName: 'Latitude',
						name: 'latitude',
						type: 'number',
						typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 6 },
						default: 0,
						displayOptions: { show: { source: ['location'] } },
					},
					{
						displayName: 'Longitude',
						name: 'longitude',
						type: 'number',
						typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 6 },
						default: 0,
						displayOptions: { show: { source: ['location'] } },
					},
					{
						displayName: 'Send As',
						name: 'mediaType',
						type: 'options',
						options: [{ name: 'Auto-Detect From MIME Type', value: 'auto' }, ...mediaTypeOptions],
						default: 'auto',
						displayOptions: { show: { source: ['binary'] } },
					},
					{
						displayName: 'Sticker Code',
						name: 'code',
						type: 'string',
						default: '',
						description: 'For a received sticker use <code>payload.code</code>',
						displayOptions: { show: { source: ['sticker'] } },
					},
					{
						displayName: 'Token',
						name: 'fileRef',
						type: 'string',
						default: '',
						description: 'For a received attachment use <code>payload.token</code>',
						displayOptions: { show: { source: ['token'] } },
					},
				],
			},
		],
	};
}
