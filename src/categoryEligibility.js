export function hasBirthYearRange(category) {
  return category.birthYearStart != null && category.birthYearStart !== '' || category.birthYearEnd != null && category.birthYearEnd !== '';
}
export function birthYearFromDate(birth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null;
  const date = new Date(birth + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === birth ? Number(birth.slice(0,4)) : null;
}
export function categoryAcceptsBirth(category, birth) {
  if (!hasBirthYearRange(category)) return true;
  const year = birthYearFromDate(birth);
  const start = Number(category.birthYearStart), end = Number(category.birthYearEnd);
  return year !== null && Number.isInteger(start) && Number.isInteger(end) && year >= start && year <= end;
}
