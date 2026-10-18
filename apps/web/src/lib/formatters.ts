export function formatDisplayDate(isoString?: string): string {
  if (!isoString) return '';
  const datePart = isoString.includes('T') ? isoString.split('T')[0] : isoString;
  const parts = datePart.split('-');
  if (parts.length !== 3) return isoString;
  
  const [year, month, day] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[parseInt(month, 10) - 1] || month;
  return `${parseInt(day, 10)} ${monthName} ${year}`;
}

export function formatDisplayDateTime(isoString?: string): string {
  if (!isoString) return '';
  const dateFormatted = formatDisplayDate(isoString);
  if (!isoString.includes('T')) return dateFormatted;
  
  const timePart = isoString.split('T')[1]?.replace('Z', '') || '';
  const timeChunks = timePart.split(':');
  if (timeChunks.length < 2) return dateFormatted;
  
  const hours = parseInt(timeChunks[0], 10);
  const minutes = timeChunks[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${dateFormatted}, ${displayHours}:${minutes} ${ampm}`;
}
