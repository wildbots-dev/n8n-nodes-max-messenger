import { describe, expect, it } from 'vitest';
import type { ButtonInput, Fail } from '../nodes/Max/lib/keyboard';
import { buildKeyboard, keyboardFromJson } from '../nodes/Max/lib/keyboard';

const fail: Fail = (message) => {
	throw new Error(message);
};

describe('buildKeyboard', () => {
	it('returns undefined for no buttons', () => {
		expect(buildKeyboard([], fail)).toBeUndefined();
	});

	it('groups buttons by row number in ascending order', () => {
		const inputs: ButtonInput[] = [
			{ row: 2, type: 'link', text: 'Site', url: 'https://n8n.io' },
			{ row: 1, type: 'callback', text: 'Yes', payload: 'yes' },
			{ row: 1, type: 'callback', text: 'No', payload: 'no' },
		];
		expect(buildKeyboard(inputs, fail)).toEqual({
			type: 'inline_keyboard',
			payload: {
				buttons: [
					[
						{ type: 'callback', text: 'Yes', payload: 'yes' },
						{ type: 'callback', text: 'No', payload: 'no' },
					],
					[{ type: 'link', text: 'Site', url: 'https://n8n.io' }],
				],
			},
		});
	});

	it('keeps only the fields each button type supports', () => {
		const keyboard = buildKeyboard(
			[
				{ row: 1, type: 'message', text: 'Hi', payload: 'ignored', url: 'ignored' },
				{ row: 2, type: 'request_geo_location', text: 'Where', quick: true },
				{ row: 3, type: 'open_app', text: 'App', webApp: 'my_bot', contactId: 0, payload: '' },
			],
			fail,
		);
		expect((keyboard?.payload as { buttons: unknown }).buttons).toEqual([
			[{ type: 'message', text: 'Hi' }],
			[{ type: 'request_geo_location', text: 'Where', quick: true }],
			[{ type: 'open_app', text: 'App', web_app: 'my_bot' }],
		]);
	});

	it('rejects a callback button without payload', () => {
		expect(() => buildKeyboard([{ type: 'callback', text: 'Yes' }], fail)).toThrow(/needs a payload/);
	});

	it('rejects a link without http(s) URL', () => {
		expect(() => buildKeyboard([{ type: 'link', text: 'Site', url: 'n8n.io' }], fail)).toThrow(/http/);
	});

	it('rejects empty and too long button text', () => {
		expect(() => buildKeyboard([{ type: 'message', text: ' ' }], fail)).toThrow(/1–128/);
		expect(() => buildKeyboard([{ type: 'message', text: 'x'.repeat(129) }], fail)).toThrow(/1–128/);
	});

	it('limits a row with a link button to 3 buttons', () => {
		const inputs: ButtonInput[] = [
			{ type: 'link', text: 'a', url: 'https://a.ru' },
			...Array.from({ length: 3 }, (_, i): ButtonInput => ({ type: 'callback', text: `b${i}`, payload: 'p' })),
		];
		expect(() => buildKeyboard(inputs, fail)).toThrow(/limit is 3/);
	});

	it('limits a regular row to 7 buttons', () => {
		const inputs = Array.from({ length: 8 }, (_, i): ButtonInput => ({ type: 'message', text: `b${i}` }));
		expect(() => buildKeyboard(inputs, fail)).toThrow(/limit is 7/);
	});

	it('limits the keyboard to 30 rows', () => {
		const inputs = Array.from({ length: 31 }, (_, i): ButtonInput => ({ row: i + 1, type: 'message', text: 'b' }));
		expect(() => buildKeyboard(inputs, fail)).toThrow(/at most 30 rows/);
	});
});

describe('keyboardFromJson', () => {
	const rows = [[{ type: 'callback', text: 'A', payload: 'a' }]];

	it('accepts an array of rows as a string', () => {
		expect(keyboardFromJson(JSON.stringify(rows), fail)).toEqual({ type: 'inline_keyboard', payload: { buttons: rows } });
	});

	it('accepts a full inline_keyboard attachment object', () => {
		expect(keyboardFromJson({ type: 'inline_keyboard', payload: { buttons: rows } }, fail)).toEqual({
			type: 'inline_keyboard',
			payload: { buttons: rows },
		});
	});

	it('returns undefined for empty input', () => {
		expect(keyboardFromJson('  ', fail)).toBeUndefined();
		expect(keyboardFromJson('[]', fail)).toBeUndefined();
	});

	it('rejects invalid JSON and wrong shapes', () => {
		expect(() => keyboardFromJson('{oops', fail)).toThrow(/not valid JSON/);
		expect(() => keyboardFromJson('[{"type":"callback"}]', fail)).toThrow(/array of rows/);
	});
});
