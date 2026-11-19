import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, randomString } from 'n8n-workflow';
import { maxApiRequest } from '../Max/lib/api';
import { UPDATE_TYPES, matchesSubscription, secretMatches } from './lib/subscription';

interface Subscription {
	url: string;
	update_types?: string[] | null;
}

interface TriggerStaticData {
	webhookSecret?: string;
	webhookUrl?: string;
}

function selectedUpdates(ctx: IHookFunctions | IWebhookFunctions): string[] {
	return ctx.getNodeParameter('updates', []) as string[];
}

export class MaxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MAX Trigger',
		name: 'maxTrigger',
		icon: { light: 'file:../../icons/max.svg', dark: 'file:../../icons/max.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{ $parameter["updates"].join(", ") }}',
		description: 'Starts the workflow when a MAX messenger bot receives an update',
		defaults: { name: 'MAX Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'maxBotApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'MAX delivers updates only to a public HTTPS address on port 443 with a trusted certificate. Your n8n instance must be reachable that way. Other webhooks of the bot, for example from a CRM, keep working.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Trigger On',
				name: 'updates',
				type: 'multiOptions',
				required: true,
				options: UPDATE_TYPES.map((update) => ({
					name: update.name,
					value: update.value,
					description: update.description,
				})),
				default: ['message_created', 'message_callback', 'bot_started'],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				const response = await maxApiRequest<{ subscriptions?: Subscription[] }>(this, {
					method: 'GET',
					path: '/subscriptions',
				});
				const existing = (response.subscriptions ?? []).find((s) => s.url === webhookUrl);
				if (!existing) return false;
				// The secret cannot be read back from MAX; without it in static data the
				// subscription is re-created so incoming requests can be verified.
				if (!staticData.webhookSecret || staticData.webhookUrl !== webhookUrl) return false;
				return matchesSubscription(existing.update_types, selectedUpdates(this));
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				const secret = randomString(48);
				await maxApiRequest(this, {
					method: 'POST',
					path: '/subscriptions',
					body: { url: webhookUrl, update_types: selectedUpdates(this), secret },
				});
				staticData.webhookSecret = secret;
				staticData.webhookUrl = webhookUrl;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				// Only this workflow's own URL is removed; other subscriptions of the bot stay.
				await maxApiRequest(this, {
					method: 'DELETE',
					path: '/subscriptions',
					qs: { url: webhookUrl },
				});
				delete staticData.webhookSecret;
				delete staticData.webhookUrl;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
		const headers = this.getHeaderData() as Record<string, string | string[] | undefined>;
		if (!secretMatches(staticData.webhookSecret, headers['x-max-bot-api-secret'])) {
			const res = this.getResponseObject();
			res.status(403).send('Forbidden');
			return { noWebhookResponse: true };
		}
		const update = this.getBodyData() as IDataObject;
		const wanted = selectedUpdates(this);
		if (typeof update.update_type !== 'string' || !wanted.includes(update.update_type)) {
			// Acknowledge so MAX does not retry, but do not start the workflow.
			return { webhookResponse: 'OK' };
		}
		return { workflowData: [this.helpers.returnJsonArray([update])] };
	}
}
