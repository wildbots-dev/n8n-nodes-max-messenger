import { maxApiRequest } from '../lib/api';
import { requireText } from '../lib/compose';
import type { OperationHandler } from './types';

export const get: OperationHandler = async (ctx, i) => {
	const token = requireText(ctx, ctx.getNodeParameter('videoId', i), 'Video token', i);
	const video = await maxApiRequest(ctx, {
		method: 'GET',
		path: `/videos/${encodeURIComponent(token)}`,
	});
	return [{ json: video, pairedItem: { item: i } }];
};
