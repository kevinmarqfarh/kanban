export interface StepTimerOption { seconds: number; label: string }

export function timerDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60
  return [hours && `${hours} h`, minutes && `${minutes} min`, rest && `${rest} s`].filter(Boolean).join(' ')
}
export function timerClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const parts = [Math.floor(seconds / 60), seconds % 60]
  if (seconds >= 3600) parts.splice(0, 1, Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60))
  return parts.map(value => String(value).padStart(2, '0')).join(':')
}

/** Only explicit durations in a method step; never infer a time from temperatures or ingredient amounts. */
export function recipeStepTimers(text: string): StepTimerOption[] {
  const number = '(?:\\d+(?:[.,]\\d+)?|½|en|ett)'
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${number})(?:\\s*[–—-]\\s*(${number}))?\\s*(timm(?:e|ar)|tim|h|min(?:ut(?:er)?)?|sek(?:und(?:er)?)?|s)\\b`, 'giu')
  const value = (raw: string) => raw === '½' ? .5 : /^(en|ett)$/iu.test(raw) ? 1 : Number(raw.replace(',', '.'))
  const matches = [...text.matchAll(pattern)].map(match => {
    const unit = /^(tim|h)/iu.test(match[4]) ? 3600 : /^min/iu.test(match[4]) ? 60 : 1
    return { start: match.index! + match[1].length, end: match.index! + match[0].length, unit, values: [value(match[2]), ...(match[3] ? [value(match[3])] : [])].map(n => Math.round(n * unit)) }
  })
  for (const match of text.matchAll(/(^|[^\p{L}\p{N}])(?:en\s+)?(halvtimme|kvart)\b/giu)) matches.push({ start: match.index! + match[1].length, end: match.index! + match[0].length, unit: 60, values: [match[2].toLocaleLowerCase('sv') === 'kvart' ? 900 : 1800] })
  matches.sort((a, b) => a.start - b.start)
  const seconds: number[] = []
  for (let index = 0; index < matches.length; index++) {
    const current = matches[index]
    let duration = current.values[0], last = current
    while (current.values.length === 1 && index + 1 < matches.length) {
      const next = matches[index + 1]
      if (next.values.length !== 1 || next.unit >= last.unit || !/^\s*(?:och\s*)?$/iu.test(text.slice(last.end, next.start))) break
      duration += next.values[0]; last = next; index++
    }
    seconds.push(duration, ...current.values.slice(1))
  }
  return [...new Set(seconds.filter(value => value >= 1 && value <= 86400))].map(seconds => ({ seconds, label: timerDuration(seconds) }))
}
