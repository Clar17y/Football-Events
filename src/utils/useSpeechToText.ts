import { useState } from 'react';

/**
 * TypeScript declarations for WebKit Speech Recognition API
 * These are not included in standard TypeScript definitions
 */
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface WebkitSpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: any;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  serviceURI: string;
  
  // Event handlers
  onstart: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onend: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: WebkitSpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onnomatch: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: WebkitSpeechRecognition, ev: Event) => any) | null;
  
  // Methods
  start(): void;
  stop(): void;
  abort(): void;
}

interface WebkitSpeechRecognitionConstructor {
  new(): WebkitSpeechRecognition;
}

declare global {
  interface Window {
    webkitSpeechRecognition: WebkitSpeechRecognitionConstructor;
  }
}

/**
 * Hook for speech-to-text functionality using WebKit Speech Recognition API
 * 
 * @param onResult Callback function called when speech is recognized
 * @returns Object with recognition state and start function
 */
export function useSpeechToText(onResult: (text: string) => void) {
  const [recognising, setRecognising] = useState(false);

  const startDictation = () => {
    // Check if speech recognition is supported
    if (!('webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported in this browser');
      alert('Speech recognition not supported in this browser');
      return;
    }

    try {
      // Create speech recognition instance with proper typing
      const recognition: WebkitSpeechRecognition = new window.webkitSpeechRecognition();
      
      // Configure recognition settings
      recognition.lang = 'en-GB';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      // Set up event handlers with proper typing
      recognition.onstart = () => {
        setRecognising(true);
        console.log('Speech recognition started');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (event.results.length > 0) {
          const transcript = event.results[0][0].transcript;
          const confidence = event.results[0][0].confidence;
          
          console.log('Speech recognition result:', { transcript, confidence });
          onResult(transcript);
        }
      };

      recognition.onend = () => {
        setRecognising(false);
        console.log('Speech recognition ended');
      };

      recognition.onerror = (event: Event) => {
        setRecognising(false);
        console.error('Speech recognition error:', event);
        // Don't show alert for user-cancelled recognition
        if ((event as any).error !== 'aborted') {
          alert('Speech recognition error occurred');
        }
      };

      // Start recognition
      recognition.start();
    } catch (error) {
      setRecognising(false);
      console.error('Failed to start speech recognition:', error);
      alert('Failed to start speech recognition');
    }
  };

  return { 
    recognising, 
    startDictation 
  };
}