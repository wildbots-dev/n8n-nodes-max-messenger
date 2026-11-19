import { timingSafeEqual } from 'crypto';

export const UPDATE_TYPES = [
	{ name: 'Bot Added to Chat', value: 'bot_added', description: 'The bot was added to a group chat or channel' },
	{
		name: 'Bot Permissions Changed',
		value: 'bot_admin_permissions_changed',
		description: 'The bot’s administrator rights in a chat changed',
	},
	{ name: 'Bot Removed From Chat', value: 'bot_removed', description: 'The bot was removed from a chat' },
	{ name: 'Bot Started', value: 'bot_started', description: 'A user pressed Start in a dialog with the bot' },
	{ name: 'Bot Stopped', value: 'bot_stopped', description: 'A user stopped the bot' },
	{ name: 'Button Pressed', value: 'message_callback', description: 'A user pressed a callback button' },
	{ name: 'Chat Title Changed', value: 'chat_title_changed' },
	{ name: 'Comment Created', value: 'comment_created', description: 'A new comment under a channel post' },
	{ name: 'Comment Edited', value: 'comment_edited' },
	{ name: 'Comment Removed', value: 'comment_removed' },
	{ name: 'Dialog Cleared', value: 'dialog_cleared' },
	{ name: 'Dialog Muted', value: 'dialog_muted' },
	{ name: 'Dialog Removed', value: 'dialog_removed' },
	{ name: 'Dialog Unmuted', value: 'dialog_unmuted' },
	{ name: 'Message Edited', value: 'message_edited' },
	{ name: 'Message Received', value: 'message_created', description: 'A new message in a dialog, chat or channel' },
	{ name: 'Message Removed', value: 'message_removed' },
	{ name: 'User Added to Chat', value: 'user_added' },
	{ name: 'User Removed From Chat', value: 'user_removed' },
];

/** Whether the update types stored at MAX equal the ones selected in the node. */
export function matchesSubscription(stored: string[] | null | undefined, selected: string[]): boolean {
	const a = [...new Set(stored ?? [])].sort();
	const b = [...new Set(selected)].sort();
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Constant-time comparison of the X-Max-Bot-Api-Secret header with the stored secret. */
export function secretMatches(expected: string | undefined, received: string | string[] | undefined): boolean {
	if (!expected) return false;
	const value = Array.isArray(received) ? received[0] : received;
	if (typeof value !== 'string') return false;
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(value, 'utf8');
	return a.length === b.length && timingSafeEqual(a, b);
}
