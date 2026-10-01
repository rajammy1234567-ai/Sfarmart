/**
 * userApp/src/config/categories.js
 * 
 * Central presentation metadata and canonical configuration for Customer Browse Categories.
 * Maps the 8 platform categories to established seed/backend canonical slugs while preserving
 * separation between presentation identity and MongoDB database ObjectIds.
 */

export const CANONICAL_BROWSE_CATEGORIES = [
  {
    key: 'vegetables',
    canonicalSlug: 'vegetables',
    name: 'Fresh Fruits & Vegetables',
    shortName: 'Fruits & Veggies',
    type: 'GROCERY',
    icon: '🥦',
    vectorIcon: 'leaf-outline',
    accentColor: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    sortOrder: 1,
    aliases: ['fresh-vegetables', 'fruits-vegetables', 'fruits-and-vegetables', 'staging-produce']
  },
  {
    key: 'dairy-milk',
    canonicalSlug: 'dairy-milk',
    name: 'Dairy, Bread & Eggs',
    shortName: 'Dairy & Bread',
    type: 'GROCERY',
    icon: '🥛',
    vectorIcon: 'water-outline',
    accentColor: '#0284c7',
    bgColor: '#f0f9ff',
    borderColor: '#bae6fd',
    sortOrder: 2,
    aliases: ['dairy', 'milk-butter', 'bread-eggs', 'dairy-bread-eggs']
  },
  {
    key: 'atta-rice-dal',
    canonicalSlug: 'atta-rice-dal',
    name: 'Atta, Rice & Dal',
    shortName: 'Atta & Dals',
    type: 'GROCERY',
    icon: '🌾',
    vectorIcon: 'layers-outline',
    accentColor: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    sortOrder: 3,
    aliases: ['atta-flours', 'rice-grains', 'dals-pulses', 'grains']
  },
  {
    key: 'oil-ghee-masala',
    canonicalSlug: 'oil-ghee-masala',
    name: 'Oil, Ghee & Masala',
    shortName: 'Oil & Spices',
    type: 'GROCERY',
    icon: '🫙',
    vectorIcon: 'flame-outline',
    accentColor: '#ea580c',
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    sortOrder: 4,
    aliases: ['oils-ghee', 'spices', 'masala', 'cooking-oils']
  },
  {
    key: 'home-thali',
    canonicalSlug: 'home-thali',
    name: 'Ghar Ka Khana / Home Thali',
    shortName: 'Home Thali',
    type: 'FOOD',
    icon: '🍛',
    vectorIcon: 'restaurant-outline',
    accentColor: '#e11d48',
    bgColor: '#fff1f2',
    borderColor: '#fecdd3',
    sortOrder: 5,
    aliases: ['homerestro', 'home-restro', 'thali', 'punjabi-thali', 'parathas-rolls']
  },
  {
    key: 'sweets-bakery',
    canonicalSlug: 'sweets-bakery',
    name: 'Mithai & Bakery',
    shortName: 'Mithai & Cakes',
    type: 'FOOD',
    icon: '🍰',
    vectorIcon: 'gift-outline',
    accentColor: '#ec4899',
    bgColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    sortOrder: 6,
    aliases: ['desi-mithai', 'bakery', 'sweets', 'cakes-pastries']
  },
  {
    key: 'snacks-namkeen',
    canonicalSlug: 'snacks-namkeen',
    name: 'Snacks & Munchies',
    shortName: 'Snacks',
    type: 'GROCERY',
    icon: '🍿',
    vectorIcon: 'pizza-outline',
    accentColor: '#b45309',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    sortOrder: 7,
    aliases: ['namkeen', 'chips', 'munchies', 'healthy-snacks']
  },
  {
    key: 'beverages',
    canonicalSlug: 'beverages',
    name: 'Cold Drinks & Juices',
    shortName: 'Cold Drinks',
    type: 'GROCERY',
    icon: '🧃',
    vectorIcon: 'wine-outline',
    accentColor: '#0891b2',
    bgColor: '#ecfeff',
    borderColor: '#a5f3fc',
    sortOrder: 8,
    aliases: ['fresh-juices', 'soft-drinks', 'drinks', 'juices']
  }
];

