// Helper function to generate unique IDs
export const uid = () => Math.random().toString(36).slice(2,9);

// Helper function to convert hex color to rgba
export const hexToRgba = (hex, alpha = 1) => {
  if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return '';
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
};

/**
 * Calculates the week number for a given date, with weeks starting on Sunday.
 * @param {Date} d The date to calculate the week number for.
 * @returns {number} The week number.
 */
export const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayNum = Math.floor((date - yearStart) / 86400000) + 1;
    const startDayOfWeek = yearStart.getUTCDay(); // 0=Sun
    const days = dayNum + startDayOfWeek;
    const weekNum = Math.ceil(days / 7);
    return weekNum;
};

/**
 * Gets week information including the week number and its parity (odd/even).
 * @param {Date | string | number} dateInput The date to check.
 * @returns {{weekNumber: number, parity: 'odd' | 'even'}}
 */
export const getWeekInfo = (dateInput) => {
  const date = new Date(dateInput);
  const weekNumber = getWeekNumber(date);
  const parity = weekNumber % 2 === 0 ? 'even' : 'odd';
  return { weekNumber, parity };
};