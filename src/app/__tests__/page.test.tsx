import { render, screen } from '@testing-library/react'
import HomePage from '../page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123',
  },
})

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the Werewolf Lobby title', () => {
    render(<HomePage />)
    expect(screen.getByText('Werewolf Lobby')).toBeInTheDocument()
  })

  it('renders name input field', () => {
    render(<HomePage />)
    const nameInput = screen.getByPlaceholderText('Villager name')
    expect(nameInput).toBeInTheDocument()
  })

  it('renders host game button', () => {
    render(<HomePage />)
    expect(screen.getByText('Host new game')).toBeInTheDocument()
  })

  it('renders join game button', () => {
    render(<HomePage />)
    expect(screen.getByText('Join game')).toBeInTheDocument()
  })

  it('renders game code input field', () => {
    render(<HomePage />)
    const codeInput = screen.getByPlaceholderText('ABCD12')
    expect(codeInput).toBeInTheDocument()
  })
})