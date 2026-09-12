import validator from 'validator';
import * as communicationService from './service.js';

/**
 * Controller for submitting user feedback.
 * Handles validation, business delegation, and HTTP response mapping.
 */
export async function handleFeedbackSubmit(req, res) {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (name.length > 100 || email.length > 255 || message.length > 5000) {
    return res.status(400).json({ message: 'Input too long' });
  }
  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  try {
    await communicationService.submitFeedback({ name, email, message });
    return res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
}