/**
 * Normalizes text for matching comparison
 */
const normalizeString = (str = '') =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

/**
 * Matches an API category to one of the 8 canonical categories
 */
export const findCanonicalCategoryMatch = (apiCat) => {
  if (!apiCat) return null;
  const slug = (apiCat.slug || '').toLowerCase();
  const name = (apiCat.name || '').toLowerCase();
  const normName = normalizeString(name);
  const normSlug = normalizeString(slug);

  return CANONICAL_BROWSE_CATEGORIES.find((c) => {
    // Exact canonical slug match
    if (c.canonicalSlug === slug) return true;

    // Direct alias match
    if (c.aliases.includes(slug)) return true;

    // Partial/prefix slug match
    if (c.aliases.some((alias) => slug.includes(alias) || alias.includes(slug))) return true;

    // Normalized name keyword match
    const cNorm = normalizeString(c.name);
    if (cNorm === normName) return true;
    if (cNorm.includes(normName) || normName.includes(cNorm)) return true;

    // Special case for staging fixture category e.g. "Staging Fresh Produce (staging-prod-...)"
    if (c.canonicalSlug === 'vegetables' && (slug.startsWith('staging-produce') || name.includes('produce') || name.includes('vegetable'))) {
      return true;
    }

    return false;
  }) || null;
};

/**
 * Resolves the final display category list by merging the 8 canonical categories
 * with live database categories fetched from GET /api/categories.
 *
 * Rules:
 * 1. Exactly 8 canonical categories are established as the primary browse rail/grid.
 * 2. If a backend category matches a canonical category, its real MongoDB `_id` is linked.
 * 3. If a canonical category has no backend record in DB, `dbId` is null and `isAvailableInDb: false`.
 *    (Never invent fake IDs like 'cat-1' or map to an unrelated category).
 * 4. Any unexpected backend category not belonging to the 8 canonical categories is preserved
 *    and appended so dynamic backend additions remain visible.
 */
export const resolveBrowseCategories = (apiCategories = []) => {
  const matchedApiIds = new Set();

  // Map the 8 canonical categories
  const resolvedCanonical = CANONICAL_BROWSE_CATEGORIES.map((cfg) => {
    // Find matching API category if present
    const matchedApiCat = apiCategories.find((apiCat) => {
      const match = findCanonicalCategoryMatch(apiCat);
      return match && match.key === cfg.key;
    });

    if (matchedApiCat) {
      matchedApiIds.add(String(matchedApiCat._id || matchedApiCat.id));
      return {
        ...cfg,
        _id: matchedApiCat._id || null,
        dbId: matchedApiCat._id || null,
        slug: matchedApiCat.slug || cfg.canonicalSlug,
        apiCategory: matchedApiCat,
        isAvailableInDb: true
      };
    }

    // Configured category absent from the API database
    return {
      ...cfg,
      _id: null,
      dbId: null,
      slug: cfg.canonicalSlug,
      apiCategory: null,
      isAvailableInDb: false
    };
  });

  // Preserve any additional backend categories not covered by the canonical 8
  const additionalCategories = apiCategories
    .filter((apiCat) => {
      const id = String(apiCat._id || apiCat.id);
      return !matchedApiIds.has(id) && !findCanonicalCategoryMatch(apiCat);
    })
    .map((apiCat, idx) => ({
      key: `custom_${apiCat.slug || apiCat._id || idx}`,
      canonicalSlug: apiCat.slug || 'custom',
      slug: apiCat.slug || 'custom',
      name: apiCat.name || 'Other Category',
      shortName: apiCat.name || 'Other',
      type: apiCat.type || 'GROCERY',
      icon: apiCat.icon || '🛍️',
      vectorIcon: 'grid-outline',
      accentColor: '#64748b',
      bgColor: '#f8fafc',
      borderColor: '#e2e8f0',
      sortOrder: 100 + idx,
      _id: apiCat._id || null,
      dbId: apiCat._id || null,
      apiCategory: apiCat,
      isAvailableInDb: true,
      aliases: []
    }));

  return [...resolvedCanonical, ...additionalCategories];
};
