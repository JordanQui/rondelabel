<template>
  <main class="label-links-page">
    <ul class="label-links">
      <li v-for="patch in albums" :key="patch.title" class="label-links__item">
        <span class="label-links__name">{{ patch.title }}</span>
        <div class="label-links__destinations">
          <NuxtLink :to="patch.page" class="label-links__link">listen mix</NuxtLink>
        </div>
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
interface AlbumsOnGrid {
  title: string
  page: string
}  

const albums: AlbumsOnGrid[] = [
  {
    title: 'mix novembre 2025',
    page: '/mixes/mix1',
  },
]
</script>

<style scoped>
.label-links-page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-height: 100vh;
  padding: clamp(2rem, 5vw, 4rem);
  background: black;
  color: white;
}

.label-links-page__header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 48rem;
}

.label-links-page__title {
  margin: 0;
  font-size: clamp(2.5rem, 6vw, 3.5rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.label-links-page__subtitle {
  margin: 0;
  font-size: clamp(1rem, 2.5vw, 1.2rem);
  opacity: 0.75;
}

.label-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.label-links__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  padding-bottom: 1rem;
}

.label-links__name {
  font-size: 1.15rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.label-links__destinations {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.label-links__link {
  color: white;
  text-decoration: none;
  font-size: 1rem;
}

.label-links__link:hover,
.label-links__link:focus-visible {
  text-decoration: underline;
  outline: none;
}

.label-links__separator {
  opacity: 0.5;
}
</style>
