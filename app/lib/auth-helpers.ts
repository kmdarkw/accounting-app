export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function phoneToAuthEmail(phone: string) {
  const normalized = normalizePhone(phone);
  return `${normalized}@manager.local`;
}

export function phoneToManagerEmail(phone: string) {
  return phoneToAuthEmail(phone);
}

export function isLikelyPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.length >= 8;
}
