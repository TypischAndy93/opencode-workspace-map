/**
 * Utility functions for the application.
 * Provides common helpers for string manipulation, date formatting, and validation.
 */

/**
 * Capitalizes the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to camelCase
 * @param {string} str - String to convert
 * @returns {string} camelCase string
 */
function toCamelCase(str) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

/**
 * Converts a string to kebab-case
 * @param {string} str - String to convert
 * @returns {string} kebab-case string
 */
function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Generates a slug from a string
 * @param {string} str - String to slugify
 * @returns {string} URL-friendly slug
 */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncates a string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, length = 100) {
  if (!str || str.length <= length) return str;
  return str.slice(0, length - 1).trim() + '…';
}

/**
 * Formats a date as relative time (e.g., "2 hours ago")
 * @param {Date|string|number} date - Date to format
 * @returns {string} Relative time string
 */
function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

/**
 * Formats a date in a readable format
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date
 */
function formatDate(date, options = {}) {
  const d = new Date(date);
  const { locale = 'en-US', year = 'numeric', month = 'short', day = 'numeric' } = options;
  return d.toLocaleDateString(locale, { year, month, day });
}

/**
 * Validates an email address
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validates a URL
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep clones an object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Object) {
    const cloned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
}

/**
 * Debounces a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttles a function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generates a unique ID
 * @param {number} length - Length of ID
 * @returns {string} Unique ID
 */
function generateId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Groups an array by a key or function
 * @param {Array} array - Array to group
 * @param {string|Function} key - Key or function to group by
 * @returns {Object} Grouped object
 */
function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {});
}

/**
 * Flattens an array one level
 * @param {Array} array - Array to flatten
 * @returns {Array} Flattened array
 */
function flatten(array) {
  return array.reduce((flat, item) => flat.concat(Array.isArray(item) ? item : [item]), []);
}

/**
 * Removes duplicate values from an array
 * @param {Array} array - Array to deduplicate
 * @param {Function} keyFn - Optional key function for object comparison
 * @returns {Array} Deduplicated array
 */
function unique(array, keyFn) {
  if (!keyFn) return [...new Set(array)];
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Picks specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} keys - Keys to pick
 * @returns {Object} New object with picked keys
 */
function pick(obj, keys) {
  return keys.reduce((picked, key) => {
    if (key in obj) picked[key] = obj[key];
    return picked;
  }, {});
}

/**
 * Omits specific keys from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
function omit(obj, keys) {
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keySet.has(key))
  );
}

module.exports = {
  capitalize,
  toCamelCase,
  toKebabCase,
  slugify,
  truncate,
  formatRelativeTime,
  formatDate,
  isValidEmail,
  isValidUrl,
  deepClone,
  debounce,
  throttle,
  generateId,
  groupBy,
  flatten,
  unique,
  pick,
  omit,
};

// TODO: Add more date formatting options
// TODO: Add URL query string helpers
// FIXME: Add proper TypeScript types when migrating
// NOTE: Consider using lodash for production use