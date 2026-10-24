<script setup>
import { computed, reactive, ref, watch } from 'vue'
import PlaceInput from './components/PlaceInput.vue'
import FieldLabel from './components/FieldLabel.vue'
import TermsDialog, { TERMS_UPDATED } from './components/TermsDialog.vue'
import { nearAirport, pacificInstant, quote, RATES } from './pricing'
import { route, rainAt } from './geo'

// Booking requests are emailed through FormSubmit (formsubmit.co), which needs no server.
// This is FormSubmit's random alias for the booking inbox, so the real address isn't in the page.
const BOOKING_ALIAS = 'c39b1f0c7fd39f3924086bdca52a2e00'

// PHONE is written as customers should see it, e.g. '(619) 555-0123'.
const PHONE = '(224) 678-6881'
const PHONE_LINK = `tel:+1${PHONE.replace(/\D/g, '').slice(-10)}`

const pad = (n) => String(n).padStart(2, '0')
// The clock, refreshed every 30 seconds (and on send) so fares and "time has passed" checks stay current.
const now = ref(new Date())
setInterval(() => { now.value = new Date() }, 30000)
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

const form = reactive({
  roundTrip: false, date: '', time: '', returnDate: '', returnTime: '', passengers: 1, childSeats: 0, flight: '',
  bags: { small: 0, medium: 0, large: 0 }, name: '', phone: '', email: '', notes: '', payment: '', terms: false, honey: '',
})
const termsDialog = ref(null)
const BAGS = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]
const PAYMENTS = ['Credit Card', 'Cash', 'Zelle']
// Roughly what fits in a Model S (front and rear trunks), counting a large bag as 3 small ones.
const BAG_SPACE = { small: 1, medium: 2, large: 3 }
const BAG_ROOM = 10
const tooManyBags = computed(() => Object.entries(form.bags).reduce((n, [k, v]) => n + v * BAG_SPACE[k], 0) > BAG_ROOM)
const origin = ref(null)
const destination = ref(null)
// Asked only for airport rides, so arrivals and delays can be tracked.
const airportRide = computed(() => nearAirport(origin.value) || nearAirport(destination.value))
// Child seats count as passengers; the back seat takes 3 at most.
const maxChildSeats = computed(() => Math.min(form.passengers, 3))
watch(maxChildSeats, (max) => { if (form.childSeats > max) form.childSeats = max })

const trip = ref(null) // { miles, minutes }
const weather = ref(null)
const returnWeather = ref(null)
const routeError = ref('')
const routing = ref(false)

// Re-route whenever both ends are chosen. An answer for ends that have since changed is ignored.
watch([origin, destination], async ([a, b], _, onCleanup) => {
  let stale = false
  onCleanup(() => { stale = true })
  trip.value = null
  routeError.value = ''
  routing.value = false
  if (!a || !b) return
  routing.value = true
  try {
    const t = await route(a, b)
    if (!stale) trip.value = t
  } catch {
    if (!stale) routeError.value = "Couldn't map that route. Send the request anyway and I'll quote you directly."
  } finally {
    if (!stale) routing.value = false
  }
})

// Rain chance at pickup, when the date is close enough to forecast.
watch([origin, () => form.date, () => form.time], async ([a, date, time], _, onCleanup) => {
  let stale = false
  onCleanup(() => { stale = true })
  weather.value = null
  if (!a || !date || !time) return
  const w = await rainAt(a, date, time).catch(() => null)
  if (!stale) weather.value = w
})

// The return pickup defaults to the first pickup's day and follows it until changed, never earlier.
watch(() => form.date, (date, old) => {
  if (!form.returnDate || form.returnDate === old || form.returnDate < date) form.returnDate = date
})
// On the same day, the return pickup can't be before the first pickup.
const returnTimeMin = computed(() => (form.returnDate && form.returnDate === form.date ? form.time : undefined))
const returnTooEarly = computed(() => form.roundTrip && !!returnTimeMin.value && !!form.returnTime && form.returnTime < returnTimeMin.value)

