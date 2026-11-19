import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, splitText } from '../nodes/Max/lib/text';

describe('splitText', () => {
	it('returns short text as a single chunk', () => {
		expect(splitText('hello')).toEqual(['hello']);
	});

	it('returns empty text as one empty chunk', () => {
		expect(splitText('')).toEqual(['']);
	});

	it('keeps every chunk within the limit', () => {
		const text = Array.from({ length: 500 }, (_, i) => `Sentence number ${i}.`).join(' ');
		const chunks = splitText(text);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.length <= MAX_TEXT_LENGTH)).toBe(true);
	});

	it('prefers paragraph boundaries', () => {
		const paragraph = 'a'.repeat(30);
		const chunks = splitText(`${paragraph}\n\n${paragraph}`, 40);
		expect(chunks).toEqual([paragraph, paragraph]);
	});

	it('cuts a word that is longer than the limit', () => {
		expect(splitText('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
	});

	it('does not split a surrogate pair', () => {
		const chunks = splitText('a'.repeat(9) + '😀' + 'b', 10);
		expect(chunks[0]).toBe('a'.repeat(9));
		expect(chunks[1].startsWith('😀')).toBe(true);
	});

	it('loses no characters other than whitespace at the cuts', () => {
		const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
		expect(splitText(text, 100).join(' ')).toBe(text);
	});
});
