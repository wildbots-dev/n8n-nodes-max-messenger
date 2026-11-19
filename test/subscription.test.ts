import { describe, expect, it } from 'vitest';
import { matchesSubscription, secretMatches, UPDATE_TYPES } from '../nodes/MaxTrigger/lib/subscription';

describe('matchesSubscription', () => {
	it('ignores order and duplicates', () => {
		expect(matchesSubscription(['bot_started', 'message_created'], ['message_created', 'bot_started', 'bot_started'])).toBe(true);
	});

	it('detects a changed selection', () => {
		expect(matchesSubscription(['message_created'], ['message_created', 'message_callback'])).toBe(false);
		expect(matchesSubscription(null, ['message_created'])).toBe(false);
	});
});

describe('secretMatches', () => {
	it('accepts the exact secret', () => {
		expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true);
		expect(secretMatches('s3cret-value', ['s3cret-value'])).toBe(true);
	});

	it('rejects a missing, different or partial secret', () => {
		expect(secretMatches('s3cret-value', undefined)).toBe(false);
		expect(secretMatches('s3cret-value', 's3cret-valuE')).toBe(false);
		expect(secretMatches('s3cret-value', 's3cret')).toBe(false);
		expect(secretMatches(undefined, 'anything')).toBe(false);
	});
});

describe('UPDATE_TYPES', () => {
	it('has unique values', () => {
		const values = UPDATE_TYPES.map((u) => u.value);
		expect(new Set(values).size).toBe(values.length);
	});
});
