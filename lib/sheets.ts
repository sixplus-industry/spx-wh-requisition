export const DEFAULT_GOOGLE_SHEET_ID = '1YnTR2QSU3XOl8TTKhegorso6X4oPiWBzuB52zpQFFVc';
export const REQUEST_TRACKING_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_GOOGLE_SHEET_ID}/edit?gid=626660700#gid=626660700`;

export function getGoogleSheetId() {
  return process.env.GOOGLE_SHEET_ID || DEFAULT_GOOGLE_SHEET_ID;
}