// Rain chance at the return pickup (the drop-off point).
watch([() => form.roundTrip, destination, () => form.returnDate, () => form.returnTime], async ([round, b, date, time], _, onCleanup) => {
  let stale = false
  onCleanup(() => { stale = true })
  returnWeather.value = null
  if (!round || !b || !date || !time) return
  const w = await rainAt(b, date, time).catch(() => null)
  if (!stale) returnWeather.value = w
})

const outbound = computed(() => {
  if (!trip.value || !form.date || !form.time) return null
  return quote({ ...trip.value, origin: origin.value, destination: destination.value }, { date: form.date, time: form.time }, weather.value, now.value)
})
// The ride back is priced as its own ride from drop-off to pickup, at the return time.
const inbound = computed(() => {
  if (!form.roundTrip || !trip.value || !form.returnDate || !form.returnTime || returnTooEarly.value) return null
  return quote({ ...trip.value, origin: destination.value, destination: origin.value }, { date: form.returnDate, time: form.returnTime }, returnWeather.value, now.value)
})
const estimate = computed(() => (form.roundTrip && !inbound.value ? null : outbound.value))
const total = computed(() => estimate.value && estimate.value.total + (form.roundTrip ? inbound.value.total : 0))
const inPast = computed(() => outbound.value && outbound.value.hoursAhead < 0)

const money = (n) => `$${n.toFixed(2)}`
const formatDate = (date) => {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
const formatTime = (time) => {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
const prettyDate = computed(() => formatDate(form.date))
const prettyTime = computed(() => formatTime(form.time))
// Pickup times come from a list in 15-minute steps; on iPhone the list opens as a wheel.
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const value = `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`
  return { value, text: formatTime(value) }
})
const prettyReturn = computed(() => `${formatDate(form.returnDate)} at ${formatTime(form.returnTime)}`)

const fareBreakdown = (e) => [...e.lines.map((l) => `${l.label}: ${money(l.amount)}`),
  ...e.factors.map((f) => `${f.label}: ×${f.factor}`),
  e.capped ? `Demand capped at ×${RATES.maxMultiplier}` : null,
  e.airportFee ? `Airport fee: ${money(e.airportFee)}` : null,
  e.minimumApplied ? `Minimum fare applied: ${money(RATES.minimum)}` : null].filter(Boolean).join('\n')

const status = ref('idle') // idle | sending | sent | error
const errorText = ref('')
// A fixed problem shouldn't keep its message up.
watch([form, origin, destination], () => { if (status.value !== 'sending') errorText.value = '' }, { deep: true })

// The browser's own checks are turned off (novalidate); each required field's problem, in form order.
const problems = computed(() => {
  const p = {}
  if (!origin.value) p.from = 'Choose a pickup address from the suggestions.'
  if (!destination.value) p.to = 'Choose a drop-off address from the suggestions.'
  if (!form.date) p.date = 'Please add a pickup date.'
  else if (form.date < todayLocal()) p.date = "The pickup date can't be before today."
  if (!form.time) p.time = 'Please add a pickup time.'
  else if (form.date && pacificInstant(form.date, form.time) < now.value) p.time = 'That pickup time has already passed.'
  if (form.roundTrip) {
    if (!form.returnDate) p['return-date'] = 'Please add a return date.'
    else if (form.date && form.returnDate < form.date) p['return-date'] = "The return date can't be before the pickup date."
    if (!form.returnTime) p['return-time'] = 'Please add a return time.'
    else if (returnTooEarly.value) p['return-time'] = "The return time can't be before the pickup time."
  }
  if (!form.name.trim()) p.name = 'Please add your name.'
  if (!form.phone.trim()) p.phone = 'Please add a phone number.'
  else if (form.phone.replace(/\D/g, '').length < 10) p.phone = 'Please enter a full phone number, with area code.'
  if (!form.email.trim()) p.email = 'Please add your email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) p.email = 'Please enter a valid email address.'
  if (!form.payment) p.payment = 'Please choose a payment method.'
  if (!form.terms) p.terms = 'Please agree to the Terms of Service.'
  return p
})
// A field's problem shows once it has been left (touched) or a send was tried.
const touched = reactive({})
const attempted = ref(false)
const shown = (id) => (attempted.value || touched[id] ? problems.value[id] : '')
// Ties a field to its shown problem, so screen readers read the two together.
const invalid = (id) => (shown(id) ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {})
// The send button looks disabled until nothing is left to fix. It isn't truly disabled (a disabled
// button ignores taps), so a tap can still name the first field that needs attention.
const incomplete = computed(() => Object.keys(problems.value).length > 0)

