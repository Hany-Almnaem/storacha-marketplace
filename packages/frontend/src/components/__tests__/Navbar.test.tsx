import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

describe('Navbar navigation links', () => {
  const navbarPath = join(__dirname, '../Navbar.tsx')
  const navbarSource = readFileSync(navbarPath, 'utf-8')

  it('includes My Purchases link to /purchases', () => {
    expect(navbarSource).toContain("href: '/purchases'")
    expect(navbarSource).toContain('My Purchases')
  })

  it('includes My Listings link to /sell', () => {
    expect(navbarSource).toContain("href: '/sell'")
    expect(navbarSource).toContain('My Listings')
  })

  it('renders desktop and mobile navigation containers', () => {
    expect(navbarSource).toContain('md:flex')
    expect(navbarSource).toContain('md:hidden')
  })
})
