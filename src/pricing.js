// Fare model. Every number a customer pays comes from this file, so rates can be tuned here
// without touching the page. All times are San Diego (Pacific) wall-clock time.

// Every dollar amount is divided by this (prices were cut to a third). Set it to 1 to go back
// to the full rates written below.
const DIVIDE = 3

export const RATES = {
  base: 15 / DIVIDE, // flat fee per ride
  perMile: 2.5 / DIVIDE,
  perMinute: 0.5 / DIVIDE,
  minimum: 45 / DIVIDE, // no ride is quoted below this
  airportFee: 5, // added when pickup or drop-off is at SAN (a set amount, not divided)
  // Getting to a far pickup costs time too, like rideshare "long pickup" fees.
  homeBase: { lat: 32.9628, lon: -117.0359, name: 'Poway' },
  freePickupMiles: 15,
  pickupPerMile: 1.25 / DIVIDE,
  // Long one-way trips mean driving back empty; part of that return is charged.
  returnAfterMiles: 30,
  returnPerMile: 1.0 / DIVIDE,
  maxMultiplier: 2.5, // demand factors stack, but never past this
}

const AIRPORT = { lat: 32.7338, lon: -117.1933, radiusKm: 1.6 }
export const nearAirport = (p) => !!p && kmBetween(AIRPORT, p) < AIRPORT.radiusKm

// Places where demand spikes when crowds leave. Only applies in the evening.
const VENUES = [
  { name: 'Petco Park', lat: 32.7073, lon: -117.1566 },
  { name: 'Snapdragon Stadium', lat: 32.7831, lon: -117.1196 },
  { name: 'Pechanga Arena', lat: 32.7553, lon: -117.2119 },
  { name: 'Rady Shell', lat: 32.7058, lon: -117.1631 },
  { name: 'Convention Center', lat: 32.7066, lon: -117.1617 },
  { name: 'Del Mar Fairgrounds', lat: 32.9746, lon: -117.2611 },
]

// Local events with their own dates. Comic-Con moves each year: check and update these.
// 2027 dates are from the 2026 Quick Guide, with preview night on July 21.
const EVENTS = [
  { label: 'Comic-Con week', from: '2026-07-23', to: '2026-07-26', factor: 1.3 },
  { label: 'Comic-Con week', from: '2027-07-21', to: '2027-07-25', factor: 1.3 },
]

const toRad = (d) => (d * Math.PI) / 180
export function kmBetween(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
const KM_PER_MILE = 1.609344

// nth weekday of a month (n = -1 for the last one). weekday: 0 = Sunday.
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  }
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month, days)).getUTCDay()
  return days - ((last - weekday + 7) % 7)
}

// Holiday and big-night demand for a given local date and hour.
function holidayFactor(y, m, d, hour) {
  const md = (mm, dd) => m === mm && d === dd
  const thanksgiving = nthWeekday(y, 10, 4, 4)
  const superBowl = nthWeekday(y, 1, 0, 2) // 2nd Sunday in February
  const memorial = nthWeekday(y, 4, 1, -1)
  const labor = nthWeekday(y, 8, 1, 1)
  const evening = hour >= 18

  if ((md(11, 31) && evening) || (md(0, 1) && hour < 4)) return [1.75, "New Year's Eve"]
  if (md(6, 4) && evening) return [1.4, 'Fourth of July']
  if (md(9, 31) && evening) return [1.35, 'Halloween night']
  if (m === 10 && d === thanksgiving - 1 && evening) return [1.35, 'Thanksgiving Eve']
  if (md(2, 17) && evening) return [1.3, "St. Patrick's Day"]
  if (m === 1 && d === superBowl && hour >= 15) return [1.3, 'Super Bowl Sunday']
  if (md(11, 24) || md(11, 25)) return [1.25, 'Christmas']
  if (m === 10 && (d === thanksgiving || d === thanksgiving + 3)) return [1.2, 'Thanksgiving travel']
  if ((m === 4 && d >= memorial - 3 && d <= memorial) || (m === 8 && d >= labor - 3 && d <= labor)) return [1.15, 'Holiday weekend']
  return null
}

