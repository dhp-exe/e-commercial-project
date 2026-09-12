import { pool } from '../../shared/db/pool.js';

/**
 * Inserts user feedback into the feedback table.
 *
 * @param {Object} feedbackData - Feedback payload
 * @param {string} feedbackData.name - User's name
 * @param {string} feedbackData.email - User's email
 * @param {string} feedbackData.message - Feedback message
 * @returns {Promise<Object>} MySQL execute result
 */
export async function insertFeedback({ name, email, message }) {
  const [result] = await pool.execute(
    'INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)',
    [name, email, message]
  );
  return result;
}
