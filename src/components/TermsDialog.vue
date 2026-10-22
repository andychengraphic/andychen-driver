<script setup>
import { ref } from 'vue'
import { RATES } from '../pricing'

// The Terms of Service in a pop-up. Call open(); "Agree and close" emits `agree`.
// Update TERMS_UPDATED whenever the wording changes: booking emails record which version was accepted.
const emit = defineEmits(['agree'])
const dialog = ref(null)
const open = () => dialog.value.showModal()
const close = () => dialog.value.close()
function agree() { emit('agree'); close() }
defineExpose({ open })

const waitRate = (RATES.perMinute * 60).toFixed(0)
</script>

<script>
export const TERMS_UPDATED = 'October 22, 2026'
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="terms-title"
    class="m-auto max-h-[85dvh] w-[calc(100%-32px)] max-w-[640px] overflow-y-auto rounded-md bg-page p-0 text-ink backdrop:bg-black/40"
    @click.self="close"
  >
    <div class="p-6 sm:p-8">
      <div class="flex items-baseline justify-between gap-4">
        <h2 id="terms-title" class="font-display text-[28px] leading-tight outline-none" tabindex="-1" autofocus>Terms of Service</h2>
        <button type="button" class="tag underline underline-offset-4 hover:text-ink" @click="close">Close</button>
      </div>
      <p class="mt-1 text-[14px] text-[#8a8a8a]">Last updated {{ TERMS_UPDATED }}</p>

      <div class="terms mt-6 grid gap-5 text-[16px] leading-snug text-mute">
        <section>
          <h3>1. Booking</h3>
          <p>Sending this form is a request, not a confirmed booking. A ride is booked once Andy Chen ("the driver") confirms it with you by text or email. Every booking is for your party's private use of the vehicle.</p>
        </section>

        <section>
          <h3>2. Fares</h3>
          <p>The fare shown on this site is an estimate. The driver confirms a fare in writing before the ride, and that confirmed fare is what you pay, unless you change the trip: added stops, a different route or destination, waiting beyond the free time below, or tolls and parking you ask for. Gratuity is not included and is always optional.</p>
        </section>

        <section>
          <h3>3. Payment</h3>
          <ul>
            <li>Payment is due at the end of the ride, by credit card, cash or Zelle, using the method you chose when booking.</li>
            <li>For round trips, long trips or late-night pickups, the driver may ask for a card on file or a deposit, paid by credit card or Zelle. A deposit counts toward your fare and is refunded under the cancellation terms below.</li>
            <li>You'll get a receipt for every payment. Any extra charge (waiting, cleaning, damage) is explained in writing, with photos where relevant, before it is charged.</li>
            <li>If you think a charge is wrong, tell the driver within 7 days. You'll get a reply within 3 business days, and any amount charged in error is refunded in full.</li>
            <li>Unpaid amounts are due within 7 days. The driver may decline future bookings until they are paid.</li>
          </ul>
        </section>

        <section>
          <h3>4. Cancellations and changes</h3>
          <ul>
            <li>More than 24 hours before pickup: free.</li>
            <li>2 to 24 hours before pickup: 50% of the confirmed fare.</li>
            <li>Less than 2 hours before pickup, or a no-show: the full confirmed fare.</li>
            <li>On a round trip, each ride can be cancelled separately under these same terms.</li>
            <li>If the driver cancels or can't make your ride, you pay nothing and any deposit is refunded in full. If the driver is more than 15 minutes late through no fault of yours, you may cancel at no charge.</li>
          </ul>
        </section>

        <section>
          <h3>5. Waiting time and no-shows</h3>
          <p>Pickups include 15 minutes of free waiting. Airport pickups include 30 minutes from when your flight actually lands (give your flight number and delays are tracked). After that, waiting is charged at ${{ waitRate }} per hour, by the minute. If you can't be reached 30 minutes after the pickup time (60 minutes after landing at the airport), the ride counts as a no-show.</p>
        </section>

        <section>
          <h3>6. Passengers, luggage and conduct</h3>
          <ul>
            <li>Up to 4 passengers, and only the luggage that fits safely. Everyone must wear a seat belt.</li>
            <li>California law requires car seats for young children. Please bring your own unless arranged in advance.</li>
            <li>No smoking, vaping, illegal drugs or open alcohol in the vehicle. Service animals are always welcome; other pets by prior arrangement.</li>
            <li>The driver may refuse or end a ride for unsafe, illegal or abusive behavior. The fare up to that point still applies.</li>
          </ul>
        </section>

        <section>
          <h3>7. Cleaning and damage</h3>
          <p>A cleaning fee of up to $150 applies if the vehicle needs professional cleaning (for example, after vomit or a major spill). Damage caused by a passenger is charged at the actual cost of repair. Both are documented with photos and receipts.</p>
        </section>

        <section>
          <h3>8. Delays and liability</h3>
          <p>The driver plans routes with care but isn't responsible for delays caused by traffic, weather, road closures, accidents or flight changes. For flights, allow at least 2 hours at the airport for domestic flights and 3 for international. Except where the law doesn't allow it, the driver's liability for a delay or missed connection is limited to the fare you paid for that ride.</p>
        </section>

        <section>
          <h3>9. Lost items</h3>
          <p>Items left in the vehicle are kept for 30 days. They can be picked up, or returned at your cost.</p>
        </section>

        <section>
          <h3>10. Privacy</h3>
          <p>Your name, contact details and trip details are used only to arrange and run your ride, and to keep the records the law requires. They are never sold or shared for marketing.</p>
        </section>

        <section>
          <h3>11. General</h3>
          <p>These terms are governed by California law, with any dispute handled in San Diego County. The terms in effect when you book apply to that booking.</p>
        </section>
      </div>

      <button
        type="button"
        class="mt-8 min-h-14 w-full rounded-full bg-ink px-8 text-[18px] text-page transition-opacity hover:opacity-85 sm:w-auto"
        @click="agree"
      >Agree and close</button>
    </div>
  </dialog>
</template>

<style scoped>
.terms h3 { color: var(--color-ink); font-size: 17px; margin-bottom: 4px; }
.terms ul { list-style: disc; padding-left: 1.25em; display: grid; gap: 4px; }
</style>
