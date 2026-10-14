import { useEffect, useRef, useState } from 'react'
import type { NutritionTime } from '../lib/types'
import { currentNutritionTime } from '../lib/nutritionTime'
import { useNow } from './useNow'

/**
 * Which part of the day Dagens kost shows. Follows the clock (morning until 14:00), but a tap wins
 * until the clock moves on to the next part of the day.
 */
export function useNutritionTime(): [NutritionTime, (time: NutritionTime) => void] {
  const now = useNow()
  const auto = currentNutritionTime(now)
  const [chosen, setChosen] = useState<NutritionTime>(auto)
  const lastAuto = useRef(auto)
  useEffect(() => {
    if (lastAuto.current !== auto) { lastAuto.current = auto; setChosen(auto) }
  }, [auto])
  return [chosen, setChosen]
}
