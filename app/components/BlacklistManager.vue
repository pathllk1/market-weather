<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminService, type BlacklistIp, type BlacklistDevice } from '../services/admin.service'

const ips = ref<BlacklistIp[]>([])
const devices = ref<BlacklistDevice[]>([])
const isLoading = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

// Modal state
const isModalOpen = ref(false)
const blockType = ref<'ip' | 'device'>('ip')
const blockValue = ref('')
const blockDeviceName = ref('')
const blockReason = ref('')
const blockDuration = ref(24) // 24 hours default

async function loadBlacklists() {
  try {
    isLoading.value = true
    error.value = null
    const res = await adminService.getBlacklists()
    ips.value = res.ips
    devices.value = res.devices
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Failed to load blacklists.'
  } finally {
    isLoading.value = false
  }
}

async function handleAdd() {
  if (!blockValue.value) return

  try {
    isLoading.value = true
    error.value = null
    const res = await adminService.addBlacklist({
      type: blockType.value,
      value: blockValue.value,
      deviceName: blockDeviceName.value || undefined,
      reason: blockReason.value || 'Administrator manual security block',
      durationHours: blockDuration.value > 0 ? blockDuration.value : null
    })

    message.value = res.message
    isModalOpen.value = false
    blockValue.value = ''
    blockDeviceName.value = ''
    blockReason.value = ''

    await loadBlacklists()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Failed to add to blacklist.'
  } finally {
    isLoading.value = false
  }
}

async function handleRemove(type: 'ip' | 'device', id: string) {
  try {
    isLoading.value = true
    error.value = null
    const res = await adminService.removeBlacklist(type, id)
    message.value = res.message
    await loadBlacklists()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Failed to remove from blacklist.'
  } finally {
    isLoading.value = false
  }
}

function formatDate(ts: number | null) {
  if (!ts) return 'Permanent'
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  loadBlacklists()
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">IP & Device Access Control</h3>
          <p class="text-xs text-muted">
            Blocked IP addresses and device fingerprints are automatically denied access
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="isLoading"
            @click="loadBlacklists"
          >
            Refresh
          </UButton>
          <UButton
            icon="i-lucide-ban"
            color="error"
            variant="solid"
            size="xs"
            @click="isModalOpen = true"
          >
            Add Access Block
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="message"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="message"
        close
        @update:open="message = null"
      />

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
        close
        @update:open="error = null"
      />

      <div class="space-y-6">
        <!-- IP Blacklist Table -->
        <div>
          <h4 class="text-sm font-semibold mb-2 flex items-center gap-2">
            <UIcon name="i-lucide-network" class="text-primary" />
            Blocked IP Addresses ({{ ips.length }})
          </h4>

          <div v-if="ips.length === 0" class="text-xs text-muted py-2">
            No IP addresses currently blacklisted.
          </div>

          <div v-else class="divide-y divide-default border border-default rounded-md overflow-hidden">
            <div
              v-for="ip in ips"
              :key="ip.id"
              class="p-3 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div class="font-mono font-bold text-sm">{{ ip.ipAddress }}</div>
                <div class="text-muted">
                  Reason: {{ ip.reason }} • Blocked by: {{ ip.blockedBy }} • Expires: {{ formatDate(ip.expiresAt) }}
                </div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                @click="handleRemove('ip', ip.id)"
              >
                Unblock
              </UButton>
            </div>
          </div>
        </div>

        <!-- Device Blacklist Table -->
        <div>
          <h4 class="text-sm font-semibold mb-2 flex items-center gap-2">
            <UIcon name="i-lucide-smartphone" class="text-primary" />
            Blocked Devices ({{ devices.length }})
          </h4>

          <div v-if="devices.length === 0" class="text-xs text-muted py-2">
            No devices currently blacklisted.
          </div>

          <div v-else class="divide-y divide-default border border-default rounded-md overflow-hidden">
            <div
              v-for="dev in devices"
              :key="dev.id"
              class="p-3 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <div class="font-semibold text-sm">{{ dev.deviceName }}</div>
                <div class="font-mono text-muted text-[11px] truncate max-w-md">
                  Fingerprint: {{ dev.deviceFingerprint }}
                </div>
                <div class="text-muted">
                  Reason: {{ dev.reason }} • Expires: {{ formatDate(dev.expiresAt) }}
                </div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                @click="handleRemove('device', dev.id)"
              >
                Unblock
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Blacklist Modal using Nuxt UI UModal -->
    <UModal v-model:open="isModalOpen">
      <template #header>
        <div class="flex items-center justify-between w-full">
          <h3 class="text-base font-bold text-neutral-900 dark:text-white">Blacklist Traffic Source</h3>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="sm"
            class="cursor-pointer -mr-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            aria-label="Close"
            @click="isModalOpen = false"
          />
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <label class="text-xs font-medium">Type:</label>
            <div class="flex items-center gap-2">
              <UButton
                :variant="blockType === 'ip' ? 'solid' : 'ghost'"
                size="xs"
                @click="blockType = 'ip'"
              >
                IP Address
              </UButton>
              <UButton
                :variant="blockType === 'device' ? 'solid' : 'ghost'"
                size="xs"
                @click="blockType = 'device'"
              >
                Device Fingerprint
              </UButton>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">
              {{ blockType === 'ip' ? 'IP Address (e.g. 192.168.1.10)' : 'Device Fingerprint SHA-256' }}
            </label>
            <UInput
              v-model="blockValue"
              :placeholder="blockType === 'ip' ? '203.0.113.42' : 'SHA256 hex string'"
              size="sm"
            />
          </div>

          <div v-if="blockType === 'device'">
            <label class="block text-xs font-medium mb-1">Device Label</label>
            <UInput
              v-model="blockDeviceName"
              placeholder="e.g. Suspicious Automated Script"
              size="sm"
            />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Reason for Blacklist</label>
            <UInput
              v-model="blockReason"
              placeholder="e.g. Repeated malicious attack vector"
              size="sm"
            />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Duration (Hours, 0 for Permanent)</label>
            <UInput
              v-model.number="blockDuration"
              type="number"
              min="0"
              size="sm"
            />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="isModalOpen = false">
            Cancel
          </UButton>
          <UButton color="error" :loading="isLoading" @click="handleAdd">
            Enforce Blacklist
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
