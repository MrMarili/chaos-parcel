import { useCallback, useReducer } from 'react';
import type {
  AbilityType,
  CooldownState,
  GameEndPayload,
  GameStatePayload,
  PackageExplodedPayload,
  PlayerInfo,
  RoundEndPayload,
  WsMessage,
} from '@chaos-parcel/shared';

export type ClientScreen = 'join' | 'lobby' | 'playing' | 'round_end' | 'summary';

export interface GameState {
  screen: ClientScreen;
  playerId: string | null;
  roomCode: string | null;
  players: PlayerInfo[];
  gameState: GameStatePayload | null;
  roundEnd: RoundEndPayload | null;
  gameEnd: GameEndPayload | null;
  cooldowns: CooldownState;
  error: string | null;
  lastExplosion: PackageExplodedPayload | null;
}

const defaultCooldowns: CooldownState = {
  FREEZE: 0,
  SHOCKWAVE: 0,
  MAGNET: 0,
  CONFUSION: 0,
};

const initialState: GameState = {
  screen: 'join',
  playerId: null,
  roomCode: null,
  players: [],
  gameState: null,
  roundEnd: null,
  gameEnd: null,
  cooldowns: defaultCooldowns,
  error: null,
  lastExplosion: null,
};

type Action =
  | { type: 'SET_JOINED'; playerId: string; roomCode: string; players: PlayerInfo[] }
  | { type: 'SET_PLAYERS'; players: PlayerInfo[] }
  | { type: 'SET_GAME_STATE'; payload: GameStatePayload }
  | { type: 'SET_ROUND_END'; payload: RoundEndPayload }
  | { type: 'SET_GAME_END'; payload: GameEndPayload }
  | { type: 'SET_EXPLOSION'; payload: PackageExplodedPayload }
  | { type: 'CLEAR_EXPLOSION' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'HOST_DISCONNECTED' }
  | { type: 'RESET_TO_LOBBY' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_JOINED':
      return {
        ...state,
        screen: 'lobby',
        playerId: action.playerId,
        roomCode: action.roomCode,
        players: action.players,
        error: null,
      };
    case 'SET_PLAYERS':
      return { ...state, players: action.players };
    case 'SET_GAME_STATE':
      return {
        ...state,
        screen: action.payload.status === 'IN_GAME' ? 'playing' : 'lobby',
        gameState: action.payload,
        cooldowns: action.payload.cooldowns?.[state.playerId ?? ''] ?? state.cooldowns,
      };
    case 'SET_ROUND_END':
      return { ...state, screen: 'round_end', roundEnd: action.payload };
    case 'SET_GAME_END':
      return { ...state, screen: 'summary', gameEnd: action.payload };
    case 'SET_EXPLOSION':
      return { ...state, lastExplosion: action.payload };
    case 'CLEAR_EXPLOSION':
      return { ...state, lastExplosion: null };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'HOST_DISCONNECTED':
      return {
        ...state,
        screen: 'join',
        error: 'המארח התנתק. סרוק שוב את קוד ה-QR.',
        gameState: null,
      };
    case 'RESET_TO_LOBBY':
      return {
        ...state,
        screen: 'lobby',
        roundEnd: null,
        gameEnd: null,
        gameState: null,
      };
    default:
      return state;
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleMessage = useCallback((message: WsMessage, localPlayerId?: string) => {
    switch (message.event) {
      case 'PLAYER_JOINED':
        if (localPlayerId && message.payload.player.player_id === localPlayerId) {
          dispatch({
            type: 'SET_JOINED',
            playerId: localPlayerId,
            roomCode: message.payload.room_code,
            players: message.payload.players,
          });
        } else {
          dispatch({ type: 'SET_PLAYERS', players: message.payload.players });
        }
        break;
      case 'PLAYER_LEFT':
        dispatch({ type: 'SET_PLAYERS', players: message.payload.players });
        break;
      case 'GAME_STATE':
        dispatch({ type: 'SET_GAME_STATE', payload: message.payload });
        break;
      case 'ROUND_END':
        dispatch({ type: 'SET_ROUND_END', payload: message.payload });
        break;
      case 'PACKAGE_EXPLODED':
        dispatch({ type: 'SET_EXPLOSION', payload: message.payload });
        break;
      case 'GAME_END':
        dispatch({ type: 'SET_GAME_END', payload: message.payload });
        break;
      case 'HOST_DISCONNECTED':
        dispatch({ type: 'HOST_DISCONNECTED' });
        break;
      case 'ERROR':
        dispatch({ type: 'SET_ERROR', error: message.payload.message });
        break;
    }
  }, []);

  const hasPackage =
    state.gameState?.package_holder_id !== null &&
    state.gameState?.package_holder_id !== undefined &&
    state.gameState.package_holder_id === state.playerId;

  const tickCooldowns = useCallback(() => {
    dispatch({
      type: 'SET_GAME_STATE',
      payload: {
        ...(state.gameState ?? {
          room_code: state.roomCode ?? '',
          status: 'IN_GAME',
          round: 1,
          package_holder_id: null,
          players: state.players,
        }),
        cooldowns: undefined,
      },
    });
  }, [state.gameState, state.roomCode, state.players]);

  return {
    state,
    dispatch,
    handleMessage,
    hasPackage,
    tickCooldowns,
    clearExplosion: () => dispatch({ type: 'CLEAR_EXPLOSION' }),
    setLocalCooldown: (ability: AbilityType, seconds: number) => {
      dispatch({
        type: 'SET_GAME_STATE',
        payload: {
          ...(state.gameState ?? {
            room_code: state.roomCode ?? '',
            status: 'IN_GAME',
            round: 1,
            package_holder_id: null,
            players: state.players,
          }),
        },
      });
      void ability;
      void seconds;
    },
  };
}
