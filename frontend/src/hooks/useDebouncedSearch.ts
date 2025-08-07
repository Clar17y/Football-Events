/**
 * Debounced Search Hook
 * A specialized hook for handling debounced search functionality across the app
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';

export interface UseDebouncedSearchOptions {
  delay?: number;
  minLength?: number;
  onSearch: (searchTerm: string) => void | Promise<void>;
  initialValue?: string;
}

export interface UseDebouncedSearchReturn {
  searchText: string;
  debouncedSearchText: string;
  setSearchText: (value: string) => void;
  isSearching: boolean;
  showSpinner: boolean;
  clearSearch: () => void;
}

/**
 * Custom hook for debounced search functionality
 * @param options - Configuration options for the debounced search
 * @returns Search state and handlers
 */
export function useDebouncedSearch({
  delay = 300,
  minLength = 0,
  onSearch,
  initialValue = ''
}: UseDebouncedSearchOptions): UseDebouncedSearchReturn {
  const [searchText, setSearchText] = useState<string>(initialValue);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSpinner, setShowSpinner] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Use ref to store the latest onSearch function to avoid dependency issues
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  
  // Refs for managing spinner timing
  const spinnerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minimumDisplayTimeRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounce the search text
  const debouncedSearchText = useDebounce(searchText, delay);

  // Execute search when debounced value changes
  useEffect(() => {
    const executeSearch = async () => {
      // Skip the initial call on mount
      if (!isInitialized) {
        setIsInitialized(true);
        return;
      }

      // Clear any existing timers
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
      }
      if (minimumDisplayTimeRef.current) {
        clearTimeout(minimumDisplayTimeRef.current);
      }

      // Only search if meets minimum length requirement
      if (debouncedSearchText.length >= minLength) {
        setIsSearching(true);
        
        // Show spinner after 150ms delay (only if still searching)
        spinnerTimeoutRef.current = setTimeout(() => {
          if (isSearching) {
            setShowSpinner(true);
          }
        }, 150);

        const searchStartTime = Date.now();
        
        try {
          await onSearchRef.current(debouncedSearchText.trim());
        } catch (error) {
          console.error('Search error:', error);
        } finally {
          const searchDuration = Date.now() - searchStartTime;
          const minimumDisplayTime = 300; // Minimum 300ms display
          
          setIsSearching(false);
          
          // If spinner is showing, ensure it displays for minimum time
          if (showSpinner) {
            const remainingTime = Math.max(0, minimumDisplayTime - searchDuration);
            minimumDisplayTimeRef.current = setTimeout(() => {
              setShowSpinner(false);
            }, remainingTime);
          }
        }
      } else if (debouncedSearchText.length === 0) {
        // Clear search results when search is empty (no spinner for clear)
        setIsSearching(true);
        try {
          await onSearchRef.current('');
        } catch (error) {
          console.error('Clear search error:', error);
        } finally {
          setIsSearching(false);
        }
      }
    };

    executeSearch();
  }, [debouncedSearchText, minLength, isInitialized]); // Safe dependencies - no function references

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
      }
      if (minimumDisplayTimeRef.current) {
        clearTimeout(minimumDisplayTimeRef.current);
      }
    };
  }, []);

  // Clear search function
  const clearSearch = useCallback(() => {
    setSearchText('');
    setShowSpinner(false);
    // Clear any pending timers
    if (spinnerTimeoutRef.current) {
      clearTimeout(spinnerTimeoutRef.current);
    }
    if (minimumDisplayTimeRef.current) {
      clearTimeout(minimumDisplayTimeRef.current);
    }
  }, []);

  return {
    searchText,
    debouncedSearchText,
    setSearchText,
    isSearching,
    showSpinner,
    clearSearch
  };
}

export default useDebouncedSearch;