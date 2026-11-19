import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MaxBotApi implements ICredentialType {
	name = 'maxBotApi';

	displayName = 'MAX Bot API';

	icon: Icon = { light: 'file:../icons/max.svg', dark: 'file:../icons/max.svg' };

	documentationUrl = 'https://github.com/wildbots-dev/n8n-nodes-max-messenger#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Bot token from business.max.ru → Chat bots → your bot → Settings. Sent as the raw Authorization header.',
		},
		{
			displayName: 'API Domain',
			name: 'baseUrl',
			type: 'options',
			options: [
				{
					name: 'Automatic',
					value: 'auto',
					description:
						'Use platform-api2.max.ru, and platform-api.max.ru when this n8n host does not trust the certificate of platform-api2.max.ru',
				},
				{
					name: 'platform-api2.max.ru',
					value: 'https://platform-api2.max.ru',
					description:
						'Domain required by MAX. Its TLS certificate is issued by the Russian Trusted Root CA, which the n8n host must trust.',
				},
				{
					name: 'platform-api.max.ru (Legacy)',
					value: 'https://platform-api.max.ru',
					description: 'Previous domain with a globally trusted certificate',
				},
			],
			default: 'auto',
			description:
				'Automatic works on any n8n host. Pick a domain explicitly only if you need to.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if the TLS certificate cannot be verified. Not needed with the Automatic domain.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '={{$credentials.accessToken}}' } },
	};

	test: ICredentialTestRequest = {
		request: {
			// Automatic is tested on the domain every host trusts; requests still prefer platform-api2.max.ru.
			baseURL: "={{ $credentials.baseUrl === 'auto' ? 'https://platform-api.max.ru' : $credentials.baseUrl }}",
			url: '/me',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};
}
