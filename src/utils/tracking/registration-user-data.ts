/**
 * Build the input object passed to `prepareUserData` for a CompleteRegistration
 * CAPI event. Includes `state` and `birthdate` so the resulting `user_data`
 * carries hashed `st` and `db` whenever the user has those fields populated.
 *
 * Pure: no I/O, no module side effects. Safe to import from tests.
 */
export function userDataForRegistration(u: {
  email: string;
  mobile?: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  birthdate?: string | Date;
  _id: { toString(): string };
}) {
  return {
    email: u.email,
    phone: u.mobile,
    firstName: u.firstName,
    lastName: u.lastName,
    state: u.state,
    birthdate: u.birthdate,
    externalId: u._id.toString(),
  };
}
