/**
 * Beautiful Color Picker Modal using React Colorful
 * Mobile-first, touch-optimized color selection
 */

import React, { useState } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol
} from '@ionic/react';
import { close, checkmark } from 'ionicons/icons';
import { HexColorPicker } from 'react-colorful';
import './ColorPickerModal.css';

interface ColorPickerModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  onColorSelect: (color: string) => void;
  initialColor?: string;
  title: string;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  isOpen,
  onDidDismiss,
  onColorSelect,
  initialColor = '#3182ce',
  title
}) => {
  const [selectedColor, setSelectedColor] = useState(initialColor);

  const handleConfirm = () => {
    onColorSelect(selectedColor);
    onDidDismiss();
  };

  const handleCancel = () => {
    setSelectedColor(initialColor);
    onDidDismiss();
  };

  // Preset colors for quick selection
  const presetColors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#008000', '#000080', '#800000', '#808000',
    '#C0C0C0', '#808080', '#000000', '#FFFFFF', '#F0F8FF', '#FAEBD7'
  ];

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDidDismiss} className="color-picker-modal">
      <IonHeader>
        <IonToolbar color="secondary">
          <IonTitle>{title}</IonTitle>
          <IonButton 
            fill="clear" 
            slot="end" 
            onClick={handleCancel}
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="color-picker-content">
        <div className="color-picker-container">
          {/* Color Preview */}
          <div className="color-preview-section">
            <div 
              className="selected-color-preview"
              style={{ backgroundColor: selectedColor }}
            />
            <div className="color-info">
              <span className="color-value">{selectedColor.toUpperCase()}</span>
              <span className="color-label">Selected Color</span>
            </div>
          </div>

          {/* Main Color Picker */}
          <div className="color-picker-section">
            <HexColorPicker 
              color={selectedColor} 
              onChange={setSelectedColor}
              className="color-picker"
            />
          </div>

          {/* Preset Colors */}
          <div className="preset-colors-section">
            <h3 className="preset-title">Quick Colors</h3>
            <IonGrid>
              <IonRow>
                {presetColors.map((color, index) => (
                  <IonCol size="3" sizeMd="2" key={index}>
                    <div
                      className={`preset-color ${selectedColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                    />
                  </IonCol>
                ))}
              </IonRow>
            </IonGrid>
          </div>

          {/* Action Buttons */}
          <div className="color-picker-actions">
            <IonButton 
              expand="block" 
              fill="clear" 
              onClick={handleCancel}
              className="cancel-button"
            >
              Cancel
            </IonButton>
            <IonButton 
              expand="block" 
              color="secondary" 
              onClick={handleConfirm}
              className="confirm-button"
            >
              <IonIcon icon={checkmark} slot="start" />
              Select Color
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default ColorPickerModal;