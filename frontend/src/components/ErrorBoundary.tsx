import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'An unexpected runtime error occurred.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-jacket-orange text-[#111] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border-[3px] border-[#111] shadow-brutal-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#E50914]">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <h1 className="font-display-brutal text-xl uppercase text-[#111]">
                Something Interrupted the Reading Room
              </h1>
            </div>
            <p className="text-sm text-[#333] font-medium leading-relaxed">
              The Readers Club encountered an unexpected rendering issue. Your library, reading progress, and saved summaries remain intact.
            </p>
            {this.state.errorMessage && (
              <pre className="p-3 bg-[#F3EFE6] border-2 border-[#111] font-mono-tech text-xs overflow-x-auto text-[#7F1D1D]">
                {this.state.errorMessage}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2.5 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer hover:bg-[#222]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resume Reading Room</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