// Time-of-day and day-of-week demand. Only the strongest one counts.
function timeFactor(dow, hour, minute) {
  const t = hour + minute / 60
  const weekday = dow >= 1 && dow <= 5
  // Fri/Sat nights roll past midnight, so early Sat/Sun counts as the night before.
  if ((dow === 6 || dow === 0) && t < 3) return [1.45, 'Weekend bar close']
  if ((dow === 5 || dow === 6) && t >= 21) return [1.3, 'Weekend night']
  if (weekday && t >= 15.5 && t < 18.5) return [1.3, 'Evening rush hour']
  if (weekday && t >= 6.5 && t < 9.5) return [1.25, 'Morning rush hour']
  if (t >= 23 || t < 5) return [1.15, 'Late night']
  if (dow === 0 && t >= 15 && t < 20) return [1.1, 'Sunday return travel']
  if (t >= 5 && t < 6.5) return [1.1, 'Early morning']
  return null
}

// Short notice costs more (fewer drivers free), booking well ahead costs less.
function leadFactor(hoursAhead) {
  if (hoursAhead < 2) return [1.3, 'Short notice (under 2 hours)']
  if (hoursAhead < 12) return [1.15, 'Same-day booking']
  if (hoursAhead < 24) return [1.05, 'Booked under a day ahead']
  if (hoursAhead >= 24 * 7) return [0.95, 'Booked a week or more ahead']
  return null
}

function weatherFactor(weather) {
  if (!weather) return null
  const { probability, precipitation } = weather
  if (probability >= 60 || precipitation >= 1) return [1.2, 'Rain forecast']
  if (probability >= 35 || precipitation > 0.2) return [1.1, 'Chance of rain']
  return null
}

// Converts a Pacific wall-clock date and time ("2026-10-21", "18:30") to a real instant.
export function pacificInstant(date, time) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(guess)).map((p) => [p.type, +p.value]),
  )
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return new Date(guess + (guess - shown))
}

/**
 * Builds a quote.
 * trip: { miles, minutes, origin: {lat, lon}, destination: {lat, lon} }
 * when: { date: 'YYYY-MM-DD', time: 'HH:MM' } in Pacific time
 * weather: { probability, precipitation } for that hour, or null
 * Returns { total, lines: [{ label, amount }], factors: [{ label, factor }], multiplier }
 */
export function quote(trip, when, weather = null, now = new Date()) {
  const r = RATES
  const lines = [
    { label: 'Base fare', amount: r.base },
    { label: `Distance, ${trip.miles.toFixed(1)} mi`, amount: trip.miles * r.perMile },
    { label: `Time, ${Math.round(trip.minutes)} min`, amount: trip.minutes * r.perMinute },
  ]

  const pickupMiles = kmBetween(r.homeBase, trip.origin) / KM_PER_MILE
  if (pickupMiles > r.freePickupMiles)
    lines.push({ label: 'Long-distance pickup', amount: (pickupMiles - r.freePickupMiles) * r.pickupPerMile })
  if (trip.miles > r.returnAfterMiles)
    lines.push({ label: 'Return trip (long ride)', amount: (trip.miles - r.returnAfterMiles) * r.returnPerMile })

  const [y, mo, d] = when.date.split('-').map(Number)
  const [hour, minute] = when.time.split(':').map(Number)
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const hoursAhead = (pacificInstant(when.date, when.time) - now) / 36e5

  const nearVenue = VENUES.find((v) => kmBetween(v, trip.origin) < 0.8)
  const atAirport = [trip.origin, trip.destination].some(nearAirport)
  const event = EVENTS.find((e) => when.date >= e.from && when.date <= e.to)

  const factors = [
    timeFactor(dow, hour, minute),
    holidayFactor(y, mo - 1, d, hour),
    event && [event.factor, event.label],
    nearVenue && hour >= 17 && [1.15, `Event pickup near ${nearVenue.name}`],
    atAirport && [1.1, 'Airport demand'],
    weatherFactor(weather),
    leadFactor(hoursAhead),
  ].filter(Boolean).map(([factor, label]) => ({ factor, label }))

  const raw = factors.reduce((m, f) => m * f.factor, 1)
  const multiplier = Math.min(raw, r.maxMultiplier)
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  let total = subtotal * multiplier
  const demand = total - subtotal
  if (atAirport) total += r.airportFee
  const minimumApplied = total < r.minimum
  total = Math.max(total, r.minimum)

  return {
    lines,
    factors,
    multiplier,
    capped: raw > r.maxMultiplier,
    demand,
    airportFee: atAirport ? r.airportFee : 0,
    minimumApplied,
    total: Math.round(total),
    hoursAhead,
  }
}
