import { colors as baseColors, tokens } from './tokens';

export const colors = {
  ...baseColors,
  // Backward compatibility aliases
  orange: baseColors.secondary,
  orangeLight: baseColors.secondaryLight,
  shadow: tokens.shadows.card.shadowColor
};

export const partnerTypes = [
  { id: 'farmer', name: 'Farmer Produce', icon: 'leaf-outline' },
  { id: 'homerestro', name: 'Home Restro & Chef', icon: 'restaurant-outline' },
  { id: 'sweets_bakery', name: 'Desi Sweets & Bakery', icon: 'gift-outline' },
  { id: 'village_hub', name: 'Village Hub Manager', icon: 'home-outline' }
];

export { tokens };
