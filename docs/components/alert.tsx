import { Callout } from 'nextra/components'

export const Alert = ({ children }) => {
  return (
    <Callout type="warning" emoji="⚠️">
      {children}
    </Callout>
  )
}
