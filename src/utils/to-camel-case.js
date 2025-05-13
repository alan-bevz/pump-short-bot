export default function toCamelCase(str) {
  if (!str || typeof str !== 'string') return ''; // захист

  return str
    .toLowerCase()
    .split(/[-_ ]+/)
    .map((word, index) =>
      index === 0 ? word : word[0].toUpperCase() + word.slice(1)
    )
    .join('');
}