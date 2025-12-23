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
  IonCard: ({ children, className }: any) => <div data-testid="ion-card" className={className}>{children}</div>,
  IonCardHeader: ({ children, className }: any) => <div data-testid="ion-card-header" className={className}>{children}</div>,
  IonCardTitle: ({ children, className }: any) => <div data-testid="ion-card-title" className={className}>{children}</div>,
  IonCardSubtitle: ({ children, className }: any) => <div data-testid="ion-card-subtitle" className={className}>{children}</div>,
  IonCardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="ion-card-content">{children}</div>,
  IonButton: ({ children, onClick, disabled, color, fill, size, expand, style, onMouseEnter, onMouseLeave, className, type }: any) => (
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
      className={className}
      type={type}
    >
      {children}
    </button>
  ),
  IonIcon: ({ icon, slot, style, className }: any) => (
    <span data-testid="ion-icon" data-icon={icon} data-slot={slot} style={style} className={className} />
  ),
  IonText: ({ children, color, className }: any) => (
    <span data-testid="ion-text" data-color={color} className={className}>
      {children}
    </span>
  ),
  IonItem: ({ children, className }: any) => <div data-testid="ion-item" className={className}>{children}</div>,
  IonLabel: ({ children, className, position }: any) => <div data-testid="ion-label" className={className} data-position={position}>{children}</div>,
  IonInput: ({ onIonInput, onIonChange, value, ...props }: any) => (
    <input 
      data-testid="ion-input" 
      value={value}
      onChange={(e) => {
        if (onIonInput) onIonInput({ detail: { value: e.target.value } });
        if (onIonChange) onIonChange({ detail: { value: e.target.value } });
      }}
      {...props} 
    />
  ),
  IonTextarea: ({ onIonInput, onIonChange, value, ...props }: any) => (
    <textarea 
      data-testid="ion-textarea" 
      value={value}
      onChange={(e) => {
        if (onIonInput) onIonInput({ detail: { value: e.target.value } });
        if (onIonChange) onIonChange({ detail: { value: e.target.value } });
      }}
      {...props} 
    />
  ),
  IonSelect: ({ children, onIonChange, value, placeholder, ...props }: any) => (
    <select 
      data-testid="ion-select" 
      value={value}
      onChange={(e) => {
        if (onIonChange) {
          onIonChange({ detail: { value: e.target.value } });
        }
      }}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
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
  IonList: ({ children, className }: any) => <div data-testid="ion-list" className={className}>{children}</div>,
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
  IonGrid: ({ children, className }: any) => <div data-testid="ion-grid" className={className}>{children}</div>,
  IonRow: ({ children, className }: any) => <div data-testid="ion-row" className={className}>{children}</div>,
  IonCol: ({ children, className, size, sizeMd, sizeLg }: any) => (
    <div data-testid="ion-col" className={className} data-size={size} data-size-md={sizeMd} data-size-lg={sizeLg}>
      {children}
    </div>
  ),
  IonChip: ({ children, color, className, onClick }: any) => (
    <div data-testid="ion-chip" data-color={color} className={className} onClick={onClick}>
      {children}
    </div>
  ),
  IonBadge: ({ children, color, className }: any) => (
    <span data-testid="ion-badge" data-color={color} className={className}>
      {children}
    </span>
  ),
  IonNote: ({ children, className }: any) => <span data-testid="ion-note" className={className}>{children}</span>,
  IonToggle: ({ checked, onIonChange, ...props }: any) => (
    <input 
      type="checkbox" 
      data-testid="ion-toggle" 
      checked={checked}
      onChange={(e) => onIonChange?.({ detail: { checked: e.target.checked } })}
      {...props}
    />
  ),
  IonCheckbox: ({ checked, onIonChange, ...props }: any) => (
    <input 
      type="checkbox" 
      data-testid="ion-checkbox" 
      checked={checked}
      onChange={(e) => onIonChange?.({ detail: { checked: e.target.checked } })}
      {...props}
    />
  ),
  IonRadio: ({ value, ...props }: any) => <input type="radio" data-testid="ion-radio" value={value} {...props} />,
  IonRadioGroup: ({ children, value, onIonChange }: any) => (
    <div data-testid="ion-radio-group" data-value={value} onChange={(e: any) => onIonChange?.({ detail: { value: e.target.value } })}>
      {children}
    </div>
  ),
  IonSegment: ({ children, value, onIonChange }: any) => (
    <div data-testid="ion-segment" data-value={value} onClick={(e: any) => {
      const target = e.target as HTMLElement;
      const segmentValue = target.getAttribute('data-value');
      if (segmentValue) onIonChange?.({ detail: { value: segmentValue } });
    }}>
      {children}
    </div>
  ),
  IonSegmentButton: ({ children, value }: any) => (
    <button data-testid="ion-segment-button" data-value={value}>{children}</button>
  ),
  IonDatetime: ({ value, onIonChange, ...props }: any) => (
    <input 
      type="datetime-local" 
      data-testid="ion-datetime" 
      value={value}
      onChange={(e) => onIonChange?.({ detail: { value: e.target.value } })}
      {...props}
    />
  ),
  IonDatetimeButton: ({ datetime, ...props }: any) => (
    <button data-testid="ion-datetime-button" data-datetime={datetime} {...props}>Select Date</button>
  ),
  IonPopover: ({ children, isOpen, onDidDismiss, ...props }: any) => (
    isOpen ? <div data-testid="ion-popover" {...props}>{children}</div> : null
  ),
  IonAlert: ({ isOpen, header, message, buttons, onDidDismiss }: any) => (
    isOpen ? (
      <div data-testid="ion-alert">
        <div>{header}</div>
        <div>{message}</div>
        {buttons?.map((btn: any, idx: number) => (
          <button key={idx} onClick={() => { btn.handler?.(); onDidDismiss?.(); }}>
            {typeof btn === 'string' ? btn : btn.text}
          </button>
        ))}
      </div>
    ) : null
  ),
  IonLoading: ({ isOpen, message }: any) => (
    isOpen ? <div data-testid="ion-loading">{message}</div> : null
  ),
  IonRefresher: ({ children, onIonRefresh }: any) => (
    <div data-testid="ion-refresher" onClick={() => onIonRefresh?.({ detail: { complete: () => {} } })}>
      {children}
    </div>
  ),
  IonRefresherContent: (props: any) => <div data-testid="ion-refresher-content" {...props} />,
  IonInfiniteScroll: ({ children, onIonInfinite }: any) => (
    <div data-testid="ion-infinite-scroll" onClick={() => onIonInfinite?.({ detail: { complete: () => {} } })}>
      {children}
    </div>
  ),
  IonInfiniteScrollContent: (props: any) => <div data-testid="ion-infinite-scroll-content" {...props} />,
  IonFab: ({ children, ...props }: any) => <div data-testid="ion-fab" {...props}>{children}</div>,
  IonFabButton: ({ children, onClick, ...props }: any) => (
    <button data-testid="ion-fab-button" onClick={onClick} {...props}>{children}</button>
  ),
  IonFabList: ({ children, ...props }: any) => <div data-testid="ion-fab-list" {...props}>{children}</div>,
  IonBackButton: ({ defaultHref, ...props }: any) => (
    <button data-testid="ion-back-button" data-default-href={defaultHref} {...props}>Back</button>
  ),
  IonMenuButton: (props: any) => <button data-testid="ion-menu-button" {...props}>Menu</button>,
  IonSearchbar: ({ value, onIonInput, onIonChange, placeholder, ...props }: any) => (
    <input 
      type="search"
      data-testid="ion-searchbar" 
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onIonInput?.({ detail: { value: e.target.value } });
        onIonChange?.({ detail: { value: e.target.value } });
      }}
      {...props}
    />
  ),
  IonRange: ({ value, onIonChange, ...props }: any) => (
    <input 
      type="range" 
      data-testid="ion-range" 
      value={value}
      onChange={(e) => onIonChange?.({ detail: { value: parseInt(e.target.value) } })}
      {...props}
    />
  ),
  IonProgressBar: ({ value, ...props }: any) => (
    <div data-testid="ion-progress-bar" data-value={value} {...props} />
  ),
  IonAvatar: ({ children, ...props }: any) => <div data-testid="ion-avatar" {...props}>{children}</div>,
  IonThumbnail: ({ children, ...props }: any) => <div data-testid="ion-thumbnail" {...props}>{children}</div>,
  IonImg: ({ src, alt, ...props }: any) => <img data-testid="ion-img" src={src} alt={alt} {...props} />,
  IonSlides: ({ children, ...props }: any) => <div data-testid="ion-slides" {...props}>{children}</div>,
  IonSlide: ({ children, ...props }: any) => <div data-testid="ion-slide" {...props}>{children}</div>,
  IonAccordion: ({ children, value, ...props }: any) => <div data-testid="ion-accordion" data-value={value} {...props}>{children}</div>,
  IonAccordionGroup: ({ children, value, ...props }: any) => <div data-testid="ion-accordion-group" data-value={value} {...props}>{children}</div>,
  IonItemDivider: ({ children, ...props }: any) => <div data-testid="ion-item-divider" {...props}>{children}</div>,
  IonItemGroup: ({ children, ...props }: any) => <div data-testid="ion-item-group" {...props}>{children}</div>,
  IonItemSliding: ({ children, ...props }: any) => <div data-testid="ion-item-sliding" {...props}>{children}</div>,
  IonItemOptions: ({ children, ...props }: any) => <div data-testid="ion-item-options" {...props}>{children}</div>,
  IonItemOption: ({ children, onClick, ...props }: any) => (
    <button data-testid="ion-item-option" onClick={onClick} {...props}>{children}</button>
  ),
  IonReorder: (props: any) => <div data-testid="ion-reorder" {...props} />,
  IonReorderGroup: ({ children, disabled, onIonItemReorder }: any) => (
    <div data-testid="ion-reorder-group" data-disabled={disabled}>{children}</div>
  ),
  IonRippleEffect: () => null,
  useIonRouter: () => ({
    push: vi.fn(),
    goBack: vi.fn(),
    canGoBack: () => true,
  }),
  useIonViewWillEnter: (callback: () => void) => { callback(); },
  useIonViewDidEnter: (callback: () => void) => { callback(); },
  useIonViewWillLeave: (callback: () => void) => {},
  useIonViewDidLeave: (callback: () => void) => {},
  useIonLoading: () => [vi.fn(), vi.fn()],
  useIonToast: () => [vi.fn(), vi.fn()],
  useIonAlert: () => [vi.fn(), vi.fn()],
  useIonActionSheet: () => [vi.fn(), vi.fn()],
  useIonModal: () => [vi.fn(), vi.fn()],
  useIonPopover: () => [vi.fn(), vi.fn()],
  useIonPicker: () => [vi.fn(), vi.fn()],
  isPlatform: () => false,
  getPlatforms: () => ['desktop'],
  setupIonicReact: () => {},
}));

