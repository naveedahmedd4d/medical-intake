import { GeneralError } from '../error';
import { STATUS_CODES } from '../utils/constants';

// eslint-disable-next-line no-unused-vars
const handleErrors = (err, req, res, next) => {
  if (err instanceof GeneralError) {
    return res.status(err.getCode()).json({
      status: 'error',
      message: err.message,
      data: err.data,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      status: 'error',
      message: err.message,
    });
  }

  if (err?.original?.code === STATUS_CODES.FOREIGN_KEY_VIOLATION) {
    const constraintMessage = err?.original?.constraint || 'Foreign key constraint violation';
    return res.status(STATUS_CODES.NOTFOUND).json({
      status: 'error',
      message: constraintMessage,
    });
  }

  if (err?.original?.code === STATUS_CODES.UNIQUE_KEY_VIOLATION) {
    const uniqueMessage = err?.errors?.[0]?.message || 'Unique constraint violation';
    return res.status(STATUS_CODES.INVALID_INPUT).json({
      status: 'error',
      message: uniqueMessage,
    });
  }

  return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
};

export default handleErrors;
