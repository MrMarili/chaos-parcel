type GameTitleTag = 'h1' | 'p' | 'span';

interface GameTitleProps {
  as?: GameTitleTag;
  className?: string;
}

export const GAME_DISPLAY_NAME = 'חבילה מתפוצצת';

/** Browser tab titles */
export const HOST_DOCUMENT_TITLE = 'חבילה מתפוצצת - ראשי';
export const PLAYER_DOCUMENT_TITLE = 'חבילה מתפוצצת - שלט';

/**
 * Game name with explosion icon on the visual left (RTL: after the text in DOM).
 * Use everywhere the product name is shown in the UI.
 */
export function GameTitle({ as: Tag = 'h1', className = '' }: GameTitleProps) {
  return (
    <Tag className={`game-title ${className}`.trim()}>
      <span className="game-title-name">{GAME_DISPLAY_NAME}</span>
      <span className="game-title-boom" aria-hidden="true">
        💥
      </span>
    </Tag>
  );
}
