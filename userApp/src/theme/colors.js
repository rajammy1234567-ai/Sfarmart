import { colors as baseColors, tokens } from './tokens';

export const colors = {
  ...baseColors,
  // Backward compatibility aliases
  orange: baseColors.secondary,
  orangeLight: baseColors.secondaryLight,
  darkBg: '#0f172a',
  darkCard: '#1e293b',
  shadow: tokens.shadows.card.shadowColor
};

export const roles = [
  {
    id: 'customer',
    name: 'Customer',
    desc: 'Shop fresh produce & everyday essentials',
    icon: 'person-outline',
    color: baseColors.primary
  }
];

export { tokens };
