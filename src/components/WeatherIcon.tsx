import type { WeatherKind } from '../lib/weather'

/*
 * Multicolour weather glyphs in the spirit of Apple Weather: a warm sun, soft clouds, blue rain.
 * Drawn on a 32×32 grid; colours come from --wx-* tokens so light and dark themes both read well.
 */
const CLOUD = 'M9.5 25.5h14a5.5 5.5 0 0 0 .7-10.96A7.6 7.6 0 0 0 9.9 15.6a5 5 0 0 0-.4 9.9z'

function Sun({ cx = 16, cy = 16, r = 6.2, rays = true }: { cx?: number; cy?: number; r?: number; rays?: boolean }) {
  const lines = rays ? Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4
    const inner = r + 2.4, outer = r + 4.8
    return <line key={i} x1={cx + Math.cos(angle) * inner} y1={cy + Math.sin(angle) * inner} x2={cx + Math.cos(angle) * outer} y2={cy + Math.sin(angle) * outer} />
  }) : null
  return <g className="wx-sun"><g className="wx-rays">{lines}</g><circle cx={cx} cy={cy} r={r} /></g>
}

function Cloud({ x = 0, y = 0, scale = 1, back = false }: { x?: number; y?: number; scale?: number; back?: boolean }) {
  return <path className={back ? 'wx-cloud-back' : 'wx-cloud'} d={CLOUD} transform={`translate(${x} ${y}) scale(${scale})`} />
}

function Drops({ count = 3, short = false }: { count?: number; short?: boolean }) {
  const xs = count === 2 ? [13, 19] : [11, 16, 21]
  return <g className="wx-rain">{xs.map(x => <line key={x} x1={x} y1={short ? 25.5 : 25} x2={x - 1.6} y2={short ? 28 : 30} />)}</g>
}

export function WeatherIcon({ kind, size = 32, title }: { kind: WeatherKind; size?: number; title?: string }) {
  const lifted = { x: 0, y: -4 }
  let art
  switch (kind) {
    case 'sun': art = <Sun />; break
    case 'mostly-sunny': art = <><Sun cx={13} cy={13} r={6} /><Cloud x={10} y={11.5} scale={0.62} /></>; break
    case 'partly-cloudy': art = <><Sun cx={12} cy={11} r={5.2} /><Cloud x={2.5} y={1.5} scale={0.95} /></>; break
    case 'cloudy': art = <><Cloud x={7} y={-5} scale={0.75} back /><Cloud x={-1} y={0} /></>; break
    case 'fog': art = <><Cloud x={0} y={-6} /><g className="wx-fog"><line x1="7" y1="24" x2="25" y2="24" /><line x1="9" y1="28" x2="23" y2="28" /></g></>; break
    case 'drizzle': art = <><Cloud {...lifted} /><Drops count={2} short /></>; break
    case 'rain': art = <><Cloud {...lifted} /><Drops /></>; break
    case 'showers': art = <><Sun cx={11} cy={9} r={4.6} rays={false} /><Cloud {...lifted} /><Drops count={2} /></>; break
    case 'sleet': art = <><Cloud {...lifted} /><g className="wx-rain"><line x1="12" y1="25" x2="10.6" y2="29" /></g><g className="wx-snow"><circle cx="17" cy="27" r="1.3" /><circle cx="22" cy="26" r="1.3" /></g></>; break
    case 'snow': art = <><Cloud {...lifted} /><g className="wx-snow"><circle cx="11" cy="26" r="1.4" /><circle cx="16.5" cy="28.5" r="1.4" /><circle cx="21.5" cy="26" r="1.4" /></g></>; break
    case 'thunder': art = <><Cloud {...lifted} back /><path className="wx-bolt" d="M17.5 19.5l-4.5 6.5h3.4l-1.6 5 5.2-7h-3.5l1.6-4.5z" /></>; break
  }
  return <svg className={`weather-icon wx-kind-${kind}`} data-kind={kind} width={size} height={size} viewBox="0 0 32 32" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">{art}</svg>
}
