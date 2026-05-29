import { describe, it, expect } from 'vitest';
import { formatSessionLabel, displaySessionName } from './useSessionLabel';

describe('formatSessionLabel', () => {
  it('passes through a plain date label unchanged', () => {
    expect(formatSessionLabel('2026-05-28')).toBe('2026-05-28');
  });

  it('formats a suffix-2 label', () => {
    expect(formatSessionLabel('2026-05-28-2')).toBe('2026-05-28 #2');
  });

  it('formats a suffix-10 label', () => {
    expect(formatSessionLabel('2026-05-28-10')).toBe('2026-05-28 #10');
  });

  it('passes through a non-matching string unchanged', () => {
    expect(formatSessionLabel('not-a-label')).toBe('not-a-label');
  });

  it('passes through an empty string unchanged', () => {
    expect(formatSessionLabel('')).toBe('');
  });
});

describe('displaySessionName', () => {
  it('shows a custom name verbatim', () => {
    expect(displaySessionName({ label: '2026-05-28-2', name: 'Club Champs' })).toBe('Club Champs');
  });

  it('falls back to the formatted label when name equals the label', () => {
    expect(displaySessionName({ label: '2026-05-28-2', name: '2026-05-28-2' })).toBe('2026-05-28 #2');
  });

  it('falls back to the formatted label when name is missing', () => {
    expect(displaySessionName({ label: '2026-05-28' })).toBe('2026-05-28');
  });
});
