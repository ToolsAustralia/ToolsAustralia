/**
 * Australian States and Territories Data
 * Used for user profile setup and location-based features
 */

export interface AustralianState {
  code: string;
  name: string;
}

export const AUSTRALIAN_STATES: AustralianState[] = [
  { code: "NSW", name: "New South Wales" },
  { code: "VIC", name: "Victoria" },
  { code: "QLD", name: "Queensland" },
  { code: "WA", name: "Western Australia" },
  { code: "SA", name: "South Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "ACT", name: "Australian Capital Territory" },
  { code: "NT", name: "Northern Territory" },
];

export const getStateByCode = (code: string): AustralianState | undefined => {
  return AUSTRALIAN_STATES.find((state) => state.code === code);
};

export const getStateByName = (name: string): AustralianState | undefined => {
  return AUSTRALIAN_STATES.find((state) => state.name === name);
};
