import type { Card } from '../../domain/cards/Card';
import { CardImageRegistry } from '../assets/CardImageRegistry';

interface CardViewProps {
  readonly card?: Card;
  readonly hidden?: boolean;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onClick?: () => void;
}

export function CardView({ card, hidden = false, disabled = false, label, onClick }: CardViewProps) {
  const className = ['card-view', disabled ? 'card-view--disabled' : '', onClick ? 'card-view--button' : '']
    .filter(Boolean)
    .join(' ');

  if (hidden || !card) {
    return <div className="card-back" aria-label={label ?? 'Carta oculta'} />;
  }

  if (!onClick) {
    return <img className={className} src={CardImageRegistry.getImage(card)} alt={label ?? card.toString()} />;
  }

  return (
    <button className={className} type="button" disabled={disabled} onClick={onClick} aria-label={label ?? card.toString()}>
      <img src={CardImageRegistry.getImage(card)} alt="" />
    </button>
  );
}
