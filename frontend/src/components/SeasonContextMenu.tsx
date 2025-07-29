/**
 * Season Context Menu Component
 * Elegant floating menu for season actions with primary color theming
 */

import React, { useEffect, useRef } from 'react';
import {
  IonButton,
  IonIcon,
  IonRippleEffect
} from '@ionic/react';
import {
  pencil,
  trash,
  statsChart
} from 'ionicons/icons';
import type { Season } from '@shared/types';
import './SeasonContextMenu.css';

interface SeasonContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  season: Season | null;
  position: { x: number; y: number };
  onAction: (action: string) => void;
}

const SeasonContextMenu: React.FC<SeasonContextMenuProps> = ({
  isOpen,
  onClose,
  season,
  position,
  onAction
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !season) {
    return null;
  }

  const menuStyle = {
    position: 'fixed' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 10000,
  } as React.CSSProperties;

  const menuItems = [
    {
      text: 'Edit season',
      icon: pencil,
      action: 'edit',
      color: 'primary'
    },
    {
      text: 'Season statistics',
      icon: statsChart,
      action: 'stats',
      color: 'medium'
    },
    {
      text: 'Delete season',
      icon: trash,
      action: 'delete',
      color: 'danger'
    }
  ];

  return (
    <div className="season-context-menu-overlay">
      <div
        ref={menuRef}
        className="season-context-menu"
        style={menuStyle}
      >
        <div className="season-context-menu-header">
          <span className="season-context-menu-title">{season.label}</span>
        </div>
        <div className="season-context-menu-items">
          {menuItems.map((item) => (
            <IonButton
              key={item.action}
              fill="clear"
              expand="full"
              className={`season-context-menu-item ${item.color}`}
              onClick={() => {
                onAction(item.action);
                onClose();
              }}
            >
              <IonIcon icon={item.icon} slot="start" />
              <span>{item.text}</span>
              <IonRippleEffect />
            </IonButton>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SeasonContextMenu;