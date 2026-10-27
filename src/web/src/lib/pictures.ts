/** A picture in public/, at 768 and 1536 px wide: `picture('home/join')`. */
export function picture(name: string) {
  return {
    src: `/${name}-1536.webp`,
    srcSet: `/${name}-768.webp 768w, /${name}-1536.webp 1536w`,
  }
}
