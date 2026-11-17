<!-- The same screen, expressed lawfully: composition and content, no decisions. -->
<script setup lang="ts">
import { Button, Icon, Stack, Table } from '@polymorph/vue-ui'

interface Ticket {
  id: string
  title: string
}

defineProps<{ tickets: Ticket[]; onArchive: () => void }>()
</script>

<template>
  <Stack :gap="4" :p="5">
    <Button variant="solid" tone="accent" label="Archive" @click="onArchive">
      <Icon name="archive" />
    </Button>
    <Table :rows="tickets" />
    <data-table label="Tickets" :rows="tickets" />
  </Stack>
</template>
