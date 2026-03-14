import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0f1c",
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#00D4FF" }}>
              حدث خطأ غير متوقع
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              نعتذر عن هذا الخطأ. يرجى تحديث الصفحة أو المحاولة لاحقاً.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "0.75rem 2rem",
                background: "#00D4FF",
                color: "#0a0f1c",
                border: "none",
                borderRadius: "0.5rem",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              تحديث الصفحة
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre
                style={{
                  marginTop: "2rem",
                  textAlign: "left",
                  direction: "ltr",
                  fontSize: "0.75rem",
                  color: "#ef4444",
                  background: "#1e293b",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  overflow: "auto",
                  maxHeight: 200,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
