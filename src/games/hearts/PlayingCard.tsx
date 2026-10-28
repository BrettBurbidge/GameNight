import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { type CardId, isRed, rankLabel, SUIT_SYMBOL, suitOf } from '../../../shared/cards';
import './cards.css';

type Props = HTMLMotionProps<'div'> & {
  card?: CardId;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  highlight?: boolean;
};

/** A CSS-drawn playing card, reusable by every card game. */
export const PlayingCard = forwardRef<HTMLDivElement, Props>(function PlayingCard(
  { card, faceDown, size = 'md', selected, disabled, highlight, className = '', ...rest },
  ref,
) {
  if (faceDown || !card) {
    return <motion.div ref={ref} className={`pcard back ${size} ${className}`} {...rest} />;
  }
  const suit = SUIT_SYMBOL[suitOf(card)];
  const rank = rankLabel(card);
  return (
    <motion.div
      ref={ref}
      className={`pcard ${size} ${isRed(card) ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${highlight ? 'highlight' : ''} ${className}`}
      {...rest}
    >
      <span className="pcard-corner">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      <span className="pcard-pip">{card === 'QS' ? '👸' : suit}</span>
      <span className="pcard-corner flip">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
    </motion.div>
  );
});