// The automatic reply FormSubmit emails the customer: their request in plain words.
function customerCopy(e) {
  return [
    `Thanks, ${form.name}. I've got your ride request:`,
    `${prettyDate.value} at ${prettyTime.value}, from ${origin.value.label} to ${destination.value.label}.`,
    form.roundTrip && `Return pickup ${prettyReturn.value}, from ${destination.value.label}.`,
    `${form.passengers} passenger${form.passengers > 1 ? 's' : ''}${form.childSeats ? `, ${form.childSeats} child seat${form.childSeats > 1 ? 's' : ''} requested` : ''}. Paying by ${form.payment}.`,
    e ? `Estimated fare: $${total.value}. The final fare is confirmed before the ride.` : "I'll send you a quote.",
    "This isn't a confirmed booking yet. I'll confirm with you shortly by text or email.",
    PHONE && `Questions? Call or text ${PHONE}.`,
    'Andy Chen, Private Chauffeur',
  ].filter(Boolean).join('\n\n')
}

async function submit() {
  errorText.value = ''
  attempted.value = true
  now.value = new Date()
  const first = Object.values(problems.value)[0]
  if (first) { errorText.value = first; return }
  if (form.honey) return // filled in by a bot

  const e = estimate.value
  const breakdown = !e ? 'No estimate (route could not be mapped)'
    : form.roundTrip ? `Ride there ($${e.total})\n${fareBreakdown(e)}\n\nRide back ($${inbound.value.total})\n${fareBreakdown(inbound.value)}`
    : fareBreakdown(e)
  const maps = `https://www.google.com/maps/dir/?api=1&origin=${origin.value.lat},${origin.value.lon}&destination=${destination.value.lat},${destination.value.lon}`

  status.value = 'sending'
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${BOOKING_ALIAS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `${form.roundTrip ? 'Round trip' : 'Ride'} request: ${prettyDate.value}, ${prettyTime.value} (${form.name})`,
        _template: 'table',
        _captcha: 'false',
        _replyto: form.email,
        'Trip type': form.roundTrip ? 'Round trip' : 'One-way',
        Date: prettyDate.value,
        Time: prettyTime.value,
        Pickup: origin.value.label,
        'Drop-off': destination.value.label,
        'Return pickup': form.roundTrip ? `${prettyReturn.value}, from ${destination.value.label}` : 'None',
        Passengers: form.passengers,
        'Child seats': form.childSeats ? `${form.childSeats} requested` : 'None',
        ...(airportRide.value ? { Flight: form.flight.trim() || '(not given)' } : {}),
        Bags: `${form.bags.small} small, ${form.bags.medium} medium, ${form.bags.large} large`,
        Distance: trip.value ? `${trip.value.miles.toFixed(1)} mi, about ${Math.round(trip.value.minutes)} min` : 'Unknown',
        'Estimated fare': e ? `$${total.value}` : 'Not quoted',
        'Fare breakdown': breakdown,
        Name: form.name,
        Phone: form.phone,
        email: form.email, // lower-case: FormSubmit sends its automatic reply to the field named email
        Notes: form.notes || '(none)',
        'Payment method': form.payment,
        'Terms of Service': `Accepted (version of ${TERMS_UPDATED})`,
        Directions: maps,
        _autoresponse: customerCopy(e),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || 'Request failed')
    status.value = 'sent'
  } catch {
    status.value = 'error'
    errorText.value = `Your request didn't go through. Please try again in a few minutes${PHONE ? `, or call or text ${PHONE}` : ''}.`
  }
}

