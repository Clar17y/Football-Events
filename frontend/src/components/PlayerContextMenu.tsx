/**
 * Player Context Menu Component
 * Provides action menu for player management operations
 */

import React from 'react';
import {
  IonActionSheet,
  IonIcon
} from '@ionic/react';
import {
  pencil,
  trash,
  statsChart,
  people,
  person
} from 'ionicons/icons';
import type { Player } from '@shared/types';

interface PlayerContextMenuProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  player: Player | null;
  onEdit: (player: Player) => void;
  onDelete: (player: Player) => void;
  onViewStats: (player: Player) => void;
  onManageTeam: (player: Player) => void;
}

const PlayerContextMenu: React.FC<PlayerContextMenuProps> = ({
  isOpen,
  onDidDismiss,
  player,
  onEdit,
  onDelete,
  onViewStats,
  onManageTeam
}) => {
  if (!player) return null;

  const handleAction = (action: () => void) => {
    action();
    onDidDismiss();
  };

  return (
    <IonActionSheet
      isOpen={isOpen}
      onDidDismiss={onDidDismiss}
      header={player.name}
      buttons={[
        {
          text: 'Edit Player',
          icon: pencil,
          handler: () => handleAction(() => onEdit(player))
        },
        {
          text: 'View Statistics',
          icon: statsChart,
          handler: () => handleAction(() => onViewStats(player))
        },
        {
          text: 'Manage Team',
          icon: people,
          handler: () => handleAction(() => onManageTeam(player))
        },
        {
          text: 'Delete Player',
          icon: trash,
          role: 'destructive',
          handler: () => handleAction(() => onDelete(player))
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]}
    />
  );
};

export default PlayerContextMenu;