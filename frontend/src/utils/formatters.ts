/**
 * Converts period format values to display labels.
 */
export const formatPeriodFormat = (value: string | undefined | null): string => {
  const labels: Record<string, string> = {
    quarter: 'Quarters',
    half: 'Halves',
    whole: 'Full Match',
    third: 'Thirds'
  };
  return labels[value?.toLowerCase() ?? ''] || value || '';
};
