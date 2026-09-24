<template>
  <q-page class="tea-cabinet" data-testid="cabinet-page">
    <div class="tea-cabinet__header">
      <span class="tea-cabinet__title">Cabinet</span>
    </div>
  </q-page>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.tea-cabinet {
  background: #17120e;
  min-height: 100%;
}
.tea-cabinet__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 20px 18px 16px;
}
.tea-cabinet__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
</style>
