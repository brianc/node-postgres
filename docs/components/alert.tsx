import React from 'react'
import { Callout } from 'nextra-theme-docs'

export const Alert = ({ children }) => {
  return (
    <Callout type="warning" emoji="⚠️">
      {children}
    </Callout>
  )
}
