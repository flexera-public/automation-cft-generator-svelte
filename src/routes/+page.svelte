<script lang="ts">
import PolicySelector from '$lib/PolicySelector.svelte';

let cloudFormationTemplate = '';

</script>

<main class="container mx-auto px-4 py-8 max-w-4xl">
    <h1 class="text-3xl font-bold text-gray-800 mb-6">CloudFormation Template Generator</h1>

    <PolicySelector />

    <p class="text-sm text-gray-500 mt-4 text-center">Created as a 2024 Hackathon Project by <a href="https://github.com/bryankaraffa/" target="_blank">@bryankaraffa</a> while working at <a href="https://www.flexera.com/">Flexera</a></p>
</main>

<style>
main {
    padding: 1em;
    margin: auto;
}
a {
  text-decoration: underline;
  font-style: italic;
}
</style>
