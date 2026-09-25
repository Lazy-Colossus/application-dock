<template>
  <div class="add" data-testid="add-node">
    <div class="add__grab"></div>
    <p class="add__title">Add to {{ parentLabel }}</p>

    <label class="add__label" for="node-name">Name</label>
    <input id="node-name" v-model="name" class="add__field" data-testid="node-name" />

    <label class="add__label" for="node-zh">Chinese <span>optional</span></label>
    <input id="node-zh" v-model="nameZh" class="add__field" lang="zh" data-testid="node-zh" />

    <label class="add__label" for="node-origin">Usually from <span>optional</span></label>
    <input id="node-origin" v-model="origin" class="add__field" data-testid="node-origin" />

    <p class="add__note">
      Everyone's catalogue starts the same; what you add is yours alone, and the teas that ship with
      the app are never changed by it.
    </p>

    <button class="add__save" data-testid="node-save" :disabled="!name.trim()" @click="create">
      Add to catalogue
    </button>
    <button class="add__cancel" data-testid="node-cancel" @click="emit('cancel')">Cancel</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{ parentLabel: string }>();
const emit = defineEmits<{
  create: [payload: { name: string; name_zh: string; default_origin: string }];
  cancel: [];
}>();

const name = ref("");
const nameZh = ref("");
const origin = ref("");

function create(): void {
  if (!name.value.trim()) return;
  emit("create", {
    name: name.value.trim(),
    name_zh: nameZh.value.trim(),
    default_origin: origin.value.trim(),
  });
}
</script>

<style scoped lang="scss">
.add {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px 24px;
}
.add__grab {
  width: 34px;
  height: 3px;
  background: #3b3026;
  border-radius: 2px;
  margin: 0 auto 14px;
}
.add__title {
  color: #9a8b78;
  font-size: 13px;
  margin: 0 0 14px;
}
.add__label {
  display: block;
  color: #6b5f52;
  font-size: 11.5px;
  padding-top: 14px;
  padding-bottom: 5px;
}
.add__label span {
  color: #5e5445;
}
.add__field {
  width: 100%;
  background: #241c16;
  border: 1px solid #3b3026;
  border-radius: 3px;
  padding: 11px 12px;
  color: #efe7da;
  font-size: 15px;
  font-family: inherit;
}
.add__note {
  color: #7a6d5e;
  font-size: 12.5px;
  border-top: 1px solid #2a231c;
  margin-top: 20px;
  padding-top: 14px;
}
.add__save {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.add__save:disabled {
  opacity: 0.4;
  cursor: default;
}
.add__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
