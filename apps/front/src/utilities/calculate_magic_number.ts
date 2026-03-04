/* eslint-disable no-useless-escape */
export default function calculateMagicNumber(currentValue: number, operators: string): number {
  // match [5-10]
  let match = operators.match(/^\[(\d+)-(\d+)\]$/);
  if (match) {
    const low = Math.min(parseInt(match[1]!), parseInt(match[2]!));
    const high = Math.max(parseInt(match[1]!), parseInt(match[2]!));
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  // match +[5-10], -[5-10], %+[5-10], %-[5-10]
  match = operators.match(/^(%*[+\-])\[(\d+)-(\d+)\]$/);
  if (match) {
    const low = Math.min(parseInt(match[2]!), parseInt(match[3]!));
    const high = Math.max(parseInt(match[2]!), parseInt(match[3]!));
    const randVal = Math.floor(Math.random() * (high - low + 1)) + low;

    switch (match[1]) {
      case "+": return Math.min(currentValue + randVal, 99);
      case "-": return Math.max(currentValue - randVal, 0);
      case "%+": return Math.min(currentValue + Math.ceil(currentValue * randVal / 100), 99);
      case "%-": return Math.max(currentValue - Math.ceil(currentValue * randVal / 100), 0);
    }
  }

  // match +5, %+5, -5, %-5, 5
  match = operators.match(/(%*[\\+,\-]*)([1-9]*\d)$/);
  if (match) {
    const num = parseInt(match[2]!);

    switch (match[1]) {
      case "+": return Math.min(currentValue + num, 99);
      case "-": return Math.max(currentValue - num, 0);
      case "%+": return Math.min(currentValue + Math.ceil(currentValue * num / 100), 99);
      case "%-": return Math.max(currentValue - Math.ceil(currentValue * num / 100), 0);
      default: return num;
    }
  }

  // fallback return unchanged value
  return currentValue;
}