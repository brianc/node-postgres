type Props = {
  src: string
  alt?: string
}

export function Logo(props: Props) {
  const alt = props.alt || 'Logo'
  return <img src={props.src} alt={alt} width={100} height={100} style={{ width: 400, height: 'auto' }} />
}
