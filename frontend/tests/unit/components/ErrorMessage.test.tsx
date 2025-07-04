import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorMessage } from '../../../src/components/ui/ErrorMessage';

describe('ErrorMessage Component', () => {
  it('should render error message', () => {
    render(
      <ErrorMessage 
        message="Test error message" 
        category="system" 
      />
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should show retry button when enabled', () => {
    const mockRetry = () => {};
    
    render(
      <ErrorMessage 
        message="Network error" 
        category="network"
        showRetry={true}
        onRetry={mockRetry}
      />
    );

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should render inline without card wrapper', () => {
    render(
      <ErrorMessage 
        message="Inline error" 
        category="validation"
        inline={true}
      />
    );

    // Should not have card wrapper
    expect(screen.queryByTestId('ion-card')).not.toBeInTheDocument();
    expect(screen.getByText('Inline error')).toBeInTheDocument();
  });

  it('should display custom actions', () => {
    const mockAction = () => {};
    
    render(
      <ErrorMessage 
        message="Error with action" 
        category="system"
        actions={[
          { label: 'Custom Action', handler: mockAction }
        ]}
      />
    );

    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });
});