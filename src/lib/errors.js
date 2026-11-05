// Turns a Supabase / Postgres error into a sentence a user can act on.
// Messages we raise ourselves in SQL (overpayment, not enough stock, ...) are
// already readable and are passed through unchanged.
export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return "";
  const message = typeof error === "string" ? error : error.message || "";
  const code = typeof error === "object" ? error.code : undefined;

  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "You do not have permission to do this.";
  }
  if (code === "23503") {
    return "This record is used elsewhere (invoices, tickets, ...) and cannot be deleted. Deactivate or terminate it instead.";
  }
  if (code === "23505") {
    return "A record with the same unique value (name, code, phone, serial number, ...) already exists.";
  }
  if (code === "23514") {
    return "One of the values is not allowed. Please check the form.";
  }
  if (code === "23502") {
    return "A required field is missing.";
  }
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return "Cannot reach the server. Check your internet connection.";
  }
  return message || fallback;
}
