const ApiError = require("../api-error");

function validateContact(payload, { create = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return new ApiError(400, "Contact data must be a JSON object");
  }

  if (create && payload.name === undefined) {
    return new ApiError(400, "Name can not be empty");
  }

  for (const field of ["name", "email", "address", "phone"]) {
    if (Object.hasOwn(payload, field) && typeof payload[field] !== "string") {
      return new ApiError(400, `${field} must be a string`);
    }
  }

  if (typeof payload.name === "string" && payload.name.trim().length === 0) {
    return new ApiError(400, "Name can not be empty");
  }

  if (
    Object.hasOwn(payload, "favorite") &&
    typeof payload.favorite !== "boolean"
  ) {
    return new ApiError(400, "favorite must be a boolean");
  }

  return null;
}

module.exports = validateContact;
