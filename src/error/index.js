/* eslint-disable max-classes-per-file */
class GeneralError extends Error {
  code = 200;

  constructor(message, code, data) {
    super();
    this.message = message;
    this.code = code;
    this.data = data;
  }

  getCode() {
    if (this instanceof BadRequest) {
      if (this.code) {
        return this.code;
      }
      return 400;
    }
    if (this instanceof NotFound) {
      return 404;
    }
    return 500;
  }
}

class BadRequest extends GeneralError {}
class NotFound extends GeneralError {}

module.exports = {
  GeneralError,
  BadRequest,
  NotFound,
};
