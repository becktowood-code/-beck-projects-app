// Use the current payment method when rendering both new and saved invoices.
// Saved documents retain their original company snapshots and audit history.
export function paymentInstructions() {
  return "Zelle: paybeckprojects";
}
export function hasZelleQr() {
  return true;
}
// Viewport around the QR in the original 933 x 1269 supplied image, including
// its white quiet zone. The original image bytes are never changed.
export const ZELLE_QR_VIEW = { x: 239, y: 749, size: 456, width: 933, height: 1269 };
