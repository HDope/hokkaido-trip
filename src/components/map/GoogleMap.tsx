import { useEffect, useRef, useState } from 'react'
import { HOKKAIDO_CENTER } from '../../lib/geo'
import { pinHtml, type MapViewProps } from './types'

// 구글 지도 (Maps JavaScript API) — 한국어 지명 표시
let loading: Promise<void> | null = null
let loadedKey = ''

declare global {
  interface Window {
    __hkGmapsReady?: () => void
    gm_authFailure?: () => void
  }
}

export function loadGoogleMaps(key: string, onAuthFailure: () => void): Promise<void> {
  window.gm_authFailure = onAuthFailure
  if (loading && loadedKey === key) return loading
  loadedKey = key
  loading = new Promise<void>((resolve, reject) => {
    window.__hkGmapsReady = () => resolve()
    const s = document.createElement('script')
    const qs = new URLSearchParams({ key, v: 'weekly', language: 'ko', region: 'JP', loading: 'async', callback: '__hkGmapsReady' })
    s.src = `https://maps.googleapis.com/maps/api/js?${qs}`
    s.async = true
    s.onerror = () => reject(new Error('구글 지도 스크립트를 불러오지 못했어요'))
    document.head.appendChild(s)
  })
  return loading
}

type Props = MapViewProps & { apiKey: string; onAuthFailure: () => void }

export function GoogleMap({ apiKey, onAuthFailure, markers, paths, fitKey, fitPadding, focus, onMarkerClick }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const overlays = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([])
  const advMarker = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  const [ready, setReady] = useState(false)
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey, onAuthFailure)
      .then(async () => {
        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary
        const { AdvancedMarkerElement } = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary
        if (cancelled || !el.current) return
        advMarker.current = AdvancedMarkerElement
        map.current = new Map(el.current, {
          center: HOKKAIDO_CENTER,
          zoom: 7,
          mapId: 'DEMO_MAP_ID',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: true,
        })
        setReady(true)
      })
      .catch(() => onAuthFailure())
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  useEffect(() => {
    const m = map.current
    const Adv = advMarker.current
    if (!ready || !m || !Adv) return
    for (const o of overlays.current) o.setMap(null)
    overlays.current = []
    for (const p of paths) {
      if (p.points.length < 2) continue
      const path = p.points.map(([lat, lng]) => ({ lat, lng }))
      if (!p.dim) overlays.current.push(new google.maps.Polyline({ map: m, path, strokeColor: '#ffffff', strokeWeight: 7, strokeOpacity: 0.9 }))
      overlays.current.push(
        new google.maps.Polyline({
          map: m,
          path,
          strokeColor: p.color,
          strokeWeight: p.dim ? 3 : 4,
          strokeOpacity: p.dashed ? 0 : p.dim ? 0.35 : 0.95,
          icons: p.dashed
            ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: p.color, scale: 3 }, offset: '0', repeat: '12px' }]
            : undefined,
        }),
      )
    }
    for (const mk of markers) {
      const content = document.createElement('div')
      content.innerHTML = pinHtml(mk)
      const marker = new Adv({ map: m, position: mk.position, content, title: mk.title, zIndex: mk.dim ? 1 : 10 })
      marker.addListener('click', () => clickRef.current?.(mk.id))
      overlays.current.push({ setMap: (x) => (marker.map = x) })
    }
  }, [ready, markers, paths])

  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    const b = new google.maps.LatLngBounds()
    let n = 0
    for (const x of markers) if (!x.dim) (b.extend(x.position), n++)
    for (const p of paths) if (!p.dim) for (const [lat, lng] of p.points) (b.extend({ lat, lng }), n++)
    if (n === 1) {
      m.setCenter(b.getCenter())
      m.setZoom(12)
    } else if (n > 1) {
      const box = el.current
      m.fitBounds(b, Math.min(fitPadding ?? 48, (box?.clientWidth ?? 600) * 0.18, (box?.clientHeight ?? 600) * 0.18))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey])

  useEffect(() => {
    const m = map.current
    if (!ready || !m || !focus) return
    m.panTo(focus.position)
    if ((m.getZoom() ?? 0) < 13) m.setZoom(13)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus?.key])

  return <div ref={el} className="h-full w-full" />
}
