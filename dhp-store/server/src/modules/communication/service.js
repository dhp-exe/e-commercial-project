import * as communicationRepository from './repository.js';

/**
 * Submits user feedback by delegating to repository.
 *
 * @param {Object} feedbackData
 * @param {string} feedbackData.name
 * @param {string} feedbackData.email
 * @param {string} feedbackData.message
 * @returns {Promise<Object>}
 */
export async function submitFeedback({ name, email, message }) {
  return communicationRepository.insertFeedback({ name, email, message });
}
