export type Slot = 'morning' | 'noon' | 'evening'
export type PostStatus = 'draft' | 'ready' | 'posted' | 'skipped'

export const SLOT_LABELS: Record<Slot, { en: string; time: string; emoji: string }> = {
  morning: { en: 'Morning',   time: '07:30', emoji: '☀️' },
  noon:    { en: 'Afternoon', time: '12:00', emoji: '🌿' },
  evening: { en: 'Evening',   time: '20:00', emoji: '🌙' },
}

export const THEMES = [
  { key: 'cherry_blossom',    name: 'Cherry Blossom (Sakura)' },
  { key: 'tea_ceremony',      name: 'Tea Ceremony (Chado)' },
  { key: 'shrine_visit',      name: 'Shrine Visit' },
  { key: 'japanese_garden',   name: 'Japanese Garden' },
  { key: 'autumn_leaves',     name: 'Autumn Leaves (Koyo)' },
  { key: 'summer_festival',   name: 'Summer Festival (Matsuri)' },
  { key: 'bamboo_grove',      name: 'Bamboo Grove (Arashiyama)' },
  { key: 'mount_fuji',        name: 'Mount Fuji' },
  { key: 'traditional_craft', name: 'Traditional Craft' },
  { key: 'wagashi',           name: 'Japanese Sweets (Wagashi)' },
  { key: 'winter_snow',       name: 'Winter Snow' },
  { key: 'gion_district',     name: 'Gion District, Kyoto' },
  { key: 'zen_garden',        name: 'Zen Rock Garden' },
  { key: 'lantern_festival',  name: 'Lantern Festival' },
  { key: 'morning_ritual',    name: 'Morning Ritual' },
  { key: 'ukiyoe_art',        name: 'Ukiyo-e Woodblock Print' },
  { key: 'onsen',             name: 'Hot Spring (Onsen)' },
  { key: 'calligraphy',       name: 'Japanese Calligraphy (Shodo)' },
] as const

export type ThemeKey = (typeof THEMES)[number]['key']
