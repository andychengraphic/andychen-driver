<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { cachedGuess, searchPlaces, warmUp } from '../geo'

// Address field with suggestions. v-model holds the chosen place ({ label, lat, lon }) or null.
// `hint` is an optional note shown above the field; `ok` and `error` work as in FieldLabel.
const props = defineProps({ id: String, label: String, placeholder: String, hint: String, ok: Boolean, error: String })
const place = defineModel({ default: null })

// Starts from the chosen place, so a kept address (after "Book another ride") shows in the field.
const text = ref(place.value?.label ?? '')
const results = ref([])
const open = ref(false)
const active = ref(-1)
let timer, latest = 0

// The field is a textarea so a long address wraps instead of being cut off. It grows to fit its
// text and never takes a line break (Enter picks a suggestion; pasted line breaks become spaces).
const box = ref(null)
function fit() {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}
watch(text, () => nextTick(fit))
onMounted(() => { fit(); addEventListener('resize', fit) })
onUnmounted(() => removeEventListener('resize', fit))

function show(list) {
  results.value = list
  open.value = list.length > 0
  active.value = -1
}

// Suggestions appear at once from earlier answers where possible, then the server's answer
// replaces them. Answers to queries the user has typed past are ignored, not cancelled.
watch(text, (q) => {
  if (/[\r\n]/.test(q)) { text.value = q.replace(/\s*[\r\n]+\s*/g, ' '); return }
  if (place.value && q === place.value.label) return
  place.value = null
  clearTimeout(timer)
  if (q.trim().length < 3) { latest++; show([]); return }
  const guess = cachedGuess(q.trim())
  if (guess.length) show(guess)
  timer = setTimeout(async () => {
    const mine = ++latest
    try {
      const list = await searchPlaces(q.trim(), (partial) => { if (mine === latest && partial.length) show(partial) })
      if (mine === latest) show(list)
    } catch {
      // Network hiccup: keep whatever is showing.
    }
  }, 120)
})

function choose(p) {
  place.value = p
  text.value = p.label
  open.value = false
}

function onKey(e) {
  if (e.key === 'Enter' && !(open.value && active.value >= 0)) { e.preventDefault(); return }
  if (!open.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % results.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length }
  else if (e.key === 'Enter' && active.value >= 0) { e.preventDefault(); choose(results.value[active.value]) }
  else if (e.key === 'Escape') open.value = false
}
</script>

<template>
  <div>
    <label :for="id" class="field-label">{{ label }}<span v-if="!ok" class="ml-0.5 text-[#c62828]" aria-hidden="true">*</span></label>
    <p v-if="hint" :id="`${id}-hint`" class="mt-1 text-[14px] leading-snug text-[#8a8a8a]">({{ hint }})</p>
    <p v-if="error" :id="`${id}-error`" class="text-[14px] leading-snug text-[#c62828]">{{ error }}</p>
    <div class="relative">
    <textarea
      :id="id"
      ref="box"
      v-model="text"
      rows="1"
      class="field block resize-none overflow-hidden"
      :placeholder="placeholder"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-describedby="[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined"
      :aria-invalid="error ? 'true' : undefined"
      required
      @keydown="onKey"
      @blur="open = false"
      @focus="warmUp(); open = results.length > 0 && !place"
    ></textarea>
    <ul
      v-if="open"
      :id="`${id}-list`"
      role="listbox"
      class="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-field"
    >
      <li
        v-for="(r, i) in results"
        :key="r.label"
        role="option"
        :aria-selected="i === active"
        class="cursor-pointer px-4 py-3.5 text-[18px] leading-snug"
        :class="i === active ? 'bg-line' : 'hover:bg-line'"
        @mousedown.prevent="choose(r)"
      >{{ r.label }}</li>
    </ul>
    </div>
  </div>
</template>
