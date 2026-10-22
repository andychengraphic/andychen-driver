// Free, keyless map services: Photon (OpenStreetMap address search), OSRM (driving route)
// and Open-Meteo (rain forecast). Address search only covers Southern California, ranked
// nearest San Diego first.
const NEAR = { lat: 32.85, lon: -117.1 }
// Southern California: from the Mexican border up to about San Luis Obispo and Kern counties,
// and east to the Arizona line. The box clips Tijuana and Arizona edges, which the state check removes.
const SOCAL_BBOX = '-121.0,32.5,-114.1,35.8' // west, south, east, north

// Photon speaks HTTP/1.1 from Europe: opening a connection costs ~0.5 s, a lookup on an open one
// ~0.2 s. So connections are opened early (warm) and never cancelled mid-request (cancelling
// closes the socket); stale answers are simply ignored by the caller. Answers are cached.
const cache = new Map()
let warmedAt = 0

// Opens connections to the search and routing servers ahead of the first real request.
export function warmUp() {
  if (Date.now() - warmedAt < 20000) return
  warmedAt = Date.now()
  const quiet = () => {}
  fetch(`https://photon.komoot.io/api/?q=san+diego&limit=1&bbox=${SOCAL_BBOX}`, { cache: 'no-store' }).catch(quiet)
  fetch('https://router.project-osrm.org/nearest/v1/driving/-117.1,32.85', { cache: 'no-store' }).catch(quiet)
}

// Instant guesses from earlier answers: places from a shorter query that still match every word.
export function cachedGuess(q) {
  const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean)
  for (let n = q.length - 1; n >= 3; n--) {
    const prev = cache.get(q.slice(0, n).toLowerCase())
    if (prev) return prev.filter((p) => words.every((w) => p.label.toLowerCase().includes(w)))
  }
  return []
}

// OpenStreetMap often has the street but not its house numbers (e.g. much of Poway), so when a
// query starts with a house number the US Census geocoder is asked too. It has every US address
// range but no CORS support, so it's called through JSONP (a script tag with a callback).
const BOX = { west: -121.0, south: 32.5, east: -114.1, north: 35.8 }
let jsonpId = 0
function jsonp(url, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const name = `__census${++jsonpId}`
    const script = document.createElement('script')
    const done = () => { delete window[name]; script.remove(); clearTimeout(timer) }
    const timer = setTimeout(() => { done(); reject(new Error('timeout')) }, timeout)
    window[name] = (data) => { done(); resolve(data) }
    script.onerror = () => { done(); reject(new Error('failed')) }
    script.src = `${url}&format=jsonp&callback=${name}`
    document.head.append(script)
  })
}

// "17965 SAINT ANDREWS DR, POWAY, CA, 92064" -> "17965 Saint Andrews Dr, Poway, CA 92064"
const tidy = (a) => a.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/, Ca, (\d{5})$/, ', CA $1')

async function censusSearch(q) {
  if (!/^\d+\s+\S/.test(q)) return []
  const address = /\b(ca|california)\b/i.test(q) ? q : `${q}, CA`
  const data = await jsonp(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current`)
  return (data?.result?.addressMatches || [])
    .map((m) => ({ label: tidy(m.matchedAddress), lat: m.coordinates.y, lon: m.coordinates.x }))
    .filter((p) => p.lon >= BOX.west && p.lon <= BOX.east && p.lat >= BOX.south && p.lat <= BOX.north)
}

function label(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const first = p.name && p.name !== street ? p.name : street
  return [first, p.name && p.name !== street ? street : null, p.city].filter(Boolean).join(', ') // all results are in California
}

// Order: map results with the typed house number, then Census address matches, then the rest.
function merge(q, census, osm) {
  const number = q.match(/^\d+/)?.[0]
  const exactOsm = number ? osm.filter((p) => p.number === number) : []
  const seen = new Set()
  return [...exactOsm, ...census, ...osm]
    .filter((p) => !seen.has(p.label) && seen.add(p.label))
    .slice(0, 5)
}

// Both sources at once. Map results usually land first and are passed to onPartial straight away;
// the full list (with any Census matches) is returned when both are in.
export async function searchPlaces(q, onPartial) {
  const key = q.toLowerCase()
  if (cache.has(key)) return cache.get(key)
  let censusDone = false
  const census = censusSearch(q).catch(() => []).finally(() => { censusDone = true })
  const osm = photonSearch(q)
  osm.then((list) => { if (!censusDone) onPartial?.(merge(q, [], list)) }).catch(() => {})
  const places = merge(q, await census, await osm.catch(() => []))
  cache.set(key, places)
  return places
}

async function photonSearch(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${NEAR.lat}&lon=${NEAR.lon}&bbox=${SOCAL_BBOX}&limit=8&lang=en`
  const res = await fetch(url)
  if (!res.ok) throw new Error('search failed')
  const { features } = await res.json()
  const seen = new Set()
  return features
    .filter((f) => f.properties.state === 'California' && f.properties.countrycode === 'US')
    .map((f) => ({ label: label(f.properties), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], number: f.properties.housenumber }))
    .filter((p) => p.label && !seen.has(p.label) && seen.add(p.label))
    .slice(0, 5)
}

export async function route(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) }) // a stuck server shouldn't leave "Mapping your route…" up
  if (!res.ok) throw new Error('route failed')
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route')
  const r = data.routes[0]
  return { miles: r.distance / 1609.344, minutes: r.duration / 60 }
}

// Rain chance for the pickup hour. Forecasts only reach about two weeks out; returns null beyond.
export async function rainAt(place, date, time) {
  const days = (new Date(`${date}T12:00:00`) - new Date()) / 864e5
  if (days > 15 || days < -1) return null
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&hourly=precipitation_probability,precipitation&timezone=America%2FLos_Angeles&start_date=${date}&end_date=${date}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const { hourly } = await res.json()
  const i = hourly.time.indexOf(`${date}T${time.slice(0, 2)}:00`)
  if (i < 0) return null
  return { probability: hourly.precipitation_probability[i] ?? 0, precipitation: hourly.precipitation[i] ?? 0 }
}
