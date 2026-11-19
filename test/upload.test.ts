import { describe, expect, it } from 'vitest';
import { shortenFileName } from '../nodes/Max/lib/compose';
import { attachmentPayload, buildMultipart, uploadTimeoutMs, uploadTypeFromMime } from '../nodes/Max/lib/upload';

describe('uploadTypeFromMime', () => {
	it.each([
		['image/png', 'image'],
		['image/jpeg; charset=binary', 'image'],
		['video/mp4', 'video'],
		['audio/mpeg', 'audio'],
		['application/pdf', 'file'],
		['image/svg+xml', 'file'],
		['image/webp', 'file'],
		['image/heic', 'image'],
		['video/quicktime', 'video'],
		['video/x-msvideo', 'file'],
		[undefined, 'file'],
	])('%s → %s', (mime, type) => {
		expect(uploadTypeFromMime(mime)).toBe(type);
	});
});

describe('buildMultipart', () => {
	it('wraps the file in a single "data" part', () => {
		const { body, contentType } = buildMultipart(Buffer.from('hello'), 'отчёт "1".txt', 'text/plain', 'data', 'B');
		expect(contentType).toBe('multipart/form-data; boundary=B');
		expect(body.toString('utf8')).toBe(
			'--B\r\nContent-Disposition: form-data; name="data"; filename="отчёт \\"1\\".txt"\r\n' +
				'Content-Type: text/plain\r\n\r\nhello\r\n--B--\r\n',
		);
	});

	it('keeps binary content byte for byte', () => {
		const bytes = Buffer.from([0, 255, 13, 10, 128]);
		const { body } = buildMultipart(bytes, 'a.bin', '', 'data', 'B');
		expect(body.includes(bytes)).toBe(true);
		expect(body.toString('latin1')).toContain('Content-Type: application/octet-stream');
	});
});

describe('attachmentPayload', () => {
	it('uses the slot token for video and audio (upload answers with XML)', () => {
		expect(attachmentPayload('video', 'tok', undefined)).toEqual({ token: 'tok' });
		expect(attachmentPayload('audio', 'tok', undefined)).toEqual({ token: 'tok' });
	});

	it('passes photos of an uploaded image through', () => {
		const photos = { abc: { token: 't' } };
		expect(attachmentPayload('image', undefined, { photos })).toEqual({ photos });
	});

	it('uses the token from the upload response for files', () => {
		expect(attachmentPayload('file', undefined, { fileId: 1, token: 'f' })).toEqual({ token: 'f' });
	});

	it('returns undefined when there is no token at all', () => {
		expect(attachmentPayload('file', undefined, {})).toBeUndefined();
		expect(attachmentPayload('video', undefined, undefined)).toBeUndefined();
	});
});

describe('shortenFileName', () => {
	it('keeps short names', () => {
		expect(shortenFileName('a.pdf')).toBe('a.pdf');
	});

	it('cuts long names to 200 characters and keeps the extension', () => {
		const name = shortenFileName(`${'x'.repeat(300)}.pdf`);
		expect(name).toHaveLength(200);
		expect(name.endsWith('.pdf')).toBe(true);
	});
});

describe('uploadTimeoutMs', () => {
	it('is 5 minutes for small files and grows with size', () => {
		expect(uploadTimeoutMs(1000)).toBe(300_000);
		expect(uploadTimeoutMs(1_000_000_000)).toBe(1_000_000);
	});
});
