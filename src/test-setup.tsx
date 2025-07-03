import '@testing-library/jest-dom';
import { beforeEach, afterEach, vi } from 'vitest';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

// Mock Ionic components to avoid setup complexity
vi.mock('@ionic/react', () => ({
  IonApp: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-app">{children}</div>,
  IonPage: ({ children, ...props }: any) => <div data-testid="ion-page" {...props}>{children}</div>,
  IonHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-header">{children}</div>,
  IonToolbar: ({ children, color, className }: any) => (
    <div data-testid="ion-toolbar" data-color={color} className={className}>
      {children}
    </div>
  ),
  IonTitle: ({ children, style }: any) => (
    <div data-testid="ion-title" style={style}>
      {children}
    </div>
  ),
  IonContent: ({ children, className, style }: any) => (
    <div data-testid="ion-content" className={className} style={style}>
      {children}
    </div>
  ),
  IonToast: ({ isOpen, message, duration, onDidDismiss, buttons }: any) => (
    isOpen ? (
      <div data-testid="ion-toast" data-message={message} data-duration={duration}>
        {message}
        {buttons && buttons.map((btn: any, idx: number) => (
          <button key={idx} onClick={btn.handler} data-testid={`ion-toast-button-${idx}`}>
            {btn.text}
          </button>
        ))}
      </div>
    ) : null
  ),
  IonCard: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-card">{children}</div>,
  IonCardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-card-content">{children}</div>,
  IonButton: ({ children, onClick, disabled, color, fill, size, expand, style, onMouseEnter, onMouseLeave }: any) => (
    <button 
      data-testid="ion-button" 
      onClick={onClick} 
      disabled={disabled}
      data-color={color}
      data-fill={fill}
      data-size={size}
      data-expand={expand}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </button>
  ),
  IonIcon: ({ icon, slot, style }: any) => (
    <span data-testid="ion-icon" data-icon={icon} data-slot={slot} style={style} />
  ),
  IonText: ({ children, color }: any) => (
    <span data-testid="ion-text" data-color={color}>
      {children}
    </span>
  ),
  IonItem: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-item">{children}</div>,
  IonLabel: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-label">{children}</div>,
  IonInput: (props: any) => <input data-testid="ion-input" {...props} />,
  IonTextarea: ({ onIonInput, value, ...props }: any) => (
    <textarea 
      data-testid="ion-textarea" 
      value={value}
      onChange={(e) => {
        // Simulate Ionic's onIonInput event structure
        if (onIonInput) {
          onIonInput({ detail: { value: e.target.value } });
        }
      }}
      {...props} 
    />
  ),
  IonSelect: ({ children, onIonChange, value, ...props }: any) => (
    <select 
      data-testid="ion-select" 
      value={value}
      onChange={(e) => {
        // Simulate Ionic's onIonChange event structure
        if (onIonChange) {
          onIonChange({ detail: { value: e.target.value } });
        }
      }}
      {...props}
    >
      {children}
    </select>
  ),
  IonSelectOption: ({ children, value }: any) => (
    <option data-testid="ion-select-option" value={value}>
      {children}
    </option>
  ),
  IonModal: ({ children, isOpen, onDidDismiss, ...props }: any) => (
    isOpen ? (
      <div data-testid="ion-modal" {...props}>
        <div onClick={onDidDismiss} data-testid="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)' }} />
        <div data-testid="modal-content" style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </div>
    ) : null
  ),
  IonList: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-list">{children}</div>,
  IonButtons: ({ children, slot }: any) => <div data-testid="ion-buttons" data-slot={slot}>{children}</div>,
  IonSpinner: ({ name, color, style, className }: any) => (
    <div 
      data-testid="ion-spinner" 
      data-name={name}
      data-color={color}
      className={className}
      style={style}
    />
  ),
}));

// Mock ionicons
vi.mock('ionicons/icons', () => ({
  warning: 'warning-icon',
  refresh: 'refresh-icon',
  informationCircle: 'information-circle-icon',
  checkmark: 'checkmark-icon',
  close: 'close-icon',
  add: 'add-icon',
  trash: 'trash-icon',
  edit: 'edit-icon',
  play: 'play-icon',
  pause: 'pause-icon',
  football: 'football-icon',
  ribbon: 'ribbon-icon',
  key: 'key-icon',
  shieldCheckmark: 'shield-checkmark-icon',
  checkmarkCircle: 'checkmark-circle-icon',
  flagOutline: 'flag-outline-icon',
  medal: 'medal-icon',
  closeCircle: 'close-circle-icon',
  sad: 'sad-icon',
  removeCircle: 'remove-circle-icon',
  mic: 'mic-icon',
  micOff: 'micOff-icon',
}));

// Clean up after each test
beforeEach(() => {
  // Reset any mocks
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up DOM
  document.body.innerHTML = '';
});