import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { HOKKAIDO_CENTER } from '../../lib/geo'
import { pinHtml, pinSize, type MapViewProps } from './types'

// API 키가 없을 때의 지도 (OpenStreetMap 타일)
export function LeafletMap({ markers, paths, fitKey, fitPadding, focus, onMarkerClick }: MapViewProps) {
  const refit = useRef<((animate?: boolean) => void) | undefined>(undefined)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, zoomSnap: 0.25 }).setView([HOKKAIDO_CENTER.lat, HOKKAIDO_CENTER.lng], 7)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    let fitted = m.getSize()
    let timer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      m.invalidateSize(false)
      // 패널 크기가 크게 바뀌면 처음 맞춘 범위가 어긋나므로, 크기 변경이 끝난 뒤 다시 맞춘다
      clearTimeout(timer)
      timer = setTimeout(() => {
        const now = m.getSize()
        if (Math.abs(now.x - fitted.x) > 40 || Math.abs(now.y - fitted.y) > 40) {
          refit.current?.(false)
          fitted = now
        }
      }, 150)
    })
    ro.observe(el.current)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    for (const p of paths) {
      if (p.points.length < 2) continue
      if (!p.dim) L.polyline(p.points, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(g)
      L.polyline(p.points, {
        color: p.color,
        weight: p.dim ? 3 : 4,
        opacity: p.dim ? 0.35 : 0.95,
        dashArray: p.dashed ? '6 8' : undefined,
      }).addTo(g)
    }
    for (const mk of [...markers].sort((a, b) => Number(!a.dim) - Number(!b.dim))) {
      const size = pinSize(mk)
      const icon = L.divIcon({ html: pinHtml(mk), className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
      L.marker([mk.position.lat, mk.position.lng], { icon, title: mk.title, zIndexOffset: mk.dim ? 0 : 1000 })
        .on('click', () => clickRef.current?.(mk.id))
        .addTo(g)
    }
  }, [markers, paths])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const pts: [number, number][] = [
      ...markers.filter((x) => !x.dim).map((x) => [x.position.lat, x.position.lng] as [number, number]),
      ...paths.filter((p) => !p.dim).flatMap((p) => p.points),
    ]
    refit.current = (animate = true) => {
      // 지도가 좁을 때 여백이 화면을 다 먹어 지나치게 축소되지 않도록 크기에 비례해 제한
      const size = m.getSize()
      const pad = Math.min(fitPadding ?? 40, size.x * 0.18, size.y * 0.18)
      if (pts.length === 1) m.setView(pts[0], 12, { animate })
      else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [pad, pad], maxZoom: 14, animate })
    }
    refit.current()
    // fitKey 가 바뀔 때만 다시 맞춘다 (경로가 하나씩 들어올 때마다 화면이 튀지 않도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.position.lat, focus.position.lng], Math.max(map.current.getZoom(), 13))
  }, [focus?.key])

  return <div ref={el} className="h-full w-full" />
}
