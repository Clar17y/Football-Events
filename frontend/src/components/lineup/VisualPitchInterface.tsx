/**
 * Visual Pitch Interface Component
 * SVG-based football pitch with drag and drop functionality for player positioning
 * Supports both touch and mouse interactions for cross-platform compatibility
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { buildFormationSummary } from '../../lib/formationCore';
import { IonIcon } from '@ionic/react';
import { person, close } from 'ionicons/icons';
import './VisualPitchInterface.css';

// Types for pitch positioning
export interface PitchPosition {
  x: number; // 0-100 percentage from left
  y: number; // 0-100 percentage from top
}

export interface PositionZone {
  code: string; // GK, CB, LB, etc.
  area: BoundingBox;
  priority: number; // For overlapping zones
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PlayerWithPosition {
  id: string;
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  position?: PitchPosition;
}

export interface FormationData {
  players: PlayerWithPosition[];
}

interface VisualPitchInterfaceProps {
  players: PlayerWithPosition[];
  formation: FormationData;
  onPlayerMove: (playerId: string, position: PitchPosition) => void;
  onPlayerRemove: (playerId: string) => void;
  readonly?: boolean;
  maxPlayers?: number;
}

// Default position zones for automatic position detection
const DEFAULT_POSITION_ZONES: PositionZone[] = [
  // Goalkeeper (narrower, around left goal area)
  { code: 'GK', area: { minX: 0, maxX: 12, minY: 40, maxY: 60 }, priority: 1 },

  // Defenders (cover full defensive third, include wingbacks)
  { code: 'CB', area: { minX: 12, maxX: 32, minY: 28, maxY: 72 }, priority: 2 },
  { code: 'LB', area: { minX: 8, maxX: 28, minY: 0, maxY: 36 }, priority: 2 },
  { code: 'RB', area: { minX: 8, maxX: 28, minY: 64, maxY: 100 }, priority: 2 },
  { code: 'LWB', area: { minX: 24, maxX: 42, minY: 0, maxY: 32 }, priority: 2 },
  { code: 'RWB', area: { minX: 24, maxX: 42, minY: 68, maxY: 100 }, priority: 2 },

  // Midfielders
  { code: 'CDM', area: { minX: 34, maxX: 52, minY: 30, maxY: 70 }, priority: 3 },
  { code: 'CM',  area: { minX: 44, maxX: 64, minY: 24, maxY: 76 }, priority: 3 },
  { code: 'LM',  area: { minX: 40, maxX: 62, minY: 0,  maxY: 30 }, priority: 3 },
  { code: 'RM',  area: { minX: 40, maxX: 62, minY: 70, maxY: 100 }, priority: 3 },
  { code: 'LAM', area: { minX: 58, maxX: 74, minY:  8, maxY: 36 }, priority: 3 },
  { code: 'RAM', area: { minX: 58, maxX: 74, minY: 64, maxY: 92 }, priority: 3 },
  { code: 'CAM', area: { minX: 60, maxX: 78, minY: 24, maxY: 76 }, priority: 3 },

  // Forwards
  { code: 'LW', area: { minX: 76, maxX: 98, minY: 0, maxY: 36 }, priority: 4 },
  { code: 'RW', area: { minX: 76, maxX: 98, minY: 64, maxY: 100 }, priority: 4 },
  { code: 'CF', area: { minX: 72, maxX: 96, minY: 30, maxY: 70 }, priority: 4 },
  { code: 'ST', area: { minX: 82, maxX: 100, minY: 24, maxY: 76 }, priority: 4 },
];

const VisualPitchInterface: React.FC<VisualPitchInterfaceProps> = ({
  players,
  formation,
  onPlayerMove,
  onPlayerRemove,
  readonly = false,
  maxPlayers = 11
}) => {
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<PitchPosition>({ x: 0, y: 0 });
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [quickPlacePlayerId, setQuickPlacePlayerId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const pitchRef = useRef<SVGSVGElement>(null);
  const MAGNETIC_THRESHOLD = 6; // percent units (0-100)
  const dragRectRef = useRef<DOMRect | null>(null);
  const lastNotifyRef = useRef<number>(0);
  const liveDragPosRef = useRef<PitchPosition | null>(null);

  // Calculate position zone based on coordinates
  const calculatePositionZone = useCallback((position: PitchPosition): string => {
    const matchingZones = DEFAULT_POSITION_ZONES.filter(zone => 
      position.x >= zone.area.minX && position.x <= zone.area.maxX &&
      position.y >= zone.area.minY && position.y <= zone.area.maxY
    );

    if (matchingZones.length > 0) {
      // Return zone with highest priority (lowest number)
      return matchingZones.reduce((best, current) => 
        current.priority < best.priority ? current : best
      ).code;
    }

    // No match: choose closest zone by distance to its rectangle
    let closestCode = 'CM';
    let bestDist = Infinity;
    for (const zone of DEFAULT_POSITION_ZONES) {
      const { minX, maxX, minY, maxY } = zone.area;
      const dx = position.x < minX ? (minX - position.x) : (position.x > maxX ? (position.x - maxX) : 0);
      const dy = position.y < minY ? (minY - position.y) : (position.y > maxY ? (position.y - maxY) : 0);
      const d = Math.hypot(dx, dy);
      if (d < bestDist || (d === bestDist && zone.priority < (DEFAULT_POSITION_ZONES.find(z => z.code === closestCode)?.priority ?? 99))) {
        bestDist = d;
        closestCode = zone.code;
      }
    }
    return closestCode;
  }, []);

  const getZoneByCode = useCallback((code: string): PositionZone | undefined => {
    return DEFAULT_POSITION_ZONES.find(z => z.code === code);
  }, []);

  // Lookup zone info by code (declared before use to avoid TDZ)
  // Convert screen coordinates to pitch percentage
  const screenToPitchCoordinates = useCallback((clientX: number, clientY: number): PitchPosition | null => {
    if (!pitchRef.current) return null;
    const rect = dragRectRef.current ?? pitchRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    // Clamp to pitch boundaries
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    };
  }, []);

  // Handle drag start (mouse and touch)
  const handleDragStart = useCallback((playerId: string, event: React.MouseEvent | React.TouchEvent) => {
    if (readonly) return;
    if (quickPlacePlayerId) return;

    event.preventDefault();
    setDraggedPlayer(playerId);
    isDraggingRef.current = false;
    if (pitchRef.current) {
      dragRectRef.current = pitchRef.current.getBoundingClientRect();
    }

    const player = formation.players.find(p => p.id === playerId);
    if (!player?.position) return;

    // Calculate offset from player center to cursor/touch point
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const pitchPos = screenToPitchCoordinates(clientX, clientY);
    if (pitchPos) {
      setDragOffset({
        x: pitchPos.x - player.position.x,
        y: pitchPos.y - player.position.y
      });
    }
  }, [readonly, formation.players, screenToPitchCoordinates, quickPlacePlayerId]);

  // Handle drag move
  const handleDragMove = useCallback((event: MouseEvent | TouchEvent) => {
    if (!draggedPlayer) return;

    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    const pitchPos = screenToPitchCoordinates(clientX, clientY);
    if (pitchPos) {
      isDraggingRef.current = true;
      const adjustedPos = {
        x: pitchPos.x - dragOffset.x,
        y: pitchPos.y - dragOffset.y
      };

      // Update hovered zone for visual feedback
      const zone = calculatePositionZone(adjustedPos);
      setHoveredZone(zone);

      // Update tooltip position near the cursor within the pitch container
      if (pitchRef.current) {
        const rect = pitchRef.current.getBoundingClientRect();
        setPointerPos({ x: clientX - rect.left, y: clientY - rect.top });
      }

      // Update local live position for immediate rendering (no magnetic snap)
      liveDragPosRef.current = adjustedPos;

      // Do not notify parent during drag; commit on drag end only
    }
  }, [draggedPlayer, dragOffset, screenToPitchCoordinates, calculatePositionZone]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedPlayer(null);
    setDragOffset({ x: 0, y: 0 });
    setHoveredZone(null);
    setPointerPos(null);
    setTimeout(() => { isDraggingRef.current = false; }, 0);
    dragRectRef.current = null;
    if (draggedPlayer && liveDragPosRef.current) {
      onPlayerMove(draggedPlayer, liveDragPosRef.current);
    }
    liveDragPosRef.current = null;
  }, [draggedPlayer, onPlayerMove]);
  // Set up global event listeners for drag operations
  useEffect(() => {
    if (!draggedPlayer) return;

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchEnd = () => handleDragEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [draggedPlayer, handleDragMove, handleDragEnd]);

  // Handle player removal
  const handlePlayerRemove = useCallback((playerId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onPlayerRemove(playerId);
  }, [onPlayerRemove]);

  const handlePlayerClick = useCallback((playerId: string, event: React.MouseEvent | React.TouchEvent) => {
    if (readonly) return;
    if (isDraggingRef.current) return;
    event.stopPropagation();
    setQuickPlacePlayerId(playerId);
  }, [readonly]);

  const handleQuickPlaceSelect = useCallback((code: string, overrideX?: number, overrideY?: number) => {
    if (!quickPlacePlayerId) return;
    let target = undefined as PitchPosition | undefined;
    if (typeof overrideX === 'number' && typeof overrideY === 'number') {
      target = { x: overrideX, y: overrideY };
    } else {
      const zone = getZoneByCode(code);
      if (!zone) return;
      target = {
        x: (zone.area.minX + zone.area.maxX) / 2,
        y: (zone.area.minY + zone.area.maxY) / 2,
      };
    }
    onPlayerMove(quickPlacePlayerId, target);
    setHoveredZone(code);
    // Anchor feedback near the clicked target
    if (pitchRef.current) {
      const rect = pitchRef.current.getBoundingClientRect();
      const xPx = (target.x / 100) * rect.width;
      const yPx = (target.y / 100) * rect.height;
      setPointerPos({ x: xPx, y: yPx });
    }
    setQuickPlacePlayerId(null);
  }, [quickPlacePlayerId, getZoneByCode, onPlayerMove]);

  const handlePitchClick = useCallback(() => {
    if (quickPlacePlayerId) setQuickPlacePlayerId(null);
  }, [quickPlacePlayerId]);

  // Get positioned players (those with coordinates)
  const positionedPlayers = formation.players.filter(player => player.position);

  return (
    <div className="visual-pitch-interface">
      <div className="pitch-container">
        <svg
          ref={pitchRef}
          className="football-pitch"
          viewBox="0 0 100 60"
          preserveAspectRatio="xMidYMid meet"
          onClick={handlePitchClick}
        >
          {/* Pitch background */}
          <rect
            x="0"
            y="0"
            width="100"
            height="60"
            className="pitch-background"
          />

          {/* Pitch markings */}
          {/* Outer boundary */}
          <rect
            x="1"
            y="1"
            width="98"
            height="58"
            className="pitch-line"
            fill="none"
          />

          {/* Center line */}
          <line
            x1="50"
            y1="1"
            x2="50"
            y2="59"
            className="pitch-line"
          />

          {/* Center circle */}
          <circle
            cx="50"
            cy="30"
            r="8"
            className="pitch-line"
            fill="none"
          />

          {/* Center spot */}
          <circle
            cx="50"
            cy="30"
            r="0.5"
            className="pitch-line"
          />

          {/* Left penalty area */}
          <rect
            x="1"
            y="12"
            width="16"
            height="36"
            className="pitch-line"
            fill="none"
          />

          {/* Left goal area */}
          <rect
            x="1"
            y="21"
            width="5"
            height="18"
            className="pitch-line"
            fill="none"
          />

          {/* Left penalty spot */}
          <circle
            cx="11"
            cy="30"
            r="0.5"
            className="pitch-line"
          />

          {/* Right penalty area */}
          <rect
            x="83"
            y="12"
            width="16"
            height="36"
            className="pitch-line"
            fill="none"
          />

          {/* Right goal area */}
          <rect
            x="94"
            y="21"
            width="5"
            height="18"
            className="pitch-line"
            fill="none"
          />

          {/* Right penalty spot */}
          <circle
            cx="89"
            cy="30"
            r="0.5"
            className="pitch-line"
          />

          {/* Position zones (when hovering) */}
          {hoveredZone && (
            <g className="position-zones">
              {DEFAULT_POSITION_ZONES
                .filter(zone => zone.code === hoveredZone)
                .map(zone => (
                  <rect
                    key={zone.code}
                    x={zone.area.minX}
                    y={(zone.area.minY / 100) * 60}
                    width={zone.area.maxX - zone.area.minX}
                    height={((zone.area.maxY - zone.area.minY) / 100) * 60}
                    className="position-zone-highlight"
                    fill="rgba(63, 81, 181, 0.30)"
                    stroke="rgba(63, 81, 181, 0.85)"
                    strokeWidth="1.2"
                  />
                ))}
            </g>
          )}

          {/* Quick placement targets overlay */}
          {!readonly && quickPlacePlayerId && (
            <g className="quick-place-targets">
              {(() => {
                const targets: { code: string; x: number; y: number; key: string }[] = [];
                DEFAULT_POSITION_ZONES.forEach(zone => {
                  const cx = (zone.area.minX + zone.area.maxX) / 2;
                  const cy = (zone.area.minY + zone.area.maxY) / 2;
                  const minY = zone.area.minY;
                  const maxY = zone.area.maxY;
                  const dy = Math.min((maxY - minY) / 4, 10);
                  if (zone.code === 'CB' || zone.code === 'CM') {
                    const y1 = Math.max(minY + 2, Math.min(maxY - 2, cy - dy));
                    const y2 = Math.max(minY + 2, Math.min(maxY - 2, cy + dy));
                    targets.push({ code: zone.code, x: cx, y: y1, key: `${zone.code}-1` });
                    targets.push({ code: zone.code, x: cx, y: y2, key: `${zone.code}-2` });
                  } else {
                    targets.push({ code: zone.code, x: cx, y: cy, key: `${zone.code}` });
                  }
                });
                return targets.map(t => (
                  <g
                    key={t.key}
                    className="quick-place-target"
                    transform={`translate(${t.x}, ${(t.y / 100) * 60})`}
                    onClick={(e) => { e.stopPropagation(); handleQuickPlaceSelect(t.code, t.x, t.y); }}
                  >
                    <circle cx="0" cy="0" r="3.2" className="quick-place-circle" />
                    <text x="0" y="0.4" className="quick-place-label" textAnchor="middle">{t.code}</text>
                  </g>
                ));
              })()}
            </g>
          )}

          {/* Players */}
          {positionedPlayers.map(player => {
            const isDragging = draggedPlayer === player.id;
            const position = (isDragging && liveDragPosRef.current) ? liveDragPosRef.current : player.position!;
            
            return (
              <g
                key={player.id}
                className={`player-marker ${isDragging ? 'dragging' : ''}`}
                transform={`translate(${position.x}, ${(position.y / 100) * 60})`}
                onClick={(e) => handlePlayerClick(player.id, e as any)}
              >
                {/* Player circle */}
                <circle
                  cx="0"
                  cy="0"
                  r="3.2"
                  className="player-circle"
                  onMouseDown={(e) => handleDragStart(player.id, e)}
                  onTouchStart={(e) => handleDragStart(player.id, e)}
                />

                {/* Squad number */}
                {player.squadNumber && (
                  <text
                    x="0"
                    y="0.5"
                    className="player-number"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {player.squadNumber}
                  </text>
                )}



                {/* Player name tooltip */}
                <title>{player.name}</title>
              </g>
            );
          })}
        </svg>

        {/* Player count indicator */}
        <div className="player-count">
          {positionedPlayers.length} / {maxPlayers} players
        </div>
        {/* Position feedback inside the pitch container for correct anchoring */}
        {hoveredZone && (
          <div
            className={`position-feedback ${pointerPos ? 'floating' : ''}`}
            style={pointerPos ? { top: `${pointerPos.y}px`, left: `${pointerPos.x}px` } : undefined}
          >
            Position: {hoveredZone}
          </div>
        )}
      </div>

      {/* Live formation indicator */}
      <div className="formation-indicator">
        {(() => {
          const withPos = formation.players.filter(p => p.position);
          if (withPos.length === 0) return null;
          const list = withPos.map(p => {
            const useLive = draggedPlayer === p.id && liveDragPosRef.current;
            const pos = useLive ? liveDragPosRef.current! : p.position!;
            return { id: p.id, x: pos.x, y: pos.y, preferredPosition: p.preferredPosition };
          });
          const summary = buildFormationSummary(list);
          return <span>Formation: <strong>{summary.labelOutfield}</strong></span>;
        })()}
      </div>
    </div>
  );
};

export default VisualPitchInterface;
