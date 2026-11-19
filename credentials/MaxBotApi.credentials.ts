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

	documentationUrl = 'https://github.com/Aimagine-life/n8n-nodes-max-messenger#credentials';

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
					name: 'platform-api2.max.ru',
					value: 'https://platform-api2.max.ru',
					description:
						'Current domain required by MAX. Its TLS certificate is issued by the Russian Trusted Root CA.',
				},
				{
					name: 'platform-api.max.ru (Legacy)',
					value: 'https://platform-api.max.ru',
					description: 'Previous domain with a globally trusted certificate. MAX asks bots to move off it.',
				},
			],
			default: 'https://platform-api2.max.ru',
			description:
				'If n8n does not trust the Russian Trusted Root CA, install it on the host (see the README) or enable "Ignore SSL Issues" below',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if the TLS certificate cannot be verified. Only needed for platform-api2.max.ru when the Russian Trusted Root CA is not installed on the n8n host.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '={{$credentials.accessToken}}' } },
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};
}
