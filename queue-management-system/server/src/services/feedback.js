const prisma = require('../db');
const ApiError = require('../lib/ApiError');

const MAX_COMMENT_LENGTH = 500;
const RATING_LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };

// The one place feedback is validated and saved, so the web page and the USSD
// menu follow exactly the same rules.
//   - rating: whole number 1-5
//   - comment: optional text, up to 500 characters
//   - only for a completed visit, and only once per ticket
// Throws ApiError with a message that is safe to show to the patient.
async function submitFeedback({ ticketNumber, rating, comment, channel }) {
  const number = Number(ticketNumber);
  if (!Number.isInteger(number)) throw new ApiError(400, 'ticketNumber must be an integer');

  const stars = Number(rating);
  if (rating === '' || rating == null || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new ApiError(400, 'rating must be a whole number from 1 to 5');
  }

  let text = null;
  if (comment != null && comment !== '') {
    if (typeof comment !== 'string') throw new ApiError(400, 'comment must be text');
    text = comment.trim() || null;
    if (text && text.length > MAX_COMMENT_LENGTH) {
      throw new ApiError(400, `comment must be at most ${MAX_COMMENT_LENGTH} characters`);
    }
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber: number },
    include: { feedback: true },
  });
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  if (ticket.status !== 'completed') {
    throw new ApiError(409, 'Feedback can be given once your visit is complete');
  }
  if (ticket.feedback) throw new ApiError(409, 'Feedback has already been received for this ticket');

  try {
    return await prisma.feedback.create({
      data: { ticketNumber: number, rating: stars, comment: text, channel },
    });
  } catch (err) {
    // Two submissions at the same moment: the database's unique rule wins.
    if (err.code === 'P2002') throw new ApiError(409, 'Feedback has already been received for this ticket');
    throw err;
  }
}

module.exports = { submitFeedback, MAX_COMMENT_LENGTH, RATING_LABELS };