function reset() {
  Object.assign(form, { roundTrip: false, date: '', time: '', returnDate: '', returnTime: '', passengers: 1, childSeats: 0, flight: '', bags: { small: 0, medium: 0, large: 0 }, notes: '', terms: false })
  status.value = 'idle'
  attempted.value = false
  for (const id in touched) delete touched[id]
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-[1080px] flex-col px-5 sm:px-8">
    <header class="flex flex-wrap items-baseline justify-between gap-x-6 max-sm:flex-col max-sm:items-center max-sm:text-center gap-y-2 pt-8 pb-7 sm:pt-12 sm:pb-10">
      <p class="flex items-center gap-2 font-display text-[42px] leading-none font-normal tracking-[-0.02em] whitespace-nowrap">
        Andy Chen
        <!-- Car pictogram (ISO 7001 PI TF 008). -->
        <svg class="size-[1em] shrink-0" viewBox="0 0 150 150" fill="currentColor" aria-hidden="true"><path d="M39.97,23.28c-5.95,0-9.19,5.09-10.82,10.82l-7.22,25.45h-3.22c-4.67,0-8.42,3.76-8.42,8.42v30.88c0,4.67,3.75,8.42,8.42,8.42h2.9c-.07.98-.12,2.08-.12,3.25v5.46c0,4.1.49,7.41,1.09,7.41h12.63c.6,0,1.09-3.3,1.09-7.41v-5.46c0-1.17-.05-2.27-.12-3.25h77.63c-.07.98-.12,2.08-.12,3.25v5.46c0,4.1.49,7.41,1.09,7.41h12.63c.6,0,1.09-3.3,1.09-7.41v-5.46c0-1.17-.05-2.27-.12-3.25h2.9c4.67,0,8.42-3.76,8.42-8.42v-30.88c0-4.67-3.76-8.42-8.42-8.42h-3.22l-7.22-25.45c-1.63-5.73-4.87-10.82-10.82-10.82H39.97ZM43.37,31.12h63.26c3.06,0,4.62,2.51,5.45,5.45l6.52,22.97H31.4l6.52-22.97c.84-2.94,2.39-5.45,5.45-5.45h0ZM34.59,67.37c6.64,0,12.02,5.38,12.02,12.02,0,6.64-5.38,12.02-12.02,12.02h0c-6.64,0-12.02-5.38-12.02-12.02h0c0-6.64,5.38-12.02,12.02-12.02ZM115.42,67.37c6.64,0,12.02,5.38,12.02,12.02,0,6.64-5.38,12.02-12.02,12.02h0c-6.64,0-12.02-5.38-12.02-12.02h0c0-6.64,5.38-12.02,12.02-12.02h0Z" /></svg>
      </p>
      <div class="flex flex-col items-end gap-1 max-sm:items-center">
        <p class="tag whitespace-nowrap">Private Chauffeur · San Diego</p>
        <a v-if="PHONE" :href="PHONE_LINK" class="tag whitespace-nowrap underline underline-offset-4 hover:text-ink">Call or text {{ PHONE }}</a>
      </div>
    </header>

    <main class="flex-1">
      <h1 class="max-w-[14ch] max-sm:mx-auto max-sm:text-center text-[clamp(46px,8vw,88px)] font-display leading-[1] font-semibold tracking-[-0.01em]">Book a ride.</h1>
      <div class="mt-4 flex items-center gap-4 max-sm:justify-center">
        <p class="text-mute">Tesla Model S</p>
        <!-- White Model S, side view (photo with the background removed). -->
        <span class="relative shrink-0">
          <!-- Soft ground shadow under the tires. -->
          <span class="absolute inset-x-[6px] -bottom-[3px] h-[6px] rounded-[50%] bg-black/50 blur-[2.5px]" aria-hidden="true"></span>
          <img src="/tesla-model-s.png" alt="" width="90" height="27" class="relative block w-[90px]" />
        </span>
      </div>

      <div v-if="status === 'sent'" class="mt-14 max-w-[52ch] border-t border-line pt-8" role="status">
        <p class="font-display text-[32px] leading-tight tracking-[-0.01em]">Request sent.</p>
        <p class="mt-3 text-mute">
          {{ prettyDate }} at {{ prettyTime }}, from {{ origin?.label }} to {{ destination?.label }}<template v-if="form.roundTrip">, returning {{ prettyReturn }}</template>.
          I'll confirm shortly, and a copy of your request is on its way to {{ form.email }}.
          <template v-if="PHONE">Questions? Call or text <a :href="PHONE_LINK" class="underline underline-offset-4">{{ PHONE }}</a>.</template>
        </p>
        <button type="button" class="tag mt-8 underline underline-offset-4 hover:text-ink" @click="reset">Book another ride</button>
      </div>

      <form v-else class="mt-8 grid gap-x-16 gap-y-12 md:grid-cols-[minmax(0,1fr)_390px]" novalidate @submit.prevent="submit" @focusout="touched[$event.target.id] = true">
        <fieldset class="grid gap-8">
          <legend class="sr-only">Trip</legend>
          <div class="-mb-2 grid grid-cols-2 gap-3" role="group" aria-label="Trip type">
            <button
              v-for="[round, text] in [[false, 'One-Way Trip'], [true, 'Round Trip']]"
              :key="text"
              type="button"
              class="flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-[17px] transition-colors"
              :class="form.roundTrip === round ? 'border-ink bg-ink text-page' : 'border-line text-mute hover:border-ink hover:text-ink'"
              :aria-pressed="form.roundTrip === round"
              @click="form.roundTrip = round"
            >
              <svg class="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <!-- Round trip: two arrows chasing round a circle. One-way: an arrow pointing right. -->
                <path v-if="round" d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5" />
                <path v-else d="M4 12h16M14 6l6 6-6 6" />
              </svg>
              {{ text }}
            </button>
          </div>
          <PlaceInput id="from" v-model="origin" label="Pickup" :ok="!problems.from" :error="shown('from')" placeholder="Address, hotel, or airport" hint="If your house number does not come up, please put it in the notes." />
          <PlaceInput id="to" v-model="destination" label="Drop-off" :ok="!problems.to" :error="shown('to')" placeholder="Address, hotel, or airport" />
          <div class="grid grid-cols-2 gap-6">
            <div>
              <FieldLabel id="date" text="Date" :ok="!problems['date']" :error="shown('date')" />
              <input id="date" v-model="form.date" v-bind="invalid('date')" type="date" :min="todayLocal()" class="field" required />
            </div>
            <div>
              <FieldLabel id="time" text="Time" :ok="!problems['time']" :error="shown('time')" />
              <select id="time" v-model="form.time" v-bind="invalid('time')" class="field bg-page" :class="{ 'text-[#8a8a8a]': !form.time }" required>
                <option value="" disabled>Select</option>
                <option v-for="t in TIMES" :key="t.value" :value="t.value">{{ t.text }}</option>
              </select>
            </div>
          </div>
          <div v-if="form.roundTrip" class="grid grid-cols-2 gap-6">
            <div>
              <FieldLabel id="return-date" text="Return date" :ok="!problems['return-date']" :error="shown('return-date')" />
              <input id="return-date" v-model="form.returnDate" v-bind="invalid('return-date')" type="date" :min="form.date || todayLocal()" class="field" required />
            </div>
            <div>
              <FieldLabel id="return-time" text="Return time" :ok="!problems['return-time']" :error="shown('return-time')" />
              <select id="return-time" v-model="form.returnTime" v-bind="invalid('return-time')" class="field bg-page" :class="{ 'text-[#8a8a8a]': !form.returnTime }" required>
                <option value="" disabled>Select</option>
                <option v-for="t in TIMES" :key="t.value" :value="t.value" :disabled="!!returnTimeMin && t.value < returnTimeMin">{{ t.text }}</option>
              </select>
            </div>
          </div>
          <div v-if="airportRide">
            <label for="flight" class="field-label">Flight number</label>
            <p id="flight-hint" class="mt-1 text-[14px] leading-snug text-[#8a8a8a]">(Optional. Arriving or departing, so I can follow any delays.)</p>
            <input id="flight" v-model="form.flight" class="field" placeholder="e.g. AS 1234" autocomplete="off" aria-describedby="flight-hint" />
          </div>
          <div>
            <div class="grid max-w-[344px] grid-cols-2 gap-6">
              <div>
                <label for="pax" class="field-label">Passengers</label>
                <select id="pax" v-model.number="form.passengers" class="field bg-page">
                  <option v-for="n in 4" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>
              <div>
                <label for="child-seats" class="field-label">Child seats</label>
                <select id="child-seats" v-model.number="form.childSeats" class="field bg-page">
                  <option v-for="n in maxChildSeats + 1" :key="n" :value="n - 1">{{ n - 1 }}</option>
                </select>
              </div>
            </div>
            <p v-if="form.childSeats" class="mt-3 text-[16px] leading-snug text-mute" role="status">Please add each child's age and weight in the notes, so I bring the right seat.</p>
          </div>
          <div>
            <p class="field-label">Bags</p>
            <div class="mt-2 grid grid-cols-3 gap-6">
              <div v-for="[key, text] in BAGS" :key="key">
                <label :for="`bags-${key}`" class="field-label">{{ text }}</label>
                <select :id="`bags-${key}`" v-model.number="form.bags[key]" class="field bg-page">
                  <option v-for="n in 6" :key="n" :value="n - 1">{{ n - 1 }}</option>
                </select>
              </div>
            </div>
            <p v-if="tooManyBags" class="mt-3 text-[16px] leading-snug text-mute" role="status">That's a lot of luggage for a Model S. I'll check it all fits when I confirm your ride.</p>
          </div>
        </fieldset>

        <!-- Fare: beside the form on desktop, between trip and contact on phones. -->
        <aside class="md:row-span-2 md:self-start md:sticky md:top-8" aria-live="polite">
          <div class="rounded-md border border-line p-6">
            <p class="tag">Estimated fare</p>
            <p class="mt-3 font-display text-[64px] leading-none tracking-[-0.005em] tabular-nums">
              <template v-if="estimate && !inPast">${{ total }}</template>
              <span v-else class="text-[#a3a3a3]">$—</span>
            </p>

            <p v-if="routing" class="mt-4 text-[18px] text-mute">Mapping your route…</p>
            <p v-else-if="routeError" class="mt-4 text-[18px] text-mute">{{ routeError }}</p>
            <p v-else-if="inPast" class="mt-4 text-[18px] text-[#c62828]">That pickup time has already passed.</p>
            <p v-else-if="!estimate" class="mt-4 text-[18px] text-mute">Add pickup, drop-off, date and time{{ form.roundTrip ? ', and the return date and time,' : '' }} to see your fare.</p>

            <div v-if="estimate && !inPast && form.roundTrip" class="mt-6 grid gap-2 border-t border-line pt-5 text-[18px]">
              <div v-for="[text, leg] in [['Ride there', estimate], ['Ride back', inbound]]" :key="text">
                <div class="flex justify-between gap-4">
                  <span class="text-mute">{{ text }}</span><span class="tabular-nums">${{ leg.total }}</span>
                </div>
                <p v-if="leg.factors.length" class="text-[16px] leading-snug text-[#8a8a8a]">{{ leg.factors.map((f) => f.label).join(', ') }}</p>
              </div>
            </div>
            <div v-else-if="estimate && !inPast" class="mt-6 grid gap-2 border-t border-line pt-5 text-[18px]">
              <div v-for="l in estimate.lines" :key="l.label" class="flex justify-between gap-4">
                <span class="text-mute">{{ l.label }}</span><span class="tabular-nums">{{ money(l.amount) }}</span>
              </div>
              <template v-if="estimate.factors.length">
                <p class="tag mt-4">Demand</p>
                <div v-for="f in estimate.factors" :key="f.label" class="flex justify-between gap-4">
                  <span class="text-mute">{{ f.label }}</span><span class="tabular-nums">×{{ f.factor.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between gap-4">
                  <span class="text-mute">Demand adjustment{{ estimate.capped ? ' (capped)' : '' }}</span>
                  <span class="tabular-nums">{{ estimate.demand < 0 ? '−' : '+' }}{{ money(Math.abs(estimate.demand)) }}</span>
                </div>
              </template>
              <div v-if="estimate.airportFee" class="flex justify-between gap-4">
                <span class="text-mute">Airport fee</span><span class="tabular-nums">{{ money(estimate.airportFee) }}</span>
              </div>
              <p v-if="estimate.minimumApplied" class="mt-2 text-mute">Minimum fare of ${{ RATES.minimum }} applies.</p>
            </div>
          </div>
          <p class="mt-4 px-1 text-[16px] leading-snug text-mute">An estimate based on route, time, demand and weather. Your final fare is confirmed before the ride.</p>
        </aside>

        <fieldset class="grid gap-8">
          <legend class="tag mb-6">Contact</legend>
          <div>
            <FieldLabel id="name" text="Name" :ok="!problems['name']" :error="shown('name')" />
            <input id="name" v-model.trim="form.name" v-bind="invalid('name')" class="field" autocomplete="name" required />
          </div>
          <div class="grid gap-8 sm:grid-cols-2 sm:gap-6">
            <div>
              <FieldLabel id="phone" text="Phone" :ok="!problems['phone']" :error="shown('phone')" />
              <input id="phone" v-model.trim="form.phone" v-bind="invalid('phone')" type="tel" class="field" autocomplete="tel" required />
            </div>
            <div>
              <FieldLabel id="email" text="Email" :ok="!problems['email']" :error="shown('email')" />
              <input id="email" v-model.trim="form.email" v-bind="invalid('email')" type="email" class="field" autocomplete="email" required />
            </div>
          </div>
          <div>
            <label for="notes" class="field-label">Notes</label>
            <textarea id="notes" v-model="form.notes" rows="2" class="field resize-none" placeholder="Stops, or anything I should know"></textarea>
          </div>
          <!-- Hidden from people; bots fill it in. -->
          <input v-model="form.honey" type="text" name="_honey" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />

          <div role="radiogroup" aria-labelledby="payment-label" v-bind="invalid('payment')" @focusout="touched.payment = true">
            <p id="payment-label" class="field-label">Payment method<span v-if="problems.payment" class="ml-0.5 text-[#c62828]" aria-hidden="true">*</span></p>
            <p v-if="shown('payment')" id="payment-error" class="text-[14px] leading-snug text-[#c62828]">{{ problems.payment }}</p>
            <div class="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <label v-for="method in PAYMENTS" :key="method" class="flex cursor-pointer items-center gap-3 text-[17px] text-mute">
                <input v-model="form.payment" type="radio" name="payment" :value="method" class="size-5 shrink-0 cursor-pointer accent-ink" required />
                {{ method }}
              </label>
            </div>
          </div>

          <div>
            <p v-if="shown('terms')" id="terms-error" class="text-[14px] leading-snug text-[#c62828]">{{ problems.terms }}</p>
            <label for="terms" class="flex cursor-pointer items-start gap-3 text-[17px] leading-snug text-mute">
              <input id="terms" v-model="form.terms" v-bind="invalid('terms')" type="checkbox" class="mt-0.5 size-5 shrink-0 cursor-pointer accent-ink" required />
              <span>I have read and agree to the Terms of Service, including the payment and cancellation policies.<span v-if="!form.terms" class="ml-0.5 text-[#c62828]" aria-hidden="true">*</span></span>
            </label>
            <button type="button" class="mt-2 ml-8 text-[14px] text-mute underline underline-offset-4 hover:text-ink" @click="termsDialog.open()">See Terms of Service</button>
          </div>

          <div>
            <p v-if="errorText" class="mb-3 text-[14px] leading-snug text-[#c62828]" role="alert">{{ errorText }}</p>
            <button
              type="submit"
              class="min-h-16 w-full rounded-full bg-ink px-9 text-[20px] text-page transition-opacity disabled:opacity-40 sm:w-auto"
              :class="incomplete ? 'opacity-40' : 'hover:opacity-85'"
              :disabled="status === 'sending'"
              :aria-disabled="incomplete"
            >{{ status === 'sending' ? 'Sending…' : 'Request ride' }}</button>
          </div>
        </fieldset>
      </form>
    </main>

    <TermsDialog ref="termsDialog" @agree="form.terms = true" />

    <footer class="tag pt-24 pb-8 text-center">
      <span>&copy; {{ new Date().getFullYear() }} Andy Chen</span>
    </footer>
  </div>
</template>
