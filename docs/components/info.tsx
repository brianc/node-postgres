import React from 'react'
import { Callout } from 'nextra-theme-docs'

export const Info = ({ children }) => {
  return <Callout emoji="ℹ️">{children}</Callout>
}
