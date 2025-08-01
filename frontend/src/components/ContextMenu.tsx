/**
 * Universal Context Menu Component
 * Reusable floating menu for all entity types (Team, Season, Player, etc.)
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IonButton,
  IonIcon,
  IonRippleEffect
} from '@ionic/react';
import { createPopper, type Instance as PopperInstance } from '@popperjs/core';
import type { IconType } from 'ionicons/icons';
import './ContextMenu.css';

export interface ContextMenuItem {
  text: string;
  icon: IconType;
  action: string;
  color: 'primary' | 'medium' | 'danger';
}

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  anchorElement: HTMLElement | null; // Reference element for positioning
  items: ContextMenuItem[];
  onAction: (action: string) => void;
  themeColor?: string; // For custom header colors (e.g., team colors)
  className?: string; // For theme-specific styling
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  onClose,
  title,
  anchorElement,
  items,
  onAction,
  themeColor,
  className = ''
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const popperInstanceRef = useRef<PopperInstance | null>(null);

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

  // Handle Popper.js positioning
  useEffect(() => {
    if (isOpen && anchorElement && menuRef.current) {
      const menu = menuRef.current;
      
      // Debug: Check initial position (should now be correct from style)
      const initialRect = menu.getBoundingClientRect();      
      if (menuRef.current && anchorElement) {        
        popperInstanceRef.current = createPopper(anchorElement, menuRef.current, {
          placement: 'bottom-start',
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 8], // 8px gap from anchor element
              },
            },
            {
              name: 'preventOverflow',
              options: {
                boundary: 'viewport',
                padding: 16, // 16px from viewport edges
              },
            },
            {
              name: 'flip',
              options: {
                fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
              },
            },
          ],
        });
        
        // Force initial update
        popperInstanceRef.current.update();
      }
    }

    return () => {
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
    };
  }, [isOpen, anchorElement]);

  if (!isOpen) {
    return null;
  }

  // Calculate initial position from anchor element
  const getInitialPosition = () => {
    if (anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      return {
        left: `${rect.left}px`,
        top: `${rect.bottom + 8}px`, // 8px below the anchor
      };
    }
    return {};
  };

  const menuStyle = {
    '--theme-color': themeColor || 'var(--ion-color-primary)',
    ...getInitialPosition(),
  } as React.CSSProperties;

  const menuContent = (
    <div
      ref={menuRef}
      className={`context-menu ${className}`}
      style={menuStyle}
    >
      <div className="context-menu-header">
        <span className="context-menu-title">{title}</span>
      </div>
      <div className="context-menu-items">
        {items.map((item) => (
          <IonButton
            key={item.action}
            fill="clear"
            expand="full"
            className={`context-menu-item ${item.color}`}
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
  );

  // Render in a portal to ensure proper positioning
  return createPortal(menuContent, document.body);
};

export default ContextMenu;