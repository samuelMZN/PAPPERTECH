const crypto = require("crypto");

function generateValidationToken() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = {
  generateValidationToken
};
