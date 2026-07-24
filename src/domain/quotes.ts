export interface SidebarQuote {
  text: string
  author: string
}

export const SIDEBAR_QUOTES: SidebarQuote[] = [
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.', author: 'Antoine de Saint-Exupéry' },
  { text: 'The ability to simplify means to eliminate the unnecessary so that the necessary may speak.', author: 'Hans Hofmann' },
  { text: 'Less is more.', author: 'Ludwig Mies van der Rohe' },
  { text: 'Simplicity boils down to two things: Identify the essential, and eliminate the rest.', author: 'Leo Babauta' },
  { text: 'Our life is frittered away by detail. Simplify, simplify.', author: 'Henry David Thoreau' },
  { text: 'Have nothing in your house that you do not know to be useful or believe to be beautiful.', author: 'William Morris' },
  { text: 'The secret of happiness, you see, is not found in seeking more, but in developing the capacity to enjoy less.', author: 'Socrates' },
  { text: 'Be content with what you have; rejoice in the way things are. When you realize there is nothing lacking, the whole world belongs to you.', author: 'Lao Tzu' },
  { text: 'Life is really simple, but we insist on making it complicated.', author: 'Confucius' },
  { text: 'If your mind isn\'t clouded by unnecessary things, then this is the best season of your life.', author: 'Wu-Men' },
  { text: 'Besides the noble art of getting things done, there is the noble art of leaving things undone. The wisdom of life consists in the elimination of non-essentials.', author: 'Lin Yutang' },
  { text: 'Out of clutter, find simplicity. From discord, find harmony. In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'The things you own end up owning you.', author: 'Chuck Palahniuk' },
  { text: 'Any intelligent fool can make things bigger, more complex, and more violent. It takes a touch of genius — and a lot of courage — to move in the opposite direction.', author: 'E.F. Schumacher' },
  { text: 'You have succeeded in life when all you really want is only what you really need.', author: 'Vernon Howard' },
  { text: 'Organizing is what you do before you do something, so that when you do it, it is not all mixed up.', author: 'A.A. Milne' },
  { text: 'Cleanliness and order are not matters of instinct; they are matters of education, and like most great things, you must cultivate a taste for them.', author: 'Benjamin Disraeli' },
  { text: 'For every minute spent organizing, an hour is earned.', author: 'Benjamin Franklin' },
  { text: 'A place for everything, everything in its place.', author: 'Benjamin Franklin' },
  { text: 'Clutter is not just physical stuff. It\'s old ideas, toxic relationships, and bad habits. It\'s anything that does not support your better self.', author: 'Eleanor Brownn' },
  { text: 'The ability to concentrate and to use time well is everything.', author: 'Lee Iacocca' },
  { text: 'Focus is a matter of deciding what things you\'re not going to do.', author: 'John Carmack' },
  { text: 'Starve your distractions, feed your focus.', author: 'Unknown' },
  { text: 'The main thing is to keep the main thing the main thing.', author: 'Stephen Covey' },
  { text: 'Concentrate all your thoughts upon the work at hand. The sun\'s rays do not burn until brought to a focus.', author: 'Alexander Graham Bell' },
  { text: 'Almost everything will work again if you unplug it for a few minutes — including you.', author: 'Anne Lamott' },
  { text: 'Order is the shape upon which beauty depends.', author: 'Pearl S. Buck' },
  { text: 'Outer order contributes to inner calm.', author: 'Gretchen Rubin' },
  { text: 'A calm mind brings inner strength and self-confidence, which is very important for good health.', author: 'Dalai Lama' },
]

/**
 * Get a daily quote based on the current date.
 * Uses the day-of-year as a seed so the same quote shows all day,
 * then rotates to the next one tomorrow.
 */
export function getDailyQuote(): SidebarQuote {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  const index = dayOfYear % SIDEBAR_QUOTES.length
  return SIDEBAR_QUOTES[index]
}