// Mock ionicons - comprehensive list of all icons used in the app
vi.mock('ionicons/icons', () => ({
  // Basic icons
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
  stop: 'stop-icon',
  
  // Sports icons
  football: 'football-icon',
  ribbon: 'ribbon-icon',
  trophy: 'trophy-icon',
  medal: 'medal-icon',
  flash: 'flash-icon',
  stopwatch: 'stopwatch-icon',
  fitness: 'fitness-icon',
  barbell: 'barbell-icon',
  basketball: 'basketball-icon',
  tennisball: 'tennisball-icon',
  americanFootball: 'american-football-icon',
  baseball: 'baseball-icon',
  golf: 'golf-icon',
  
  // Security/Auth icons
  key: 'key-icon',
  shieldCheckmark: 'shield-checkmark-icon',
  logIn: 'log-in-icon',
  logOut: 'log-out-icon',
  personAdd: 'person-add-icon',
  
  // Status icons
  checkmarkCircle: 'checkmark-circle-icon',
  closeCircle: 'close-circle-icon',
  alertCircle: 'alert-circle-icon',
  alert: 'alert-icon',
  sad: 'sad-icon',
  removeCircle: 'remove-circle-icon',
  
  // Media icons
  mic: 'mic-icon',
  micOff: 'micOff-icon',
  camera: 'camera-icon',
  videocam: 'videocam-icon',
  image: 'image-icon',
  
  // Time/Calendar icons
  calendar: 'calendar-icon',
  time: 'time-icon',
  
  // Navigation icons
  chevronDown: 'chevron-down-icon',
  chevronUp: 'chevron-up-icon',
  chevronForward: 'chevron-forward-icon',
  chevronBack: 'chevron-back-icon',
  arrowBack: 'arrow-back-icon',
  arrowForward: 'arrow-forward-icon',
  caretDown: 'caret-down-icon',
  caretUp: 'caret-up-icon',
  
  // People icons
  people: 'people-icon',
  person: 'person-icon',
  
  // Location icons
  location: 'location-icon',
  pin: 'pin-icon',
  globe: 'globe-icon',
  
  // Action icons
  create: 'create-icon',
  search: 'search-icon',
  filter: 'filter-icon',
  options: 'options-icon',
  save: 'save-icon',
  download: 'download-icon',
  share: 'share-icon',
  copy: 'copy-icon',
  eye: 'eye-icon',
  
  // Document icons
  clipboard: 'clipboard-icon',
  document: 'document-icon',
  folder: 'folder-icon',
  
  // Communication icons
  mail: 'mail-icon',
  call: 'call-icon',
  chatbubble: 'chatbubble-icon',
  notifications: 'notifications-icon',
  
  // Favorite icons
  heart: 'heart-icon',
  star: 'star-icon',
  bookmark: 'bookmark-icon',
  flag: 'flag-icon',
  
  // Connectivity icons
  link: 'link-icon',
  wifi: 'wifi-icon',
  bluetooth: 'bluetooth-icon',
  
  // Device icons
  battery: 'battery-icon',
  
  // Theme icons
  moon: 'moon-icon',
  sunny: 'sunny-icon',
  
  // Weather icons
  cloud: 'cloud-icon',
  rainy: 'rainy-icon',
  snow: 'snow-icon',
  thunderstorm: 'thunderstorm-icon',
  thermometer: 'thermometer-icon',
  water: 'water-icon',
  
  // Nature icons
  leaf: 'leaf-icon',
  paw: 'paw-icon',
  bug: 'bug-icon',
  skull: 'skull-icon',
  
  // Transport icons
  rocket: 'rocket-icon',
  airplane: 'airplane-icon',
  car: 'car-icon',
  bus: 'bus-icon',
  train: 'train-icon',
  boat: 'boat-icon',
  bicycle: 'bicycle-icon',
  walk: 'walk-icon',
  
  // Cloud icons
  cloudOffline: 'cloud-offline-icon',
  cloudUpload: 'cloud-upload-icon',
  cloudDone: 'cloud-done-icon',
  cloudDownload: 'cloud-download-icon',
  
  // Stats icons
  statsChart: 'stats-chart-icon',
  trendingUp: 'trending-up-icon',
  trendingDown: 'trending-down-icon',
  
  // Misc icons
  information: 'information-icon',
  shirt: 'shirt-icon',
  ellipsisVertical: 'ellipsis-vertical-icon',
  ellipsisHorizontal: 'ellipsis-horizontal-icon',
  colorPalette: 'color-palette-icon',
  colorFill: 'color-fill-icon',
  colorWand: 'color-wand-icon',
  
  // Outline variants
  flagOutline: 'flag-outline-icon',
  refreshOutline: 'refresh-outline-icon',
  addOutline: 'add-outline-icon',
  createOutline: 'create-outline-icon',
  trashOutline: 'trash-outline-icon',
  peopleOutline: 'people-outline-icon',
  personOutline: 'person-outline-icon',
  calendarOutline: 'calendar-outline-icon',
  footballOutline: 'football-outline-icon',
  statsChartOutline: 'stats-chart-outline-icon',
  settingsOutline: 'settings-outline-icon',
  homeOutline: 'home-outline-icon',
  listOutline: 'list-outline-icon',
  gridOutline: 'grid-outline-icon',
  locationOutline: 'location-outline-icon',
  timeOutline: 'time-outline-icon',
  trophyOutline: 'trophy-outline-icon',
  alertCircleOutline: 'alert-circle-outline-icon',
  checkmarkCircleOutline: 'checkmark-circle-outline-icon',
  closeCircleOutline: 'close-circle-outline-icon',
  informationCircleOutline: 'information-circle-outline-icon',
  warningOutline: 'warning-outline-icon',
  helpCircleOutline: 'help-circle-outline-icon',
  eyeOutline: 'eye-outline-icon',
  eyeOffOutline: 'eye-off-outline-icon',
  personAddOutline: 'person-add-outline-icon',
  logInOutline: 'log-in-outline-icon',
  arrowBackOutline: 'arrow-back-outline-icon',
  arrowForwardOutline: 'arrow-forward-outline-icon',
  chevronBackOutline: 'chevron-back-outline-icon',
  chevronForwardOutline: 'chevron-forward-outline-icon',
  chevronDownOutline: 'chevron-down-outline-icon',
  chevronUpOutline: 'chevron-up-outline-icon',
  flashOutline: 'flash-outline-icon',
  exitOutline: 'exit-outline-icon',
  optionsOutline: 'options-outline-icon',
  handLeftOutline: 'hand-left-outline-icon',
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