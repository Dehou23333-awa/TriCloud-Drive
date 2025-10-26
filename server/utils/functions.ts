export function placeholders(n: number) {
  return Array(n).fill('?').join(',')
}
export function uniqPositiveInts(arr: any[]): number[] {
  return [...new Set(
    (Array.isArray(arr) ? arr : [])
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
  )]
}