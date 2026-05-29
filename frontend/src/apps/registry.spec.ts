import { describe, it, expect } from 'vitest';
import { apps } from './registry';

describe('app registry', () => {
  it('archery app uses a thematic monochrome target icon (Story 9.2)', () => {
    const archery = apps.find((a) => a.id === 'archery');
    expect(archery).toBeDefined();
    // A single-tone target/reticle glyph, not the old generic sports_score.
    expect(archery?.icon).toBe('adjust');
    expect(archery?.icon).not.toBe('sports_score');
  });
});
