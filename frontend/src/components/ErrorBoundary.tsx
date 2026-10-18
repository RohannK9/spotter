import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean; version: number }
> {
  state = { failed: false, version: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="empty-state">
          <h3>Something went wrong displaying {this.props.label}.</h3>
          <button
            className="secondary-button"
            onClick={() =>
              this.setState(({ version }) => ({
                failed: false,
                version: version + 1,
              }))
            }
          >
            Try again
          </button>
        </div>
      );
    return (
      <div key={this.state.version} className="boundary-content">
        {this.props.children}
      </div>
    );
  }
}
