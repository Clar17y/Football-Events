/**
 * Team Context Menu Component
 * Elegant floating menu that appears next to the clicked ellipses button
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
  personAdd,
  statsChart
} from 'ionicons/icons';
import type { Team } from '@shared/types';
import './TeamContextMenu.css';

interface TeamContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  position: { x: number; y: number };
  onAction: (action: string) => void;
}

const TeamContextMenu: React.FC<TeamContextMenuProps> = ({
  isOpen,
  onClose,
  team,
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

  if (!isOpen || !team) {
    return null;
  }

  // Generate team colors for the border
  const primaryColor = team.homeKitPrimary || 'var(--ion-color-teal)';
  const secondaryColor = team.homeKitSecondary || 'var(--ion-color-teal-tint)';

  const menuStyle = {
    position: 'fixed' as const,
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 10000,
    '--team-primary': primaryColor,
    '--team-secondary': secondaryColor,
  } as React.CSSProperties;

  const menuItems = [
    {
      text: 'Edit Team',
      icon: pencil,
      action: 'edit',
      color: 'primary'
    },
    {
      text: 'View Players',
      icon: personAdd,
      action: 'players',
      color: 'medium'
    },
    {
      text: 'Team Statistics',
      icon: statsChart,
      action: 'stats',
      color: 'medium'
    },
    {
      text: 'Delete Team',
      icon: trash,
      action: 'delete',
      color: 'danger'
    }
  ];

  return (
    <div className="team-context-menu-overlay">
      <div
        ref={menuRef}
        className="team-context-menu"
        style={menuStyle}
      >
        <div className="team-context-menu-header">
          <span className="team-context-menu-title">{team.name}</span>
        </div>
        <div className="team-context-menu-items">
          {menuItems.map((item) => (
            <IonButton
              key={item.action}
              fill="clear"
              expand="full"
              className={`team-context-menu-item ${item.color}`}
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

export default TeamContextMenu;