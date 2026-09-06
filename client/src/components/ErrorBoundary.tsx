import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

interface Props {
  children: ReactNode;
  t: (key: string, fallback: string, variables?: Record<string, any>) => string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class PipelineErrorBoundaryBase extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Pipeline error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="max-w-md w-full mx-4 p-6 bg-card border border-border rounded-lg shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <h2 className="text-xl font-semibold">{t('common.error_boundary.title', 'Something went wrong')}</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              {t('common.error_boundary.description', 'An error occurred while loading the pipeline. Please try again or go back to the dashboard.')}
            </p>
            {this.state.error && (
              <details className="mb-4 p-3 bg-muted rounded text-sm">
                <summary className="cursor-pointer font-medium mb-2">{t('common.error_boundary.error_details', 'Error details')}</summary>
                <pre className="mt-2 text-xs overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-3">
              <Button onClick={this.handleReset} variant="default">
                {t('common.error_boundary.try_again', 'Try Again')}
              </Button>
              <Button
                onClick={() => {
                  window.location.href = '/';
                }}
                variant="outline"
              >
                {t('common.error_boundary.go_back', 'Go Back')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function PipelineErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <PipelineErrorBoundaryBase t={t}>{children}</PipelineErrorBoundaryBase>;
}
