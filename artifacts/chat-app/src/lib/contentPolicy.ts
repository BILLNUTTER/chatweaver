const phoneNumberPattern = /(?:\+?\d[\d\s().-]{5,}\d)/g;

export function containsPhoneNumber(content: string): boolean {
  return [...content.matchAll(phoneNumberPattern)]
    .some(match => match[0].replace(/\D/g, "").length >= 7);
}

export const blockedMessageError = "Not Sent: this message data is not allowed in this app.";