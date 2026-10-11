import { useEffect, useRef } from 'react'

/** 将课表高度限制在首屏剩余空间；只测量布局，不改变全局缩放或应用字号。 */
export function useCduTimetableFit(rows: number, columns: number) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const scroller = element.closest('main')
    let frame = 0
    let previousHeight = 0
    const measure = (): void => {
      const top = element.getBoundingClientRect().top + (scroller?.scrollTop || 0)
      const minimum = Math.min(320, 32 + rows * 26)
      const height = Math.max(minimum, Math.min(32 + rows * 42, Math.floor(window.innerHeight - top - 20)))
      if (Math.abs(height - previousHeight) < 1) return
      previousHeight = height
      element.style.setProperty('--cdu-timetable-height', `${height}px`)
    }
    const schedule = (): void => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    // 顶部账户/导入面板展开时，祖先高度会变化，需要重新计算剩余空间。
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      observer.observe(parent)
      if (parent === scroller) break
    }
    window.addEventListener('resize', schedule)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame) }
  }, [rows, columns])
  return ref
}
