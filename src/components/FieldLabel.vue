<script setup>
// A field's label, with a red asterisk until the field is filled in properly, and the field's
// problem (if any) in small red text just above it.
defineProps({ id: String, text: String, ok: Boolean, error: String })
</script>

<template>
  <label :for="id" class="field-label">{{ text }}<span v-if="!ok" class="ml-0.5 text-[#c62828]" aria-hidden="true">*</span></label>
  <p v-if="error" :id="`${id}-error`" class="text-[14px] leading-snug text-[#c62828]">{{ error }}</p>
</template>
