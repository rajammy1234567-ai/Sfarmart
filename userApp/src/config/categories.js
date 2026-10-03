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
 * Resolves the display category list by strictly decorating and ordering
 * live database categories returned from the server endpoint.
 *
 * Rules:
 * 1. Must ONLY decorate and reorder returned records from apiCategories.
 * 2. Must NEVER reintroduce hidden, inactive, or missing categories from local
 *    canonical configuration.
 * 3. If apiCategories is empty or null, returns empty array [].
 * 4. Deduplicates strictly by exact database ID (_id or id) if repeated.
 *    Never merges distinct database categories just because aliases or metadata match.
 * 5. Uses the real MongoDB _id as the primary record identity (key) while keeping
 *    canonical presentation keys (canonicalKey) separate.
 * 6. Merges presentation styling (vectorIcon, accentColor, bgColor, borderColor, shortName)
 *    when an API category matches a canonical definition.
 * 7. Preserves real database fields (_id, slug, name, type, sortOrder, etc.).
 * 8. Orders categories by sortOrder ascending, falling back to canonical sortOrder.
 */
export const resolveBrowseCategories = (apiCategories = []) => {
  if (!Array.isArray(apiCategories) || apiCategories.length === 0) {
    return [];
  }

  // Deduplicate strictly by database ID (_id or id) if the exact same record repeats.
  // Distinct database IDs must NEVER be merged even if their icons/aliases/canonical profiles match.
  const seenIds = new Set();
  const dedupedApiCategories = [];

  for (const apiCat of apiCategories) {
    if (!apiCat) continue;
    const rawId = apiCat._id || apiCat.id;
    if (rawId != null) {
      const idStr = String(rawId);
      if (seenIds.has(idStr)) {
        continue; // Exact same database ID repeats: deduplicate
      }
      seenIds.add(idStr);
    }
    dedupedApiCategories.push(apiCat);
  }

  const decorated = dedupedApiCategories.map((apiCat, idx) => {
    const rawId = apiCat._id || apiCat.id;
    const dbId = rawId != null ? String(rawId) : null;
    const stableKey = dbId || `cat_${apiCat.slug || idx}`;
    const match = findCanonicalCategoryMatch(apiCat);

    if (match) {
      return {
        ...match,
        // Stable React and record identity: use real database _id
        _id: rawId || null,
        dbId: rawId || null,
        key: stableKey,
        // Keep canonical presentation keys separate from record identity
        canonicalKey: match.key,
        presentationKey: match.key,
        name: apiCat.name || match.name,
        slug: apiCat.slug || match.canonicalSlug,
        type: apiCat.type || match.type,
        icon: apiCat.icon || match.icon,
        vectorIcon: match.vectorIcon,
        accentColor: match.accentColor,
        bgColor: match.bgColor,
        borderColor: match.borderColor,
        shortName: match.shortName,
        sortOrder: typeof apiCat.sortOrder === 'number' ? apiCat.sortOrder : match.sortOrder,
        apiCategory: apiCat,
        isAvailableInDb: true
      };
    }

    // Dynamic backend category not matching any canonical definition
    return {
      _id: rawId || null,
      dbId: rawId || null,
      key: stableKey,
      canonicalKey: null,
      presentationKey: null,
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
      sortOrder: typeof apiCat.sortOrder === 'number' ? apiCat.sortOrder : (100 + idx),
      apiCategory: apiCat,
      isAvailableInDb: true,
      aliases: []
    };
  });

  return decorated.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
};
