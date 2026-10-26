import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, Check, Minus, MonitorCheck, Plus } from 'lucide-react'
import type { Recipe } from '../lib/types'
import { isRecipeImage, safeRecipeUrl } from '../lib/others'
import { isCuisineLabel, recipeContent, recipeIngredientLines, recipeMethodSteps, recipeSummary } from '../lib/recipeContent'
import { recipeStepTimers } from '../lib/recipeTimers'
import { Modal } from './Modal'
import { RecipeTimerDock, RecipeTimerStart } from './RecipeTimers'

function useCookingScreen() {
  const [awake, setAwake] = useState(false)
  useEffect(() => {
    if (!navigator.wakeLock) return
    let disposed = false, pending = false, lock: WakeLockSentinel | null = null
    const acquire = async () => {
      if (disposed || pending || (lock && !lock.released) || document.visibilityState !== 'visible') return
      pending = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (disposed) { await next.release(); return }
        lock = next; setAwake(true)
        next.addEventListener('release', () => { if (!disposed) setAwake(false) })
      } catch { /* Reading and timers work even when the browser cannot keep the screen awake. */ }
      finally { pending = false }
    }
    void acquire(); document.addEventListener('visibilitychange', acquire)
    return () => { disposed = true; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => {}) }
  }, [])
  return awake
}

export function RecipeReader({ recipe, footer, error, onClose }: { recipe: Recipe; footer: ReactNode; error?: string | null; onClose: () => void }) {
  const [ingredientsDone, setIngredientsDone] = useState<number[]>([])
  const [stepsDone, setStepsDone] = useState<number[]>([])
  const [fontSize, setFontSize] = useState(() => window.matchMedia('(max-width: 699px), (pointer: coarse) and (max-height: 599px)').matches ? 18 : 20)
  const awake = useCookingScreen()
  const ingredientPane = useRef<HTMLElement>(null), methodPane = useRef<HTMLElement>(null)
  const content = recipeContent(recipe), ingredients = recipeIngredientLines(content.ingredients), steps = recipeMethodSteps(content.method)
  const stepTimers = steps.map(recipeStepTimers)
  const current = steps.findIndex((_, index) => !stepsDone.includes(index))
  const link = safeRecipeUrl(recipe.url)
  const hasImage = !!recipe.image && isRecipeImage(recipe.image)
  const toggle = (current: number[], index: number) => current.includes(index) ? current.filter(value => value !== index) : [...current, index]
  return <Modal className={`recipe-reader${hasImage ? ' recipe-reader-has-image' : ''}`} phoneFullscreen focusForm={false} title={recipe.title} subtitle="Matlagning" onClose={onClose} footer={<><RecipeTimerDock /><div className="recipe-reader-actions">{footer}</div></>} error={error}>
    {hasImage && <figure className="recipe-reader-hero"><img src={recipe.image} alt={`Bild till ${recipe.title}`} /></figure>}
    <div className="recipe-reader-info">
      {hasImage && <img className="recipe-reader-image" src={recipe.image} alt={`Bild till ${recipe.title}`} />}
      <div className="recipe-reader-meta"><div className="recipe-summary" aria-label="Recept i korthet">{recipeSummary(content.notes).map(value => <span key={value}>{value}</span>)}</div>
        <div className="recipe-detail-labels">{recipe.labels.filter(isCuisineLabel).map(label => <span className="label-chip recipe-cuisine-chip" key={label}>{label}</span>)}{awake && <span className="recipe-screen-awake"><MonitorCheck size={15} aria-hidden="true" />Skärm vaken</span>}</div>
      </div>
      <div className="recipe-reading-tools" role="group" aria-label="Textstorlek"><button className="icon-button" type="button" aria-label="Minska textstorlek" disabled={fontSize <= 16} onClick={() => setFontSize(size => Math.max(16, size - 2))}><Minus size={18} /></button><span aria-hidden="true">Aa</span><button className="icon-button" type="button" aria-label="Öka textstorlek" disabled={fontSize >= 28} onClick={() => setFontSize(size => Math.min(28, size + 2))}><Plus size={18} /></button></div>
    </div>
    <nav className="recipe-reader-jump" aria-label="Läs receptet"><button type="button" onClick={() => ingredientPane.current?.scrollIntoView({ block: 'start' })}>Ingredienser</button><button type="button" onClick={() => methodPane.current?.scrollIntoView({ block: 'start' })}>Gör så här</button></nav>
    <div className="recipe-content-sections" style={{ '--recipe-font-size': `${fontSize}px` } as CSSProperties}>
      <section ref={ingredientPane} className="recipe-content-box" aria-labelledby="recipe-ingredients-heading"><div className="recipe-pane-heading"><h3 id="recipe-ingredients-heading">Ingredienser</h3><span>{ingredientsDone.length} av {ingredients.length}</span></div>
        <div className="recipe-pane-body" tabIndex={0} role="region" aria-label="Ingredienslista">{ingredients.length ? <ul className="recipe-ingredient-list">{ingredients.map((line, index) => <li key={index}><label><input type="checkbox" checked={ingredientsDone.includes(index)} onChange={() => setIngredientsDone(value => toggle(value, index))} /><span>{line}</span></label></li>)}</ul> : <p className="others-help">Inga ingredienser tillagda.</p>}
          {(content.notes || link) && <details className="recipe-reader-extra"><summary>Övrigt och inspiration</summary>{content.notes && <p className="recipe-notes">{content.notes}</p>}{link && <a className="recipe-inspiration" href={link} target="_blank" rel="noopener noreferrer"><span>Inspiration</span><span>{new URL(link).hostname.replace(/^www\./, '')}</span><ArrowUpRight size={14} /></a>}</details>}
        </div>
      </section>
      <section ref={methodPane} className="recipe-content-box" aria-labelledby="recipe-method-heading"><div className="recipe-pane-heading"><h3 id="recipe-method-heading">Gör så här</h3><span>{stepsDone.length} av {steps.length} steg klara</span></div>
        <div className="recipe-pane-body" tabIndex={0} role="region" aria-label="Tillagningssteg">{steps.length ? <ol className="recipe-method-list">{steps.map((step, index) => <li className={stepsDone.includes(index) ? 'is-complete' : index === current ? 'is-current' : ''} key={index}>
          <button className="recipe-step-check" type="button" aria-pressed={stepsDone.includes(index)} aria-label={`${stepsDone.includes(index) ? 'Återöppna' : 'Markera'} steg ${index + 1}${stepsDone.includes(index) ? '' : ' som klart'}`} onClick={() => setStepsDone(value => toggle(value, index))}>{stepsDone.includes(index) ? <Check size={20} /> : index + 1}</button>
          <div><p className="recipe-step-text">{step}</p>{stepTimers[index].length > 0 && <div className="recipe-step-timers">{stepTimers[index].map(option => <RecipeTimerStart key={option.seconds} recipe={recipe} step={index} {...option} />)}</div>}</div>
        </li>)}</ol> : <p className="others-help">Inga steg tillagda.</p>}</div>
      </section>
    </div>
  </Modal>
}
