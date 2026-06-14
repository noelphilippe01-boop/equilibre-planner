import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <h2>Impossible d&apos;afficher cette page</h2>
          <p style={{ color: 'var(--danger)' }}>{this.state.error.message}</p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => this.setState({ error: null })}
          >
            Reessayer
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
