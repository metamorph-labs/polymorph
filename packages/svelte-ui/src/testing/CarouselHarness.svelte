<script lang="ts">
  /**
   * A Carousel in a box 320px wide, for `structure/carousel.test.ts`. Every
   * prop is passed to the Carousel.
   */
  import Carousel, { type CarouselProps } from '../structure/Carousel.svelte'

  let props: CarouselProps = $props()
</script>

<div style:inline-size="320px"><Carousel {...props} /></div>
