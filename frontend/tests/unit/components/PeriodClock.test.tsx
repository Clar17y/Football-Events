import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PeriodClock from '../../../src/components/live/PeriodClock';
describe('PeriodClock', () => {
  it('keeps 60+ minutes visible with an accessible timer label', () => {
    render(<PeriodClock timerMs={90 * 60_000 + 8_000} periodLabel="2nd Half" />);
    expect(screen.getByRole('timer', { name: 'Match clock 90:08' })).toHaveTextContent('90:08');
    expect(screen.getByText('2nd Half')).toBeInTheDocument();
  });
});
