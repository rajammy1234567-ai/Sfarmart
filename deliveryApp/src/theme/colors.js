import { colors as baseColors, tokens } from './tokens';

export const colors = {
  ...baseColors,
  // Backward compatibility aliases
  cardLight: '#f1f5f9',
  textPrimaryLight: '#ffffff',
  shadow: tokens.shadows.card.shadowColor
};

export { tokens };
