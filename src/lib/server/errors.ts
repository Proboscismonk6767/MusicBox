/** Something the user can fix or should be told about (shown as-is). */
export class UserError extends Error {}
/** The user isn't allowed to do this. Logged as a security event, shown as-is. */
export class Forbidden extends UserError {}
