/** MAX rejects message text longer than this many characters. */
export const MAX_TEXT_LENGTH = 4000;

/**
 * Split text into chunks of at most `limit` characters, preferring paragraph,
 * line and word boundaries. Never returns an empty array: empty text gives `['']`.
 * Counts UTF-16 code units but never cuts a surrogate pair or an HTML tag in half.
 */
export function splitText(text: string, limit = MAX_TEXT_LENGTH): string[] {
	if (text.length <= limit) return [text];
	const chunks: string[] = [];
	let rest = text;
	while (rest.length > limit) {
		let cut = findCut(rest, limit);
		if (cut <= 0) cut = limit;
		// Never cut inside an HTML tag such as <a href="...">.
		const head = rest.slice(0, cut);
		const open = head.lastIndexOf('<');
		if (open > 0 && open > head.lastIndexOf('>')) cut = open;
		// Do not split a surrogate pair (emoji and other astral characters).
		const code = rest.charCodeAt(cut - 1);
		if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
		chunks.push(rest.slice(0, cut).trimEnd());
		rest = rest.slice(cut).replace(/^[ \t]*\n?/, '');
	}
	if (rest.length > 0) chunks.push(rest);
	return chunks.filter((chunk, index) => chunk.length > 0 || index === 0);
}

function findCut(text: string, limit: number): number {
	const window = text.slice(0, limit);
	const minimum = Math.floor(limit / 2);
	for (const separator of ['\n\n', '\n', '. ', ' ']) {
		const at = window.lastIndexOf(separator);
		if (at >= minimum) return at + separator.length;
	}
	return limit;
}
