import type { IDataObject } from 'n8n-workflow';

export const BUTTON_TYPES = [
	'callback',
	'link',
	'message',
	'request_contact',
	'request_geo_location',
	'clipboard',
	'open_app',
] as const;

export type ButtonType = (typeof BUTTON_TYPES)[number];

/** One row of the "Buttons" fixed collection in the node UI. */
export interface ButtonInput {
	row?: number;
	type: ButtonType;
	text: string;
	payload?: string;
	url?: string;
	webApp?: string;
	contactId?: number;
	quick?: boolean;
}

export const MAX_BUTTONS_PER_ROW = 7;
export const MAX_ROWS = 30;
/** Rows that contain one of these button types may hold at most 3 buttons. */
const WIDE_TYPES = new Set<ButtonType>(['link', 'open_app', 'request_geo_location', 'request_contact']);
const MAX_WIDE_BUTTONS_PER_ROW = 3;

/** Reports a validation problem; the caller decides which n8n error to raise. */
export type Fail = (message: string) => never;

function buildButton(input: ButtonInput, fail: Fail): IDataObject {
	const text = (input.text ?? '').trim();
	if (text.length === 0 || text.length > 128) {
		fail(`Button text must be 1–128 characters long (got "${text}")`);
	}
	switch (input.type) {
		case 'callback':
		case 'clipboard': {
			const payload = input.payload ?? '';
			if (payload.length === 0) {
				fail(`Button "${text}" of type ${input.type} needs a payload`);
			}
			if (payload.length > 1024) {
				fail(`Payload of button "${text}" is longer than 1024 characters`);
			}
			return { type: input.type, text, payload };
		}
		case 'link': {
			const url = (input.url ?? '').trim();
			if (!/^https?:\/\//i.test(url)) {
				fail(`Button "${text}" needs a URL that starts with http:// or https://`);
			}
			if (url.length > 2048) {
				fail(`URL of button "${text}" is longer than 2048 characters`);
			}
			return { type: 'link', text, url };
		}
		case 'request_geo_location':
			return input.quick ? { type: input.type, text, quick: true } : { type: input.type, text };
		case 'open_app': {
			const button: IDataObject = { type: 'open_app', text };
			if (input.webApp) button.web_app = input.webApp;
			if (input.contactId) button.contact_id = input.contactId;
			if (input.payload) button.payload = input.payload;
			return button;
		}
		case 'message':
		case 'request_contact':
			return { type: input.type, text };
		default:
			return fail(`Unknown button type: ${String((input as ButtonInput).type)}`);
	}
}

/**
 * Turn the flat list of buttons from the UI into the `inline_keyboard` attachment.
 * Buttons are grouped by their row number (rows keep ascending order, buttons keep input order).
 */
export function buildKeyboard(inputs: ButtonInput[], fail: Fail): IDataObject | undefined {
	if (inputs.length === 0) return undefined;
	const rows = new Map<number, ButtonInput[]>();
	for (const input of inputs) {
		const row = Math.max(1, Math.floor(Number(input.row) || 1));
		if (!rows.has(row)) rows.set(row, []);
		rows.get(row)!.push(input);
	}
	const ordered = [...rows.keys()].sort((a, b) => a - b).map((row) => rows.get(row)!);
	return keyboardFromRows(
		ordered.map((row) => row.map((button) => buildButton(button, fail))),
		fail,
	);
}

/** Validate a keyboard given as JSON (`[[button, ...], ...]` or `{ buttons: [[...]] }`). */
export function keyboardFromJson(value: unknown, fail: Fail): IDataObject | undefined {
	let parsed = value;
	if (typeof parsed === 'string') {
		const trimmed = parsed.trim();
		if (trimmed === '') return undefined;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			fail('Keyboard JSON is not valid JSON');
		}
	}
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		const obj = parsed as IDataObject;
		parsed = (obj.payload as IDataObject | undefined)?.buttons ?? obj.buttons;
	}
	if (!Array.isArray(parsed) || !parsed.every((row) => Array.isArray(row))) {
		fail(
			'Keyboard JSON must be an array of rows, each row an array of buttons, e.g. [[{"type":"callback","text":"Yes","payload":"yes"}]]',
		);
	}
	if (parsed.length === 0) return undefined;
	return keyboardFromRows(parsed as IDataObject[][], fail);
}

function keyboardFromRows(rows: IDataObject[][], fail: Fail): IDataObject {
	if (rows.length > MAX_ROWS) {
		fail(`A keyboard can have at most ${MAX_ROWS} rows (got ${rows.length})`);
	}
	rows.forEach((row, index) => {
		const hasWide = row.some((button) => WIDE_TYPES.has(button.type as ButtonType));
		const limit = hasWide ? MAX_WIDE_BUTTONS_PER_ROW : MAX_BUTTONS_PER_ROW;
		if (row.length > limit) {
			fail(
				`Row ${index + 1} has ${row.length} buttons; the limit is ${limit}${hasWide ? ' for rows with link, app, contact or location buttons' : ''}`,
			);
		}
	});
	return { type: 'inline_keyboard', payload: { buttons: rows } };
}
